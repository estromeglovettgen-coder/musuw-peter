"""QuickRouter contract at the production prepare -> submit seam, offline only."""
import base64
import copy
import json
import subprocess
import threading
import unittest
import uuid
from email import policy
from email.parser import BytesParser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

import modelflare_adapter as adapter
import server
from generation_tasks import GenerationStore, GenerationWorker
from test_modelflare_adapter import PNG, reference


class QuickRouterContractTests(unittest.TestCase):
    def setUp(self):
        self.directory = TemporaryDirectory()
        self.received, self.targets = [], []
        self.status = 200
        owner = self

        class Provider(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def do_POST(self):
                raw = self.rfile.read(int(self.headers["Content-Length"]))
                message = BytesParser(policy=policy.default).parsebytes(
                    ("Content-Type: " + self.headers["Content-Type"] + "\r\n\r\n").encode() + raw)
                parts = [(part.get_param("name", header="Content-Disposition"), part.get_payload(decode=True))
                         for part in message.iter_parts()] if message.is_multipart() else []
                owner.received.append({"path": self.path, "auth": self.headers.get("Authorization"),
                                       "parts": parts, "json": None if parts else json.loads(raw)})
                body = {"data": [{"b64_json": PNG}]} if owner.status == 200 else {
                    "error": {"code": "fixture_rejection", "message": "Fixture denied generation"}}
                encoded = json.dumps(body).encode()
                self.send_response(owner.status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(encoded)))
                self.end_headers()
                self.wfile.write(encoded)

        self.provider = ThreadingHTTPServer(("127.0.0.1", 0), Provider)
        self.thread = threading.Thread(target=self.provider.serve_forever, daemon=True)
        self.thread.start()
        real_run = subprocess.run

        def local_curl(command, **kwargs):
            self.assertEqual(command, ["curl", "--disable", "--config", "-"])
            config = kwargs["input"]
            self.assertNotIn("retry", config)
            self.assertNotIn("follow", config)
            targets = [url for url in (
                "https://api.quickrouter.ai/v1/images/edits", "https://api.quickrouter.ai/v1/images/generations",
                "https://modelflare.dev/v1/images/edits", "https://modelflare.dev/v1/images/generations") if url in config]
            self.assertEqual(len(targets), 1, "Fixture must reject unrecognized external endpoints")
            self.targets.append(targets[0])
            kwargs["input"] = config.replace(targets[0], f"http://127.0.0.1:{self.provider.server_port}" +
                                              ("/v1/images/edits" if targets[0].endswith("/edits") else "/v1/images/generations"), 1)
            return real_run(command, **kwargs)

        self.patch = patch.object(adapter.subprocess, "run", side_effect=local_curl)
        self.patch.start()

    def tearDown(self):
        self.patch.stop()
        self.provider.shutdown()
        self.provider.server_close()
        self.thread.join()
        self.directory.cleanup()

    def composition(self):
        assets, images, originals = {}, [], []
        for index, roles in enumerate((["face"], ["hair"], ["upper"], ["lower"], ["background", "pose"]), 1):
            identifier = f"ref-{index}"
            data = base64.b64decode(reference(identifier)["dataUrl"].split(",", 1)[1])
            path = Path(self.directory.name) / f"{identifier}.png"
            path.write_bytes(data)
            assets[identifier] = {"id": identifier, "path": path, "name": path.name, "mime": "image/png", "bytes": len(data)}
            images.append({"id": identifier, "assetId": identifier, "roles": roles})
            originals.append(data)
        return {"modelChoice": "quickrouter-image25-sunburst", "count": 1, "promptMode": "default", "size": "1k",
                "layoutHints": {"ratio": "竖版 3:4"}, "images": images}, assets, originals

    def test_default_quickrouter_five_originals_use_multipart_and_its_own_key_once(self):
        payload, assets, originals = self.composition()
        # This is the application's actual seam, including credentials selection.
        prepared = server.prepare_task(payload, assets.__getitem__)
        with patch.object(server, "QUICKROUTER_API_KEY", "quickrouter-fixture-key", create=True), \
             patch.object(server, "API_KEY", "modelflare-fixture-key"):
            result = server.submit_task(prepared)
        self.assertEqual(server.CONFIG["defaultModelChoice"], "quickrouter-image25-sunburst")
        self.assertEqual(prepared["transport"], "multipart")
        self.assertEqual(prepared["provider"], "quickrouter")
        self.assertEqual(self.targets, ["https://api.quickrouter.ai/v1/images/edits"])
        self.assertEqual(len(self.received), 1)
        self.assertEqual(self.received[0]["auth"], "Bearer quickrouter-fixture-key")
        self.assertIsNone(self.received[0]["json"])
        self.assertEqual([value for name, value in self.received[0]["parts"] if name == "image[]"], originals)
        self.assertEqual(dict(self.received[0]["parts"])["model"], b"gpt-image-2.5-sunburst")
        self.assertEqual(result["images"], ["data:image/png;base64," + PNG])

    def test_text_generation_uses_quickrouter_json_without_file_fields(self):
        payload = {"modelChoice": "quickrouter-image25-sunburst", "count": 1, "promptMode": "custom",
                   "prompt": "窗前的猫，柔和自然光", "size": "1k", "images": []}
        prepared = server.prepare_task(payload, lambda _: self.fail("Text request must not resolve assets"))
        with patch.object(server, "QUICKROUTER_API_KEY", "quickrouter-fixture-key", create=True), \
             patch.object(server, "API_KEY", "modelflare-fixture-key"):
            result = server.submit_task(prepared)
        self.assertEqual(self.targets, ["https://api.quickrouter.ai/v1/images/generations"])
        self.assertEqual(prepared["transport"], "json")
        self.assertEqual(self.received[0]["auth"], "Bearer quickrouter-fixture-key")
        self.assertEqual(self.received[0]["parts"], [])
        self.assertEqual(self.received[0]["json"]["model"], "gpt-image-2.5-sunburst")
        self.assertIn(payload["prompt"], self.received[0]["json"]["prompt"])
        self.assertTrue({"files", "images", "_transport"}.isdisjoint(self.received[0]["json"]))
        self.assertEqual(result["model"], "gpt-image-2.5-sunburst")

    def test_legacy_choice_and_frozen_prepared_request_keep_modelflare_host_and_key(self):
        payload, assets, _ = self.composition()
        payload["modelChoice"] = "modelflare-image25-sunburst"
        prepared = server.prepare_task(payload, assets.__getitem__)
        prepared.pop("provider")  # Prepared snapshots from the previous release.
        with patch.object(server, "QUICKROUTER_API_KEY", "quickrouter-fixture-key", create=True), \
             patch.object(server, "API_KEY", "modelflare-fixture-key"):
            result = server.submit_task(prepared)
        self.assertEqual(self.targets, ["https://modelflare.dev/v1/images/edits"])
        self.assertEqual(self.received[0]["auth"], "Bearer modelflare-fixture-key")
        self.assertEqual(result["model"], "gpt-image-2.5-sunburst")
        self.assertEqual([item["id"] for item in server.CONFIG["modelOptions"]],
                         ["quickrouter-image25-sunburst", "modelflare-image25", "modelflare-image25-sunburst"])

    def test_missing_quickrouter_key_and_cross_provider_tampering_never_dispatch(self):
        payload, assets, _ = self.composition()
        prepared = server.prepare_task(payload, assets.__getitem__)
        with patch.object(server, "QUICKROUTER_API_KEY", "", create=True), \
             patch.object(server, "API_KEY", "modelflare-fixture-key"):
            with self.assertRaises(adapter.ProviderError) as failure:
                server.submit_task(prepared)
        self.assertEqual(failure.exception.outcome, "not_sent")
        self.assertEqual(failure.exception.code, "invalid_local_credentials")
        for changes in ({"provider": "modelflare"}, {"endpoint": "https://modelflare.dev/v1/images/edits"},
                        {"endpoint": "https://attacker.invalid/v1/images/edits"}, {"transport": "json"},
                        {"body": {**prepared["body"], "model": "gpt-image-2.5-flare"}}):
            with self.subTest(changes=changes):
                changed = copy.deepcopy(prepared)
                changed.update(changes)
                with self.assertRaises(adapter.ProviderError) as failure:
                    server.submit_task(changed)
                self.assertEqual(failure.exception.outcome, "not_sent")
        self.assertEqual(self.targets, [])
        self.assertEqual(self.received, [])

    def test_quickrouter_rejection_and_unknown_response_never_retry_or_change_provider(self):
        payload, assets, _ = self.composition()
        prepared = server.prepare_task(payload, assets.__getitem__)
        for status in (413, 500):
            with self.subTest(status=status):
                self.status = status
                before = len(self.received)
                with patch.object(server, "QUICKROUTER_API_KEY", "quickrouter-fixture-key", create=True), \
                     self.assertRaises(adapter.ProviderError) as failure:
                    server.submit_task(prepared)
                self.assertEqual(failure.exception.status, status)
                self.assertEqual(failure.exception.outcome, "rejected" if status == 413 else "unknown")
                self.assertNotIn("Modelflare", str(failure.exception))
                self.assertEqual(len(self.received), before + 1)
                self.assertEqual(self.targets[-1], "https://api.quickrouter.ai/v1/images/edits")

    def test_durable_worker_publishes_quickrouter_result_and_missing_key_is_not_unknown(self):
        for configured in (True, False):
            with self.subTest(configured=configured):
                payload, assets, _ = self.composition()
                store = GenerationStore(Path(self.directory.name) / ("enabled" if configured else "unconfigured"))
                for image in payload["images"]:
                    record = assets[image["assetId"]]
                    asset = store.add_asset("data:image/png;base64," + base64.b64encode(record["path"].read_bytes()).decode(), record["name"])
                    image["assetId"] = asset["id"]
                task = store.enqueue(str(uuid.uuid4()), payload)
                worker = GenerationWorker(store, server.prepare_task, server.submit_task)
                before = len(self.received)
                with patch.object(server, "QUICKROUTER_API_KEY", "quickrouter-fixture-key" if configured else "", create=True), \
                     patch.object(server, "API_KEY", "modelflare-fixture-key"):
                    self.assertTrue(worker.run_once(task["id"]))
                    self.assertFalse(worker.run_once())
                    worker.recover()
                    self.assertFalse(worker.run_once())
                receipt = store.get_task(task["id"])
                self.assertEqual(len(self.received), before + int(configured))
                if configured:
                    self.assertEqual(receipt["status"], "succeeded")
                    result_asset = receipt["result"]["images"][0].split("/")[3]
                    self.assertEqual(store.resolve_asset(result_asset)["path"].read_bytes(), base64.b64decode(PNG))
                else:
                    self.assertEqual(receipt["status"], "failed")
                    self.assertEqual(receipt["error"]["outcome"], "not_sent")
                    self.assertEqual(receipt["error"]["code"], "invalid_local_credentials")


if __name__ == "__main__":
    unittest.main()
