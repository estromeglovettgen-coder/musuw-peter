"""Exercise the local HTTP interface without making provider requests."""

import base64
import http.client
import json
import os
import socket
import sqlite3
import tempfile
import threading
import time
import unittest
import zlib
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import patch

with patch.dict(os.environ, {"MODELFLARE_API_KEY": "sk-test-only-not-a-real-key"}):
    import server
from modelflare_adapter import MODEL, MODEL_CHOICE, ProviderError, prepare_task_request
from generation_tasks import GenerationStore, GenerationWorker

SOURCE_ROOT = Path(__file__).resolve().parent
PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC"
# A genuine 1x1 JPEG exported once with macOS sips; no image runtime is needed.
JPEG = (
    "/9j/4AAQSkZJRgABAQAASABIAAD/4QBMRXhpZgAATU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAAaADAAQAAAABAAAAAQAAAAD/7QA4UGhvdG9zaG9wIDMuMAA4QklNBAQAAAAAAAA4QklNBCUAAAAAABDUHYzZjwCyBOmACZjs+EJ+/8AAEQgAAQABAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYSQVEHYXETIjKBCBRCkaGxwQkjM1LwFWJy0QoWJDThJfEXGBkaJicoKSo1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/bAEMAAgICAgICAwICAwUDAwMFBgUFBQUGCAYGBgYGCAoICAgICAgKCgoKCgoKCgwMDAwMDA4ODg4ODw8PDw8PDw8PD//bAEMBAgICBAQEBwQEBxALCQsQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEP/dAAQAAf/aAAwDAQACEQMRAD8A+L6KKK/lM/38P//Z"
)


def three_references():
    names = ("default-person.webp", "default-outfit.webp", "default-pose-scene.webp")
    slots = ("image-one", "image-two", "image-three")
    return {
        "modelChoice": MODEL_CHOICE, "count": 1, "promptMode": "default",
        "prompt": "", "size": "768x1024", "layoutHints": {"ratio": "竖版 3:4"},
        "images": [{"id": slot, "roles": roles, "dataUrl": "data:image/webp;base64," +
                    base64.b64encode((SOURCE_ROOT / "site/assets/prompt-guide" / name).read_bytes()).decode()}
                   for slot, name, roles in zip(slots, names, (["face"], ["upper", "lower"], ["pose", "background"]))],
    }


class LocalCompositionTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.root = Path(self.directory.name)
        (self.root / "site").mkdir()
        self.store = GenerationStore(self.root / "private-data")
        self.provider_requests = []
        def provider(prepared):
            self.provider_requests.append(prepared)
            return {"images": ["data:image/png;base64," + PNG], "model": prepared["body"]["model"], "size": "1024x1024"}
        self.worker = GenerationWorker(self.store, prepare_task_request, provider)
        self.patches = [patch.object(server, "ROOT", self.root), patch.object(server, "STORE", self.store),
                        patch.object(server, "API_KEY", "sk-test-only-not-a-real-key"),
                        patch.object(server, "ALLOW_GENERATION", False),
                        patch.object(server.Handler, "log_message", lambda *args: None)]
        for item in self.patches:
            item.start()
        self.httpd = server.ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.httpd.shutdown()
        self.httpd.server_close()
        self.thread.join()
        for item in reversed(self.patches):
            item.stop()
        self.directory.cleanup()

    def request(self, method, path, payload=None, headers=None, raw=False):
        connection = http.client.HTTPConnection("127.0.0.1", self.httpd.server_port)
        supplied = {"Content-Type": "application/json", **(headers or {})}
        connection.request(method, path, json.dumps(payload) if payload is not None else None, supplied)
        response = connection.getresponse()
        content = response.read()
        result = (response.status, content if raw else json.loads(content), dict(response.getheaders()))
        connection.close()
        return result

    def post(self, path, payload, **kwargs):
        return self.request("POST", path, payload, **kwargs)

    def payload(self):
        payload = three_references()
        for reference in payload["images"]:
            status, result, headers = self.post("/api/assets", {"dataUrl": reference.pop("dataUrl"), "name": reference["id"]})
            self.assertEqual(status, 201)
            reference["assetId"] = result["asset"]["id"]
        return payload

    def create(self, payload=None, key=None):
        return self.post("/api/generation-tasks", {"idempotencyKey": key or str(uuid.uuid4()), "payload": payload or self.payload()})

    def test_paused_upload_and_queue_work_without_provider_or_legacy_global_lock(self):
        (self.root / "generation-attempt.json").write_text('{"status":"complete"}')
        (self.root / "generation-result.json").write_text("old-result-preserved")
        status, result, headers = self.create()
        self.assertEqual(status, 202)
        self.assertEqual(result["task"]["status"], "queued")
        self.assertEqual(self.provider_requests, [])
        health = self.request("GET", "/__local/health")[1]
        self.assertTrue(health["generationPaused"])
        self.assertFalse(health["generationSubmitted"])
        self.assertTrue(health["durableGenerationEnabled"])
        self.assertEqual((self.root / "generation-result.json").read_text(), "old-result-preserved")
        self.assertEqual(self.post("/api/generate", three_references())[0], 410)

    def test_original_asset_over_sixty_kilobytes_is_immutable_and_downloadable(self):
        png = base64.b64decode(PNG)
        text = b"source\0" + b"x" * 100000
        chunk = len(text).to_bytes(4, "big") + b"tEXt" + text + (zlib.crc32(b"tEXt" + text) & 0xffffffff).to_bytes(4, "big")
        original = png[:-12] + chunk + png[-12:]
        data_url = "data:image/png;base64," + base64.b64encode(original).decode()
        status, result, headers = self.post("/api/assets", {"dataUrl": data_url, "name": "original.png"})
        self.assertEqual(status, 201)
        asset = result["asset"]
        self.assertEqual(asset["bytes"], len(original))
        status, body, headers = self.request("GET", asset["url"], raw=True)
        self.assertEqual((status, body), (200, original))
        self.assertEqual(headers["Content-Type"], "image/png")
        self.assertIn("immutable", headers["Cache-Control"])
        self.assertEqual(self.post("/api/assets", {"dataUrl": data_url, "name": "another.png"})[1]["asset"]["id"], asset["id"])

    def test_original_over_twenty_mib_uploads_through_http_without_a_local_size_cap(self):
        png = base64.b64decode(PNG)
        text = b"source\0" + b"x" * (20 * 1024 * 1024 + 1024)
        chunk = len(text).to_bytes(4, "big") + b"tEXt" + text + (zlib.crc32(b"tEXt" + text) & 0xffffffff).to_bytes(4, "big")
        original = png[:-12] + chunk + png[-12:]
        status, result, _ = self.post("/api/assets", {"dataUrl": "data:image/png;base64," + base64.b64encode(original).decode(), "name": "large-original.png"})
        self.assertEqual(status, 201, result)
        self.assertEqual(result["asset"]["bytes"], len(original))
        self.assertEqual(self.store.resolve_asset(result["asset"]["id"])["path"].read_bytes(), original)
        self.assertEqual(self.provider_requests, [])

    def test_long_prompt_and_metadata_over_one_mib_are_frozen_and_prepared_without_caps(self):
        prompt = "保留每个原始输入。" + "x" * (1024 * 1024 + 257)
        payload = {"modelChoice": "quickrouter-image25-sunburst", "count": 1, "promptMode": "custom", "prompt": prompt,
                   "size": "1k", "images": []}
        status, preview, _ = self.post("/api/prompt", payload)
        self.assertEqual(status, 200, preview)
        self.assertTrue(preview["valid"], preview["errors"])
        status, receipt, _ = self.create(payload)
        self.assertEqual(status, 202, receipt)
        identifier = receipt["task"]["id"]
        self.assertEqual(self.store.compiled_prompt(identifier), preview["prompt"])
        prepared = server.prepare_task(self.store.snapshot(identifier), self.store.resolve_asset)
        self.assertIn(prompt, prepared["body"]["prompt"])
        self.assertEqual(self.provider_requests, [])

    def test_seventeen_faces_create_and_execute_one_durable_task_without_a_local_reference_cap(self):
        asset = self.store.add_asset("data:image/png;base64," + PNG, "face-fixture.png")
        payload = {"modelChoice": "quickrouter-image25-sunburst", "count": 1, "promptMode": "default", "size": "1k",
                   "images": [{"id": f"face-{index}", "assetId": asset["id"], "roles": ["face"]} for index in range(17)]}
        status, receipt, _ = self.create(payload)
        self.assertEqual(status, 202, receipt)
        self.assertTrue(self.worker.run_once(receipt["task"]["id"]))
        self.assertFalse(self.worker.run_once())
        status, receipt, _ = self.request("GET", "/api/generation-tasks/" + receipt["task"]["id"])
        self.assertEqual(status, 200)
        self.assertEqual(receipt["task"]["status"], "succeeded")
        self.assertEqual(receipt["task"]["referenceCount"], 17)
        self.assertEqual(len(self.provider_requests), 1)
        self.assertEqual(self.provider_requests[0]["provider"], "quickrouter")
        self.assertEqual(self.provider_requests[0]["transport"], "multipart")
        self.assertEqual(len(self.provider_requests[0]["files"]), 17)

    def test_incomplete_http_body_is_rejected_even_if_its_prefix_is_valid_json(self):
        body = json.dumps({"promptMode": "custom", "prompt": "完整性检查", "images": []}).encode()
        connection = http.client.HTTPConnection("127.0.0.1", self.httpd.server_port)
        connection.putrequest("POST", "/api/prompt")
        connection.putheader("Content-Type", "application/json")
        connection.putheader("Content-Length", str(len(body) + 5))
        connection.endheaders(body)
        connection.sock.shutdown(socket.SHUT_WR)
        response = connection.getresponse()
        self.assertEqual(response.status, 400, response.read())
        connection.close()

    def test_concurrent_same_intent_and_changed_input_conflict_without_spending(self):
        payload, key = self.payload(), str(uuid.uuid4())
        def submit(index):
            return self.create({**payload, "clientMetrics": {"preparationMs": index}}, key)
        with ThreadPoolExecutor(max_workers=4) as pool:
            results = list(pool.map(submit, range(8)))
        self.assertTrue(all(item[0] == 202 for item in results))
        self.assertEqual(len({item[1]["task"]["id"] for item in results}), 1)
        changed = {**payload, "poseStrict": False}
        self.assertEqual(self.create(changed, key)[0], 409)
        self.assertEqual(self.provider_requests, [])

    def test_refresh_task_list_and_asset_heads_do_not_deadlock_with_worker_commit(self):
        """A live list cursor must not open another reader behind a writer.

        Coordinate only the naturally occurring scheduling window: the HTTP list
        has fetched its first row while the real worker commits recovery. Short
        SQLite timeouts keep the original 15-second HTTP 500 reproducible fast.
        """
        asset = self.store.add_asset("data:image/png;base64," + PNG, "head-fixture.png")
        for index in range(2):
            task = self.store.enqueue(str(uuid.uuid4()), {
                "modelChoice": "quickrouter-image25-sunburst", "count": 1,
                "promptMode": "custom", "prompt": f"锁回归 {index}", "size": "1k", "images": []})
            self.store.mark(task["id"], "preparing" if index == 0 else "failed")
        first_list_row, worker_committing = threading.Event(), threading.Event()
        original_task, real_connect = self.store._task, sqlite3.connect
        worker_name = "sqlite-refresh-regression-worker"

        class TracedConnection(sqlite3.Connection):
            def commit(connection):
                if threading.current_thread().name == worker_name and connection.in_transaction:
                    worker_committing.set()
                return super().commit()

        def short_connection(*args, **kwargs):
            kwargs.update(timeout=1.0 if threading.current_thread().name == worker_name else 0.25,
                          factory=TracedConnection)
            return real_connect(*args, **kwargs)

        def pause_first_http_row(row, **kwargs):
            if threading.current_thread().name not in ("MainThread", worker_name) and not first_list_row.is_set():
                first_list_row.set()
                self.assertTrue(worker_committing.wait(2), "Worker did not reach its real commit")
                time.sleep(0.03)  # Let COMMIT request its exclusive lock.
            return original_task(row, **kwargs)

        started = time.monotonic()
        errors = []
        def run_worker():
            try:
                self.worker.run_once()
            except Exception as error:
                errors.append(error)
        worker_thread = threading.Thread(target=run_worker, name=worker_name)
        with patch("generation_tasks.sqlite3.connect", side_effect=short_connection), \
             patch.object(self.store, "_task", side_effect=pause_first_http_row), \
             ThreadPoolExecutor(max_workers=2) as pool:
            listing = pool.submit(self.request, "GET", "/api/generation-tasks")
            self.assertTrue(first_list_row.wait(2), "HTTP task list did not fetch its first row")
            worker_thread.start()
            self.assertTrue(worker_committing.wait(2))
            time.sleep(0.02)
            head = pool.submit(self.request, "HEAD", asset["url"], None, None, True)
            list_status, listing_body, _ = listing.result(timeout=3)
            head_status = head.result(timeout=3)[0]
            worker_thread.join(timeout=3)
        self.assertFalse(worker_thread.is_alive())
        self.assertEqual((list_status, head_status, [str(error) for error in errors]),
                         (200, 200, []), listing_body)
        self.assertLess(time.monotonic() - started, 1.5)
        self.assertEqual(len(self.provider_requests), 1, "The fixture worker must dispatch the recovered fixture exactly once")
        # Replay the original uncoordinated reload burst with the normal 15 s
        # SQLite timeout while the idle worker continues polling and writing.
        self.worker.start()
        try:
            def refresh_request(index):
                started = time.monotonic()
                status = self.request("GET", "/api/generation-tasks")[0] if index % 2 else self.request("HEAD", asset["url"], raw=True)[0]
                return status, time.monotonic() - started
            with ThreadPoolExecutor(max_workers=4) as pool:
                burst = list(pool.map(refresh_request, range(32)))
            self.assertTrue(all(status == 200 for status, _ in burst), burst)
            self.assertLess(max(elapsed for _, elapsed in burst), 1.5)
            self.assertEqual(len(self.provider_requests), 1)
        finally:
            self.worker.stop()

    def test_prompt_preview_and_worker_request_match_and_result_survives_reload(self):
        payload = self.payload()
        preview = self.post("/api/prompt", payload)[1]
        self.assertTrue(preview["valid"])
        task = self.create(payload)[1]["task"]
        self.assertTrue(self.worker.run_once())
        loaded = self.request("GET", "/api/generation-tasks/" + task["id"])[1]["task"]
        self.assertEqual(loaded["status"], "succeeded")
        self.assertEqual(self.provider_requests[0]["body"]["prompt"], preview["prompt"])
        self.assertEqual([item["assetId"] for item in self.provider_requests[0]["files"]], [item["assetId"] for item in payload["images"]])
        status, body, headers = self.request("GET", loaded["result"]["images"][0], raw=True)
        self.assertEqual((status, body), (200, base64.b64decode(PNG)))
        self.assertEqual(self.request("GET", "/api/generation-tasks")[1]["tasks"][0]["id"], task["id"])
        self.assertEqual(len(self.provider_requests), 1)

    def test_unknown_cannot_retry_or_create_duplicate_and_queued_can_cancel(self):
        payload = self.payload()
        task = self.create(payload)[1]["task"]
        self.store.mark(task["id"], "unknown", error={"code": "timeout", "message": "结果未知"})
        self.assertEqual(self.post("/api/generation-tasks/" + task["id"] + "/retry", {"idempotencyKey": str(uuid.uuid4())})[0], 409)
        self.assertEqual(self.create(payload)[1]["task"]["id"], task["id"])
        payload["poseStrict"] = False
        queued = self.create(payload)[1]["task"]
        cancelled = self.post("/api/generation-tasks/" + queued["id"] + "/cancel", {})[1]["task"]
        self.assertEqual(cancelled["status"], "cancelled")
        self.assertFalse(cancelled["canRetry"])
        self.assertEqual(self.provider_requests, [])

    def test_task_keeps_safe_provider_diagnostics_for_unsupported_parameter(self):
        task = self.create()[1]["task"]
        def rejected(prepared):
            raise ProviderError(422, code="invalid_parameter", param="quality", error_type="validation_error",
                                message="参数 quality 不受支持。", request_id="req_safe_422", outcome="rejected")
        self.worker.submit = rejected
        self.worker.run_once()
        loaded = self.request("GET", "/api/generation-tasks/" + task["id"])[1]["task"]
        self.assertEqual(loaded["status"], "failed")
        self.assertEqual(loaded["error"]["providerParam"], "quality")
        self.assertEqual(loaded["error"]["providerMessage"], "参数 quality 不受支持。")
        self.assertEqual(loaded["error"]["providerType"], "validation_error")
        self.assertEqual(loaded["error"]["requestId"], "req_safe_422")
        self.assertNotIn("sk-test-only", json.dumps(loaded))

    def test_invalid_assets_origins_hosts_paths_and_private_static_links_are_rejected(self):
        self.assertEqual(self.post("/api/assets", {"dataUrl": "data:image/png;base64,aGVsbG8="})[0], 400)
        self.assertEqual(self.post("/api/assets", {"dataUrl": "data:image/png;base64," + PNG}, headers={"Origin": "https://evil.example"})[0], 403)
        self.assertEqual(self.request("GET", "/api/generation-tasks", headers={"Host": "evil.example"})[0], 403)
        self.assertEqual(self.request("GET", "/api/assets/../../etc/passwd/content")[0], 404)
        (self.root / "site/leak").symlink_to(self.store.database)
        self.assertEqual(self.request("GET", "/leak", raw=True)[0], 404)
        payload = self.payload()
        payload["images"][0]["path"] = "/etc/passwd"
        self.assertEqual(self.create(payload)[0], 400)
        config = self.request("GET", "/api/config")[1]
        self.assertIsNone(config["maxUploadBytes"])
        self.assertIsNone(config["referenceWorkflow"]["providerReferenceLimit"])
        self.assertEqual(self.provider_requests, [])


if __name__ == "__main__":
    unittest.main()
