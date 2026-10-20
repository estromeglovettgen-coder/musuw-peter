"""Durable task behavior with a fake provider; never uses credentials."""
import tempfile
import unittest
import uuid
import multiprocessing
import os
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import patch

from generation_tasks import GenerationStore, GenerationWorker, TaskConflict
from modelflare_adapter import ProviderError

PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC"


def process_worker(root, count, started, release):
    store = GenerationStore(root)
    def submit(prepared):
        with count.get_lock():
            count.value += 1
        started.set()
        release.wait(5)
        return {"images": ["data:image/png;base64," + PNG], "model": "fake", "size": "1024x1024"}
    GenerationWorker(store, lambda payload, resolve: {"body": {"prompt": "prepared"}}, submit).run_once()


class DurableGenerationTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.store = GenerationStore(Path(self.directory.name) / "private")
        self.asset = self.store.add_asset("data:image/png;base64," + PNG, "portrait.png")

    def tearDown(self):
        self.directory.cleanup()

    def payload(self):
        return {"promptMode": "default", "modelChoice": "modelflare-image25-sunburst", "count": 1,
                "size": "1k", "layoutHints": {"ratio": "方形 1:1"}, "images": [
                    {"id": "person", "assetId": self.asset["id"], "roles": ["face"]},
                    {"id": "scene", "assetId": self.asset["id"], "roles": ["background"]}]}

    def test_same_key_is_stable_changed_input_conflicts_and_restart_preserves_task(self):
        key = str(uuid.uuid4())
        task = self.store.enqueue(key, self.payload())
        self.assertEqual(task["status"], "queued")
        self.assertEqual(self.store.enqueue(key, self.payload())["id"], task["id"])
        changed = self.payload()
        changed["poseStrict"] = False
        with self.assertRaises(TaskConflict):
            self.store.enqueue(key, changed)
        reopened = GenerationStore(self.store.root)
        self.assertEqual(reopened.get_task(task["id"])["status"], "queued")

    def worker(self, calls, submit=None):
        def fake_submit(prepared):
            self.assertEqual(self.store.get_task(prepared["taskId"])["status"], "submitting")
            calls.append(prepared)
            if submit:
                return submit(prepared)
            return {"images": ["data:image/png;base64," + PNG], "model": "fake", "size": "1024x1024"}
        return GenerationWorker(self.store, lambda payload, resolve: {"taskId": self.store.list_tasks()[0]["id"], "body": {"prompt": "prepared"}}, fake_submit)

    def test_active_alias_survives_success_and_new_intent_can_create_next_task(self):
        first_key, alias_key = str(uuid.uuid4()), str(uuid.uuid4())
        first = self.store.enqueue(first_key, self.payload())
        alias = self.store.enqueue(alias_key, self.payload())
        self.assertEqual(first["id"], alias["id"])
        calls = []
        self.worker(calls).run_once()
        self.assertEqual(len(calls), 1)
        self.assertEqual(self.store.get_task(first["id"])["status"], "succeeded")
        self.assertEqual(self.store.enqueue(alias_key, self.payload())["id"], first["id"])
        self.assertEqual(set(self.store.get_task(first["id"])["idempotencyKeys"]), {first_key, alias_key})
        self.assertNotEqual(self.store.enqueue(str(uuid.uuid4()), self.payload())["id"], first["id"])

    def test_nonsemantic_client_metrics_cannot_bypass_active_deduplication(self):
        first = self.store.enqueue(str(uuid.uuid4()), {**self.payload(), "clientMetrics": {"preparationMs": 1}})
        second = self.store.enqueue(str(uuid.uuid4()), {**self.payload(), "clientMetrics": {"preparationMs": 999}})
        self.assertEqual(first["id"], second["id"])
        self.assertNotIn("clientMetrics", self.store.snapshot(first["id"]))

    def test_concurrent_distinct_intents_all_keep_aliases_after_success(self):
        keys = [str(uuid.uuid4()) for unused in range(8)]
        with ThreadPoolExecutor(max_workers=4) as pool:
            tasks = list(pool.map(lambda key: self.store.enqueue(key, self.payload()), keys))
        self.assertEqual(len({task["id"] for task in tasks}), 1)
        calls = []
        self.worker(calls).run_once()
        for key in keys:
            self.assertEqual(self.store.enqueue(key, self.payload())["id"], tasks[0]["id"])
        self.assertEqual(len(calls), 1)
        self.assertEqual(len(self.store.list_tasks()), 1)

    def test_targeted_execution_does_not_consume_other_queued_intents(self):
        earlier = self.store.enqueue(str(uuid.uuid4()), self.payload())
        other_payload = {**self.payload(), "promptMode": "custom", "prompt": "只执行这一个已授权任务", "images": []}
        selected = self.store.enqueue(str(uuid.uuid4()), other_payload)
        calls = []
        worker = self.worker(calls)
        self.assertTrue(worker.run_once(selected["id"]))
        self.assertEqual(self.store.get_task(earlier["id"])["status"], "queued")
        self.assertEqual(self.store.get_task(selected["id"])["status"], "succeeded")
        self.assertFalse(worker.run_once(selected["id"]))
        self.assertEqual(len(calls), 1)

    def test_unknown_submission_is_quarantined_after_restart_without_retry(self):
        task = self.store.enqueue(str(uuid.uuid4()), self.payload())
        self.store.mark(task["id"], "submitting")
        calls = []
        worker = self.worker(calls)
        worker.recover()
        self.assertEqual(self.store.get_task(task["id"])["status"], "unknown")
        self.assertFalse(self.store.get_task(task["id"])["canRetry"])
        self.assertFalse(worker.run_once())
        self.assertEqual(calls, [])
        self.assertEqual(self.store.enqueue(str(uuid.uuid4()), self.payload())["id"], task["id"])
        with self.assertRaises(TaskConflict):
            self.store.retry(task["id"], str(uuid.uuid4()))

    def test_explicit_rejection_allows_one_new_retry_and_retry_key_replays(self):
        task = self.store.enqueue(str(uuid.uuid4()), self.payload())
        calls = []
        def rejected(prepared):
            raise ProviderError(413, code="request_too_large", request_id="req_1", outcome="rejected")
        self.worker(calls, rejected).run_once()
        failed = self.store.get_task(task["id"])
        self.assertEqual(failed["status"], "failed")
        self.assertTrue(failed["canRetry"])
        self.assertEqual(failed["error"]["requestId"], "req_1")
        retry_key = str(uuid.uuid4())
        retry = self.store.retry(task["id"], retry_key)
        self.assertNotEqual(retry["id"], task["id"])
        self.assertEqual(retry["retryOf"], task["id"])
        self.worker(calls).run_once()
        self.assertEqual(self.store.retry(task["id"], retry_key)["id"], retry["id"])
        self.assertEqual(len(calls), 2)

    def test_response_journal_recovers_local_save_without_second_provider_call(self):
        task = self.store.enqueue(str(uuid.uuid4()), self.payload())
        calls = []
        with patch.object(self.store, "save_result", side_effect=OSError("disk unavailable")):
            self.worker(calls).run_once()
        failed = self.store.get_task(task["id"])
        self.assertEqual(failed["status"], "failed")
        self.assertTrue(failed["error"]["localResultAvailable"])
        reopened = GenerationStore(self.store.root)
        GenerationWorker(reopened, lambda *args: self.fail("Recovery prepared provider request"),
                         lambda *args: self.fail("Recovery sent provider request")).recover()
        self.assertEqual(reopened.get_task(task["id"])["status"], "succeeded")
        self.assertEqual(len(calls), 1)

    def test_explicit_local_save_retry_replays_same_task_without_resubmission(self):
        task = self.store.enqueue(str(uuid.uuid4()), self.payload())
        calls = []
        with patch.object(self.store, "save_result", side_effect=OSError("disk unavailable")):
            self.worker(calls).run_once()
        key = str(uuid.uuid4())
        restored = self.store.retry(task["id"], key)
        self.assertEqual(restored["id"], task["id"])
        self.assertEqual(restored["status"], "succeeded")
        self.assertEqual(self.store.retry(task["id"], key)["id"], task["id"])
        self.assertEqual(len(calls), 1)

    def test_preparing_restart_is_safe_to_queue_again(self):
        task = self.store.enqueue(str(uuid.uuid4()), self.payload())
        self.store.mark(task["id"], "preparing")
        calls = []
        worker = self.worker(calls)
        worker.recover()
        self.assertEqual(self.store.get_task(task["id"])["status"], "queued")
        self.assertEqual(calls, [])
        worker.run_once()
        self.assertEqual(len(calls), 1)
        self.assertEqual(self.store.get_task(task["id"])["status"], "succeeded")

    def test_compiled_prompt_is_frozen_across_builder_change_restart_and_retry(self):
        key = str(uuid.uuid4())
        task = self.store.enqueue(key, self.payload())
        calls = []
        def rejected(prepared):
            raise ProviderError(422, code="invalid_parameter", outcome="rejected")
        with patch("generation_tasks.build_prompt", return_value="NEW SYSTEM RULES"):
            reopened = GenerationStore(self.store.root)
            self.assertEqual(reopened.enqueue(key, self.payload())["id"], task["id"])
            self.worker(calls, rejected).run_once()
            self.assertNotEqual(calls[0]["body"]["prompt"], "NEW SYSTEM RULES")
            self.assertIn("整体协调规则", calls[0]["body"]["prompt"])
            retry = reopened.retry(task["id"], str(uuid.uuid4()))
            self.worker(calls).run_once()
            self.assertEqual(calls[1]["body"]["prompt"], calls[0]["body"]["prompt"])
            self.assertEqual(reopened.get_task(retry["id"])["status"], "succeeded")
            fresh = reopened.enqueue(str(uuid.uuid4()), self.payload())
            self.worker(calls).run_once()
            self.assertEqual(calls[2]["body"]["prompt"], "NEW SYSTEM RULES")
            self.assertEqual(reopened.get_task(fresh["id"])["status"], "succeeded")

    def test_historical_missing_compiled_prompt_is_backfilled_only_once(self):
        task = self.store.enqueue(str(uuid.uuid4()), self.payload())
        with self.store._connection() as connection:
            connection.execute("UPDATE tasks SET compiled_prompt=NULL WHERE id=?", (task["id"],))
        with patch("generation_tasks.build_prompt", return_value="FIRST MIGRATED RULES"):
            migrated = GenerationStore(self.store.root)
            self.assertEqual(migrated.compiled_prompt(task["id"]), "FIRST MIGRATED RULES")
        with patch("generation_tasks.build_prompt", return_value="LATER RULES"):
            reopened = GenerationStore(self.store.root)
            self.assertEqual(reopened.compiled_prompt(task["id"]), "FIRST MIGRATED RULES")

    def test_client_cannot_supply_the_compiled_system_prompt(self):
        task = self.store.enqueue(str(uuid.uuid4()), {**self.payload(), "compiledPrompt": "CLIENT OVERRIDE"})
        self.assertNotIn("compiledPrompt", self.store.snapshot(task["id"]))
        self.assertIn("整体协调规则", self.store.compiled_prompt(task["id"]))
        self.assertNotIn("CLIENT OVERRIDE", self.store.compiled_prompt(task["id"]))

    def test_retry_does_not_coalesce_into_active_task_with_different_frozen_prompt(self):
        original_key = str(uuid.uuid4())
        original = self.store.enqueue(original_key, self.payload())
        original_prompt = self.store.compiled_prompt(original["id"])
        self.store.mark(original["id"], "failed", error={"code": "rejected", "outcome": "rejected"})
        with patch("generation_tasks.build_prompt", return_value="NEW SYSTEM RULES"):
            newer = self.store.enqueue(str(uuid.uuid4()), self.payload())
            retried = self.store.retry(original["id"], str(uuid.uuid4()))
            self.assertNotEqual(retried["id"], newer["id"])
            self.assertEqual(retried["retryOf"], original["id"])
            self.assertEqual(self.store.compiled_prompt(retried["id"]), original_prompt)
            self.assertEqual(self.store.compiled_prompt(newer["id"]), "NEW SYSTEM RULES")
            self.assertEqual(self.store.enqueue(original_key, self.payload())["id"], original["id"])
            self.assertEqual(self.store.enqueue(str(uuid.uuid4()), self.payload())["id"], newer["id"])

    def test_retry_does_not_coalesce_into_local_result_with_different_frozen_prompt(self):
        original = self.store.enqueue(str(uuid.uuid4()), self.payload())
        original_prompt = self.store.compiled_prompt(original["id"])
        self.store.mark(original["id"], "failed", error={"code": "rejected", "outcome": "rejected"})
        with patch("generation_tasks.build_prompt", return_value="NEW SYSTEM RULES"):
            newer = self.store.enqueue(str(uuid.uuid4()), self.payload())
            self.store.mark(newer["id"], "failed", error={"code": "local_result_save_failed", "localResultAvailable": True})
            retried = self.store.retry(original["id"], str(uuid.uuid4()))
            self.assertNotEqual(retried["id"], newer["id"])
            self.assertEqual(self.store.compiled_prompt(retried["id"]), original_prompt)
            self.assertEqual(retried["retryOf"], original["id"])

    def test_system_rule_change_cannot_bypass_unknown_same_input_quarantine(self):
        original = self.store.enqueue(str(uuid.uuid4()), self.payload())
        self.store.mark(original["id"], "unknown", error={"code": "timeout", "outcome": "unknown"})
        with patch("generation_tasks.build_prompt", return_value="NEW SYSTEM RULES"):
            another = self.store.enqueue(str(uuid.uuid4()), self.payload())
        self.assertEqual(another["id"], original["id"])
        self.assertEqual(another["status"], "unknown")
        self.assertFalse(another["canRetry"])

    def test_unknown_input_blocks_other_rule_version_already_queued(self):
        original = self.store.enqueue(str(uuid.uuid4()), self.payload())
        with patch("generation_tasks.build_prompt", return_value="NEW SYSTEM RULES"):
            newer = self.store.enqueue(str(uuid.uuid4()), self.payload())
            self.assertNotEqual(newer["id"], original["id"])
            self.store.mark(original["id"], "unknown", error={"code": "timeout", "outcome": "unknown"})
            self.assertEqual(self.store.enqueue(str(uuid.uuid4()), self.payload())["id"], original["id"])
            calls = []
            self.assertFalse(self.worker(calls).run_once())
        self.assertEqual(calls, [])
        isolated = self.store.get_task(newer["id"])
        self.assertEqual(isolated["status"], "unknown")
        self.assertEqual(isolated["error"]["relatedTaskId"], original["id"])

    def test_unjournaled_or_malformed_success_is_unknown(self):
        for malformed in (False, True):
            with self.subTest(malformed=malformed):
                payload = self.payload()
                payload["poseStrict"] = malformed
                task = self.store.enqueue(str(uuid.uuid4()), payload)
                calls = []
                with patch.object(self.store, "journal_result", side_effect=OSError("disk full")) if not malformed else patch.object(self.store, "journal_result", wraps=self.store.journal_result):
                    self.worker(calls, (lambda prepared: {"images": []}) if malformed else None).run_once()
                self.assertEqual(self.store.get_task(task["id"])["status"], "unknown")
                self.assertEqual(len(calls), 1)

    def test_cancelled_task_never_executes_and_private_files_have_private_modes(self):
        task = self.store.enqueue(str(uuid.uuid4()), self.payload())
        cancelled = self.store.cancel(task["id"])
        self.assertEqual(cancelled["status"], "cancelled")
        self.assertFalse(cancelled["canRetry"])
        calls = []
        self.assertFalse(self.worker(calls).run_once())
        self.assertEqual(os.stat(self.store.root).st_mode & 0o777, 0o700)
        self.assertEqual(os.stat(self.store.database).st_mode & 0o777, 0o600)
        self.assertEqual(os.stat(self.store.resolve_asset(self.asset["id"])["path"]).st_mode & 0o777, 0o600)

    def test_two_process_workers_cannot_both_submit_one_task(self):
        task = self.store.enqueue(str(uuid.uuid4()), self.payload())
        context = multiprocessing.get_context("fork")
        count, started, release = context.Value("i", 0), context.Event(), context.Event()
        first = context.Process(target=process_worker, args=(self.store.root, count, started, release))
        second = context.Process(target=process_worker, args=(self.store.root, count, started, release))
        try:
            first.start()
            self.assertTrue(started.wait(3))
            second.start()
            second.join(3)
            self.assertFalse(second.is_alive())
            self.assertEqual(count.value, 1)
        finally:
            release.set()
            first.join(5)
            if second.pid is not None:
                second.join(5)
        self.assertEqual(first.exitcode, 0)
        self.assertEqual(self.store.get_task(task["id"])["status"], "succeeded")


if __name__ == "__main__":
    unittest.main()
