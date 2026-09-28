package router

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/Tencent/WeKnora/internal/types"
	"github.com/hibiken/asynq"
)

func TestSyncTaskExecutorInjectsRetryMetadata(t *testing.T) {
	executor := NewSyncTaskExecutor()
	observed := make(chan [2]int, 1)
	executor.RegisterHandler("test:retry-metadata", func(ctx context.Context, _ *asynq.Task) error {
		retried, maxRetry, ok := types.TaskRetryMetadataFromContext(ctx)
		if !ok {
			observed <- [2]int{-1, -1}
			return nil
		}
		observed <- [2]int{retried, maxRetry}
		return nil
	})

	task := asynq.NewTask("test:retry-metadata", nil)
	if _, err := executor.Enqueue(task, asynq.MaxRetry(3)); err != nil {
		t.Fatalf("enqueue: %v", err)
	}

	select {
	case got := <-observed:
		if got != [2]int{0, 3} {
			t.Fatalf("retry metadata = %v, want [0 3]", got)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for sync task")
	}
}

func TestSyncTaskExecutorHonorsDeterministicTaskIDWhileInFlight(t *testing.T) {
	executor := NewSyncTaskExecutor()
	started := make(chan struct{}, 1)
	release := make(chan struct{})
	done := make(chan struct{}, 1)
	executor.RegisterHandler("test:dedupe", func(context.Context, *asynq.Task) error {
		started <- struct{}{}
		<-release
		done <- struct{}{}
		return nil
	})
	task := asynq.NewTask("test:dedupe", nil)
	opts := []asynq.Option{asynq.TaskID("stable-id"), asynq.MaxRetry(0)}

	info, err := executor.Enqueue(task, opts...)
	if err != nil {
		t.Fatalf("first enqueue: %v", err)
	}
	if info.ID != "stable-id" {
		t.Fatalf("task id = %q, want stable-id", info.ID)
	}
	select {
	case <-started:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for first task")
	}
	if _, err := executor.Enqueue(task, opts...); !errors.Is(err, asynq.ErrTaskIDConflict) {
		t.Fatalf("second enqueue error = %v, want task ID conflict", err)
	}
	close(release)
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for first task completion")
	}

	deadline := time.Now().Add(2 * time.Second)
	for {
		if _, err := executor.Enqueue(task, opts...); err == nil {
			break
		} else if !errors.Is(err, asynq.ErrTaskIDConflict) {
			t.Fatalf("enqueue after completion: %v", err)
		}
		if time.Now().After(deadline) {
			t.Fatal("task ID was not released after completion")
		}
		time.Sleep(10 * time.Millisecond)
	}
}

func TestSyncTaskExecutorHonorsSkipRetry(t *testing.T) {
	executor := NewSyncTaskExecutor()
	attempts := make(chan int, 4)
	executor.RegisterHandler("test:skip-retry", func(ctx context.Context, _ *asynq.Task) error {
		retried, _, _ := types.TaskRetryMetadataFromContext(ctx)
		attempts <- retried
		return errors.Join(asynq.SkipRetry, errors.New("permanent failure"))
	})

	const taskID = "skip-retry-id"
	if _, err := executor.Enqueue(
		asynq.NewTask("test:skip-retry", nil),
		asynq.TaskID(taskID),
		asynq.MaxRetry(3),
	); err != nil {
		t.Fatalf("enqueue: %v", err)
	}

	select {
	case got := <-attempts:
		if got != 0 {
			t.Fatalf("attempt = %d, want 0", got)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for sync task")
	}

	// A normal retry keeps the deterministic task ID in flight while the
	// executor sleeps for its five-second backoff. SkipRetry must release it
	// promptly, which proves the loop stopped rather than merely observing a
	// short retry-free window.
	deadline := time.Now().Add(2 * time.Second)
	for {
		executor.mu.RLock()
		_, inFlight := executor.inFlight[taskID]
		executor.mu.RUnlock()
		if !inFlight {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("SkipRetry task remained in flight, likely waiting to retry")
		}
		time.Sleep(10 * time.Millisecond)
	}
	select {
	case got := <-attempts:
		t.Fatalf("unexpected retry attempt %d", got)
	case <-time.After(150 * time.Millisecond):
	}
}
