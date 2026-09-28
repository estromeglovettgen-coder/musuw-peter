package service

import (
	"errors"
	"fmt"
	"testing"

	"github.com/Tencent/WeKnora/internal/infrastructure/tikhub"
	"github.com/stretchr/testify/require"
)

func TestSocialImportShouldRetryOnlyOnceForTransientFailures(t *testing.T) {
	t.Parallel()

	transient := []error{
		errors.New("TikHub request failed"),
		errors.New("TikHub request returned HTTP 503"),
		errors.New("failed to fetch TikHub media"),
		errors.New("failed to persist social artifact: temporary storage error"),
	}
	for _, err := range transient {
		require.Truef(t, socialImportShouldRetry(err, 0), "first delivery should retry: %v", err)
		require.Falsef(t, socialImportShouldRetry(err, 1), "second delivery must be terminal: %v", err)
	}
}

func TestSocialImportShouldNotRetryDeterministicFailures(t *testing.T) {
	t.Parallel()

	deterministic := []error{
		errTikHubNotConfigured,
		fmt.Errorf("wrapped: %w", tikhub.ErrMissingAPIKey),
		fmt.Errorf("wrapped: %w", tikhub.ErrMissingRouteValue),
		errSocialVideoNotAllowed,
		fmt.Errorf("wrapped: %w", errSocialVideoTooLarge),
		fmt.Errorf("wrapped: %w", errSocialVideoFormatUnsupported),
		fmt.Errorf("wrapped: %w", errSocialMediaURLUnsafe),
	}
	for _, err := range deterministic {
		require.Falsef(t, socialImportShouldRetry(err, 0), "deterministic failure should not retry: %v", err)
	}
}
