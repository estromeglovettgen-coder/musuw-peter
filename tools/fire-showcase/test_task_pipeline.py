"""Real local HTTP -> durable worker -> curl -> local provider -> result HTTP.

The only transport substitution redirects the already constructed curl request
from the public hostname to a loopback fixture. No live provider is contacted.
"""
import base64
import http.client
import json
import os
import subprocess
import tempfile
import threading
import unittest
import uuid
from urllib.parse import urlsplit
from email import policy
from email.parser import BytesParser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch

with patch.dict(os.environ, {"MODELFLARE_API_KEY": "sk-test-pipeline-only"}):
    import server
import modelflare_adapter as adapter
from generation_tasks import GenerationStore, GenerationWorker
from test_modelflare_adapter import PNG, reference


class CompleteTaskPipelineTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.root = Path(self.directory.name)
        (self.root / "site").mkdir()
        self.store = GenerationStore(self.root / "private-data")
        self.provider_calls = []
        self.provider_status = 200
        self.provider_disconnect = False
        self.current_task = None
        self.edit_transport = "multipart"
        owner = self

        class Provider(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def do_POST(self):
                raw = self.rfile.read(int(self.headers["Content-Length"]))
                message = BytesParser(policy=policy.default).parsebytes(
                    ("Content-Type: " + self.headers["Content-Type"] + "\r\n\r\n").encode() + raw)
                parts = list(message.iter_parts()) if message.is_multipart() else []
                owner.provider_calls.append({
                    "path": self.path,
                    "parts": [(p.get_param("name", header="content-disposition"), p.get_payload(decode=True)) for p in parts],
                    "json": json.loads(raw) if not parts else None,
                    "persistedState": owner.store.get_task(owner.current_task)["status"],
                    "authorization": self.headers.get("Authorization"),
                })
                if owner.provider_disconnect:
                    self.close_connection = True
                    return
                body = {"data": [{"b64_json": PNG}]} if owner.provider_status == 200 else {
                    "error": {"code": "read_request_body_failed" if owner.provider_status == 413 else "gateway_error",
                              "message": "Fixture rejected body" if owner.provider_status == 413 else "Fixture uncertain failure",
                              "request_id": "local-fixture-request"}}
                encoded = json.dumps(body).encode()
                self.send_response(owner.provider_status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(encoded)))
                self.end_headers()
                self.wfile.write(encoded)

        self.provider = ThreadingHTTPServer(("127.0.0.1", 0), Provider)
        self.provider_thread = threading.Thread(target=self.provider.serve_forever, daemon=True)
        self.provider_thread.start()
        self.patches = [patch.object(server, "ROOT", self.root), patch.object(server, "STORE", self.store),
                        patch.object(server, "API_KEY", "sk-test-pipeline-only"), patch.object(server, "ALLOW_GENERATION", False),
                        patch.object(server.Handler, "log_message", lambda *args: None)]
        for item in self.patches:
            item.start()
        self.app = ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
        self.app_thread = threading.Thread(target=self.app.serve_forever, daemon=True)
        self.app_thread.start()
        original_run = subprocess.run

        def local_curl(command, **kwargs):
            self.assertEqual(command, ["curl", "--disable", "--config", "-"])
            self.assertNotIn("sk-test-pipeline-only", " ".join(command))
            config = kwargs["input"]
            endpoints = (adapter.TASK_EDITS_ENDPOINT, adapter.TASK_GENERATIONS_ENDPOINT, adapter.TASK_MULTIPART_EDITS_ENDPOINT)
            self.assertTrue(any(endpoint in config for endpoint in endpoints))
            for endpoint in endpoints:
                if endpoint in config:
                    config = config.replace(endpoint, f"http://127.0.0.1:{self.provider.server_port}" + urlsplit(endpoint).path, 1)
            self.assertIn(f'url = "http://127.0.0.1:{self.provider.server_port}/', config, "fixture transport must fail closed before any external request")
            kwargs["input"] = config
            return original_run(command, **kwargs)

        self.curl_patch = patch.object(adapter.subprocess, "run", side_effect=local_curl)
        self.curl_patch.start()
        self.worker = GenerationWorker(self.store, lambda payload, resolve: adapter.prepare_task_request(payload, resolve, **({"edit_transport": self.edit_transport} if self.edit_transport else {})),
                                       lambda prepared: adapter.submit_task_request(prepared, "sk-test-pipeline-only"))

    def tearDown(self):
        self.curl_patch.stop()
        self.app.shutdown()
        self.app.server_close()
        self.app_thread.join()
        for item in reversed(self.patches):
            item.stop()
        self.provider.shutdown()
        self.provider.server_close()
        self.provider_thread.join()
        self.directory.cleanup()

    def call(self, path, payload=None):
        connection = http.client.HTTPConnection("127.0.0.1", self.app.server_port, timeout=5)
        connection.request("POST" if payload is not None else "GET", path,
                           json.dumps(payload) if payload is not None else None,
                           {"Content-Type": "application/json"} if payload is not None else {})
        response = connection.getresponse()
        content = response.read()
        result = json.loads(content) if response.getheader("Content-Type", "").startswith("application/json") else content
        status = response.status
        connection.close()
        return status, result

    def composition(self):
        images, original_bytes = [], []
        for name, roles in [("scene", ["background", "pose"]), ("face", ["face"]), ("outfit", ["upper", "lower"])]:
            source = reference(name, roles)
            status, receipt = self.call("/api/assets", {"name": source["name"], "dataUrl": source["dataUrl"]})
            self.assertEqual(status, 201)
            self.assertEqual(self.provider_calls, [], "independent asset uploads must not contact the provider")
            image = {"id": name, "assetId": receipt["asset"]["id"], "roles": roles}
            self.assertNotIn("path", receipt["asset"])
            images.append(image)
            original_bytes.append(base64.b64decode(source["dataUrl"].split(",", 1)[1]))
        return {"promptMode": "default", "modelChoice": "modelflare-image25-sunburst", "count": 1,
                "size": "1k", "layoutHints": {"ratio": "方图 1:1"}, "images": images}, original_bytes

    def create(self, payload, key=None):
        key = key or str(uuid.uuid4())
        status, response = self.call("/api/generation-tasks", {"idempotencyKey": key, "payload": payload})
        self.assertEqual(status, 202)
        return response["task"], key

    def test_upload_receipt_replay_binary_generation_and_download_are_one_pipeline(self):
        payload, expected_files = self.composition()
        task, key = self.create(payload)
        self.current_task = task["id"]
        alias_task, alias = self.create(payload)
        self.assertEqual(alias_task["id"], task["id"])
        self.assertTrue(self.worker.run_once())
        self.assertFalse(self.worker.run_once())
        self.assertEqual(len(self.provider_calls), 1)
        request = self.provider_calls[0]
        self.assertEqual(request["persistedState"], "submitting")
        self.assertEqual(request["path"], "/v1/images/edits")
        self.assertEqual([body for name, body in request["parts"] if name == "image[]"], expected_files)
        prompt = next(body.decode() for name, body in request["parts"] if name == "prompt")
        self.assertIn("更自然的五官比例", prompt)
        self.assertIn("图2", prompt)
        for intent in [key, alias]:
            replay, _ = self.create(payload, intent)
            self.assertEqual(replay["id"], task["id"], "alias receipt replay after success cannot charge again")
            self.assertEqual(replay["status"], "succeeded")
        status, response = self.call("/api/generation-tasks/" + task["id"])
        self.assertEqual(status, 200)
        status, image = self.call(response["task"]["result"]["images"][0])
        self.assertEqual(status, 200)
        self.assertEqual(image, base64.b64decode(PNG))
        other, _ = self.create(payload)
        self.assertNotEqual(other["id"], task["id"], "a deliberate independent intent after success is allowed")
        self.current_task = other["id"]
        self.assertTrue(self.worker.run_once())
        self.assertEqual(len(self.provider_calls), 2)

    def test_rejection_can_retry_but_uncertain_generation_is_not_reissued(self):
        payload, _ = self.composition()
        self.provider_status = 413
        task, _ = self.create(payload)
        self.current_task = task["id"]
        self.worker.run_once()
        rejected = self.store.get_task(task["id"])
        self.assertEqual(rejected["status"], "failed")
        self.assertTrue(rejected["canRetry"])
        self.assertEqual(rejected["error"]["providerStatus"], 413)
        status, receipt = self.call(f"/api/generation-tasks/{task['id']}/retry", {"idempotencyKey": str(uuid.uuid4())})
        self.assertEqual(status, 202)
        retried = receipt["task"]
        self.assertEqual(retried["retryOf"], task["id"])
        self.provider_status = 503
        self.current_task = retried["id"]
        self.worker.run_once()
        unknown = self.store.get_task(retried["id"])
        self.assertEqual(unknown["status"], "unknown")
        self.assertFalse(unknown["canRetry"])
        calls = len(self.provider_calls)
        self.worker.recover()
        self.assertFalse(self.worker.run_once())
        status, _ = self.call(f"/api/generation-tasks/{retried['id']}/retry", {"idempotencyKey": str(uuid.uuid4())})
        self.assertEqual(status, 409)
        duplicate, _ = self.create(payload)
        self.assertEqual(duplicate["id"], retried["id"])
        self.assertEqual(len(self.provider_calls), calls)

    def test_default_json_asset_generation_and_download_are_one_pipeline(self):
        self.edit_transport = None  # Exercise prepare_task_request's actual default.
        payload, expected_files = self.composition()
        self.assertNotIn("base64,", json.dumps(payload))
        task, _ = self.create(payload)
        self.current_task = task["id"]
        self.assertTrue(self.worker.run_once())
        self.assertFalse(self.worker.run_once())
        self.assertEqual(len(self.provider_calls), 1)
        request = self.provider_calls[0]
        self.assertEqual(request["persistedState"], "submitting")
        self.assertEqual(request["path"], "/v1/images/edits")
        self.assertEqual(request["parts"], [])
        self.assertEqual(request["json"]["model"], "gpt-image-2.5-sunburst")
        self.assertEqual(request["json"]["size"], "1024x1024")
        self.assertEqual([base64.b64decode(image["image_url"].split(",", 1)[1]) for image in request["json"]["images"]], expected_files)
        self.assertNotIn("files", request["json"])
        self.assertNotIn("_transport", request["json"])
        status, receipt = self.call("/api/generation-tasks/" + task["id"])
        self.assertEqual(status, 200)
        self.assertEqual(receipt["task"]["status"], "succeeded")
        status, image = self.call(receipt["task"]["result"]["images"][0])
        self.assertEqual(status, 200)
        self.assertEqual(image, base64.b64decode(PNG))

    def test_disconnect_persists_curl_reason_and_metrics_through_task_http_without_retry(self):
        self.edit_transport = None
        self.provider_disconnect = True
        payload, _ = self.composition()
        task, _ = self.create(payload)
        self.current_task = task["id"]
        self.assertTrue(self.worker.run_once())
        status, receipt = self.call("/api/generation-tasks/" + task["id"])
        self.assertEqual(status, 200)
        failed = receipt["task"]
        self.assertEqual(failed["status"], "unknown")
        self.assertEqual(failed["error"]["code"], "curl_52")
        diagnostic = failed["error"]["transport"]
        self.assertEqual(diagnostic["curlExitCode"], 52)
        self.assertIn("未返回 HTTP 响应", diagnostic["summary"])
        self.assertGreater(diagnostic["uploadedBytes"], 0)
        self.assertEqual(diagnostic["downloadedBytes"], 0)
        self.assertGreaterEqual(diagnostic["elapsedMs"], 0)
        self.assertNotIn("sk-test-pipeline-only", json.dumps(receipt))
        self.assertNotIn("data:image", json.dumps(receipt))
        self.worker.recover()
        self.assertFalse(self.worker.run_once())
        self.assertEqual(len(self.provider_calls), 1)

    def test_text_only_uses_json_and_a_result_publication_failure_never_regenerates(self):
        payload = {"promptMode": "custom", "prompt": "自然光下的一张生活照", "count": 1, "size": "1k",
                   "modelChoice": "modelflare-image25-sunburst", "layoutHints": {"ratio": "方图 1:1"}, "images": []}
        task, _ = self.create(payload)
        self.current_task = task["id"]
        with patch.object(self.store, "save_result", side_effect=OSError("fixture disk unavailable")):
            self.worker.run_once()
        failed = self.store.get_task(task["id"])
        self.assertTrue(failed["canRetry"])
        self.assertTrue(failed["error"]["localResultAvailable"])
        self.assertEqual(self.provider_calls[0]["path"], "/v1/images/generations")
        self.assertIn(payload["prompt"], self.provider_calls[0]["json"]["prompt"])
        self.assertEqual(len(self.provider_calls), 1)
        status, receipt = self.call(f"/api/generation-tasks/{task['id']}/retry", {"idempotencyKey": str(uuid.uuid4())})
        self.assertEqual(status, 202)
        self.assertEqual(receipt["task"]["id"], task["id"])
        self.assertEqual(receipt["task"]["status"], "succeeded")
        self.assertEqual(len(self.provider_calls), 1, "recovering local publication must not call the provider again")


if __name__ == "__main__":
    unittest.main()
