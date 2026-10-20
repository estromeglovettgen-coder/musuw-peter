"""Native trusted HTTP -> reused worker -> loopback provider and billing."""
import base64
import http.client
import json
import os
import re
import subprocess
import tempfile
import threading
import time
import unittest
import uuid
from concurrent.futures import ThreadPoolExecutor
from email import policy
from email.parser import BytesParser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch
from urllib.parse import urlsplit

import fire_server
import modelflare_adapter as adapter
from test_generation_tasks import PNG


class PublicBundleTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        site = self.root / "site"
        site.mkdir()
        original = fire_server.source.ROOT / "site"
        for name in ("index.html", "fire-host.js", "components.css", "fire-components.js", "generation-tasks.js", "script.js", "workbench.js"):
            (site / name).write_bytes((original / name).read_bytes())
        (site / "fixture.png").write_bytes(base64.b64decode(PNG))
        outside = self.root / "private-key.env"
        outside.write_text("fixture-secret-not-public")
        (site / "escape.js").symlink_to(outside)
        self.root_patch = patch.object(fire_server.source, "ROOT", self.root)
        self.root_patch.start()
        self.addCleanup(self.root_patch.stop)
        self.runtime = self.new_runtime()
        self.server = fire_server.make_server(self.runtime, "127.0.0.1", 0)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.addCleanup(self.close_server)

    def new_runtime(self):
        return fire_server.FireRuntime(self.root / "data", "test-bridge", "http://127.0.0.1:1/internal")

    def close_server(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()

    def get(self, path, *, method="GET", headers=None):
        connection = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=5)
        connection.request(method, path, headers=headers or {})
        response = connection.getresponse()
        result = response.status, dict(response.getheaders()), response.read()
        connection.close()
        return result

    def test_html_and_host_share_one_content_revision_and_preload_in_dependency_order(self):
        status, headers, html = self.get("/tools/fire-showcase/")
        self.assertEqual(status, 200)
        self.assertEqual(headers["Cache-Control"], "no-store")
        versions = re.findall(rb"[?]v=([a-f0-9]{64})", html)
        self.assertGreaterEqual(len(versions), 8)
        self.assertEqual(set(versions), {self.runtime.bundle_revision.encode()})
        preloads = re.findall(rb'<link[^>]*rel="preload"[^>]*href="[.]/([^?]+)[?]', html)
        self.assertEqual(preloads, [b"fire-components.js", b"generation-tasks.js", b"script.js", b"workbench.js"])
        status, headers, host = self.get("/tools/fire-showcase/fire-host.js?v=" + self.runtime.bundle_revision)
        self.assertEqual(status, 200)
        self.assertIn(("?v=" + self.runtime.bundle_revision).encode(), host)
        self.assertNotIn(b"?v=20261019-fire-native-01", host)

    def test_only_current_public_versions_are_immutable_and_support_conditional_head(self):
        revision = self.runtime.bundle_revision
        for name in ("components.css", "fixture.png"):
            url = "/tools/fire-showcase/" + name + "?v=" + revision
            status, headers, content = self.get(url)
            self.assertEqual(status, 200)
            self.assertEqual(headers["Cache-Control"], "public, max-age=31536000, immutable")
            self.assertEqual(content, (self.root / "site" / name).read_bytes())
            etag = headers["ETag"]
            self.assertEqual(self.get(url, headers={"If-None-Match": etag})[0], 304)
            status, head, content = self.get(url, method="HEAD")
            self.assertEqual((status, head["ETag"], content), (200, etag, b""))
            for query in ("", "?v=old", "?v=" + revision + "&v=old"):
                self.assertEqual(self.get("/tools/fire-showcase/" + name + query)[1]["Cache-Control"], "no-cache")
        self.assertEqual(self.get("/tools/fire-showcase/?v=" + revision)[1]["Cache-Control"], "no-store")
        self.assertEqual(self.get("/tools/fire-showcase/escape.js?v=" + revision)[0], 404)

    def test_revision_changes_when_real_public_content_changes(self):
        old = self.runtime.bundle_revision
        (self.root / "site" / "fixture.png").write_bytes(b"changed-fixture")
        updated = self.new_runtime()
        self.assertNotEqual(updated.bundle_revision, old)
        self.server.runtime = updated
        self.assertEqual(self.get("/tools/fire-showcase/fixture.png?v=" + old)[1]["Cache-Control"], "no-cache")

    def test_get_and_head_weakly_compare_if_none_match_without_making_html_cacheable(self):
        url = "/tools/fire-showcase/components.css?v=" + self.runtime.bundle_revision
        etag = self.get(url)[1]["ETag"]
        for method in ("GET", "HEAD"):
            for condition in ("W/" + etag, '"unrelated", W/' + etag, "*"):
                status, headers, content = self.get(url, method=method, headers={"If-None-Match": condition})
                self.assertEqual(status, 304, (method, condition))
                self.assertEqual(headers["Cache-Control"], "public, max-age=31536000, immutable")
                self.assertEqual(headers["ETag"], etag)
                self.assertEqual(content, b"")
            self.assertEqual(self.get(url, method=method, headers={"If-None-Match": 'W/"unrelated"'})[0], 200)
            html_etag = self.get("/tools/fire-showcase/")[1]["ETag"]
            status, headers, _ = self.get("/tools/fire-showcase/", method=method, headers={"If-None-Match": "W/" + html_etag})
            self.assertEqual(status, 200)
            self.assertEqual(headers["Cache-Control"], "no-store")


class FireServerTests(unittest.TestCase):
    def setUp(self):
        self.provider_patch = patch.dict(adapter.PROVIDERS["quickrouter"], {})
        self.provider_patch.start()
        self.addCleanup(self.provider_patch.stop)
        self.base_env_patch = patch.dict(os.environ, {"FIRE_SHOWCASE_QUICKROUTER_BASE_URL": "https://api.quickrouter.ai"})
        self.base_env_patch.start()
        self.addCleanup(self.base_env_patch.stop)
        self.directory = tempfile.TemporaryDirectory()
        self.user = str(uuid.uuid4())
        self.other = str(uuid.uuid4())
        self.provider_calls, self.billing_calls, self.ledger = [], [], {}
        self.provider_targets = []
        self.owner_status = {}
        self.limit, self.provider_status = 1, 200
        self.reserve_denial = None
        self.provider_disconnect = self.reserve_disconnect = self.settle_disconnect = self.settle_unavailable = False
        self.fixture_lock = threading.Lock()
        owner = self

        class Fixture(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def do_POST(self):
                raw = self.rfile.read(int(self.headers["Content-Length"]))
                if self.path.startswith("/internal/"):
                    payload = json.loads(raw)
                    if self.headers.get("X-Fire-Bridge-Token") != "test-bridge":
                        self.respond(403, {"success": False})
                        return
                    with owner.fixture_lock:
                        owner.billing_calls.append((self.path, payload))
                        if self.path.endswith("/owner"):
                            status = owner.owner_status.get(payload["user_id"], 200)
                            self.respond(status, {"success": status == 200})
                            return
                        key = (payload["tenant_id"], payload["user_id"], payload["task_id"])
                        prior = owner.ledger.get(key)
                        if self.path.endswith("/reserve"):
                            if owner.reserve_denial:
                                self.respond(402, {"success": False, "message": owner.reserve_denial})
                                return
                            used = sum(1 for k, state in owner.ledger.items() if k[:2] == key[:2] and state != "failed")
                            if prior == "failed":
                                self.respond(409, {"success": False})
                                return
                            if prior is None and used >= owner.limit:
                                self.respond(402, {"success": False})
                                return
                            owner.ledger.setdefault(key, "reserved")
                            if owner.reserve_disconnect:
                                self.close_connection = True
                                return
                        else:
                            if owner.settle_unavailable:
                                self.respond(503, {"success": False})
                                return
                            if prior is None:
                                self.respond(404, {"success": False})
                                return
                            outcome = payload["outcome"]
                            if prior in ("succeeded", "failed") and prior != outcome:
                                self.respond(409, {"success": False})
                                return
                            owner.ledger[key] = outcome
                            if owner.settle_disconnect:
                                self.close_connection = True
                                return
                    self.respond(200, {"success": True, "data": {"id": payload["task_id"]}})
                    return
                message = BytesParser(policy=policy.default).parsebytes(
                    ("Content-Type: " + self.headers["Content-Type"] + "\r\n\r\n").encode() + raw)
                parts = list(message.iter_parts()) if message.is_multipart() else []
                owner.provider_calls.append({"path": self.path,
                                             "parts": [(p.get_param("name", header="content-disposition"), p.get_payload(decode=True)) for p in parts],
                                             "json": json.loads(raw) if not parts else None})
                if owner.provider_disconnect:
                    self.close_connection = True
                    return
                body = {"data": [{"b64_json": PNG}]} if owner.provider_status == 200 else {
                    "error": {"code": "fixture_rejection", "message": "Fixture rejected input"}}
                self.respond(owner.provider_status, body)

            def respond(self, status, body):
                encoded = json.dumps(body).encode()
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(encoded)))
                self.end_headers()
                self.wfile.write(encoded)

        self.fixture = ThreadingHTTPServer(("127.0.0.1", 0), Fixture)
        self.fixture_thread = threading.Thread(target=self.fixture.serve_forever, daemon=True)
        self.fixture_thread.start()
        original_run = subprocess.run

        def loopback_curl(command, **kwargs):
            self.assertEqual(command, ["curl", "--disable", "--config", "-"])
            config = kwargs["input"]
            replaced = 0
            for provider in adapter.PROVIDERS.values():
                for path in ("/v1/images/edits", "/v1/images/generations"):
                    endpoint = provider["baseUrl"] + path
                    if endpoint in config:
                        self.provider_targets.append(endpoint)
                        config = config.replace(endpoint, f"http://127.0.0.1:{self.fixture.server_port}" + path, 1)
                        replaced += 1
            self.assertEqual(replaced, 1, "fail closed: every provider request must target the loopback fixture")
            kwargs["input"] = config
            return original_run(command, **kwargs)

        self.curl_patch = patch.object(adapter.subprocess, "run", side_effect=loopback_curl)
        self.curl_patch.start()
        self.runtime = self.new_runtime()
        self.server = fire_server.make_server(self.runtime, "127.0.0.1", 0)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.runtime.stop()
        self.curl_patch.stop()
        self.fixture.shutdown()
        self.fixture.server_close()
        self.fixture_thread.join()
        self.directory.cleanup()

    def new_runtime(self):
        return fire_server.FireRuntime(Path(self.directory.name), "test-bridge",
                                       f"http://127.0.0.1:{self.fixture.server_port}/internal",
                                       submit=lambda prepared: adapter.submit_task_request(prepared, "sk-test-fire-fixture-only"))

    def restart(self):
        self.runtime.stop()
        self.runtime = self.new_runtime()
        self.server.runtime = self.runtime

    def payload(self, label="fixture composition"):
        return {"promptMode": "custom", "prompt": label, "modelChoice": "modelflare-image25",
                "count": 1, "size": "1k", "layoutHints": {"ratio": "1:1"}, "images": []}

    def enqueue(self, payload=None, user=None, key=None):
        status, response, _ = self.call("/api/generation-tasks",
                                        {"idempotencyKey": key or str(uuid.uuid4()), "payload": payload or self.payload()},
                                        user or self.user)
        self.assertEqual(status, 202)
        return response["task"]

    def task(self, task_id, user=None):
        status, response, _ = self.call("/api/generation-tasks/" + task_id, user=user or self.user)
        self.assertEqual(status, 200)
        return response["task"]

    def ledger_state(self, task_id, user=None):
        return self.ledger.get((7, user or self.user, task_id))

    def call(self, path, payload=None, user=None, token="test-bridge", tenant="7"):
        headers = {"Content-Type": "application/json"}
        if token is not None:
            headers["X-Fire-Bridge-Token"] = token
        if user is not None:
            headers.update({"X-Fire-User-ID": user, "X-Fire-Tenant-ID": tenant})
        connection = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=5)
        connection.request("POST" if payload is not None else "GET", path,
                           json.dumps(payload) if payload is not None else None, headers)
        response = connection.getresponse()
        content = response.read()
        result = json.loads(content) if response.getheader("Content-Type", "").startswith("application/json") else content
        status, response_headers = response.status, dict(response.getheaders())
        connection.close()
        return status, result, response_headers

    def test_native_headers_are_required_and_users_cannot_read_each_others_assets(self):
        for user, token, tenant in [(self.user, None, "7"), (self.user, "forged", "7"),
                                    (None, "test-bridge", "7"), ("../escape", "test-bridge", "7"),
                                    (self.user, "test-bridge", "0")]:
            self.assertEqual(self.call("/api/config", user=user, token=token, tenant=tenant)[0], 403)
        status, body, _ = self.call("/api/assets", {"dataUrl": "data:image/png;base64," + PNG}, self.user)
        self.assertEqual(status, 201)
        path = body["asset"]["url"]
        status, content, headers = self.call(path, user=self.user)
        self.assertEqual((status, content), (200, base64.b64decode(PNG)))
        self.assertEqual(headers["Cache-Control"], "no-store")
        version = "?v=" + self.runtime.bundle_revision
        for private in (path, "/api/config", "/api/generation-tasks"):
            status, _, private_headers = self.call(private + version, user=self.user)
            self.assertEqual(status, 200)
            self.assertEqual(private_headers["Cache-Control"], "no-store", private)
        self.assertEqual(self.call(path, user=self.other)[0], 404)
        self.assertEqual(self.call(path, user=self.user, tenant="8")[0], 404)
        status, config, _ = self.call("/api/config", user=self.user)
        self.assertEqual(status, 200)
        self.assertEqual(config["defaultModelChoice"], "quickrouter-image25-sunburst")
        self.assertEqual(config["modelOptions"], [])

    def test_zero_images_never_submits_and_recharge_requires_an_explicit_new_retry(self):
        self.limit = 0
        task = self.enqueue()
        self.assertTrue(self.runtime.run_once())
        failed = self.task(task["id"])
        self.assertEqual(failed["status"], "failed")
        self.assertEqual(failed["error"]["code"], "image_allowance_exhausted")
        self.assertEqual(self.provider_calls, [])
        self.assertIsNone(self.ledger_state(task["id"]))
        self.assertFalse(any(path.endswith("/settle") for path, _ in self.billing_calls))
        with self.runtime.owner(self.user, 7)[0]._connection() as connection:
            state = connection.execute("SELECT state FROM fire_billing WHERE task_id=?", (task["id"],)).fetchone()["state"]
        self.assertEqual(state, "denied", "a first-attempt 402 must not create a pending settlement")
        self.limit = 1
        self.assertFalse(self.runtime.run_once())
        status, response, _ = self.call(f"/api/generation-tasks/{task['id']}/retry", {"idempotencyKey": str(uuid.uuid4())}, self.user)
        self.assertEqual(status, 202)
        retry = response["task"]
        self.assertNotEqual(retry["id"], task["id"])
        self.runtime.run_once()
        self.assertEqual(self.task(retry["id"])["status"], "succeeded")
        self.assertEqual(self.ledger_state(retry["id"]), "succeeded")
        self.assertEqual(len(self.provider_calls), 1)

    def test_four_original_references_flow_through_real_adapter_and_private_download(self):
        with patch.dict(os.environ):
            os.environ.pop("FIRE_SHOWCASE_QUICKROUTER_BASE_URL", None)
            self.restart()
        self.assert_four_reference_pipeline("https://api.quickrouter.ai")

    def test_operator_domestic_base_pins_original_four_reference_multipart_pipeline(self):
        with patch.dict(os.environ, {"FIRE_SHOWCASE_QUICKROUTER_BASE_URL": "https://api.quickrouter.us"}):
            self.restart()
        # Later environment changes cannot reroute the running process. The
        # original default is restored by the test's environment context here.
        self.assert_four_reference_pipeline("https://api.quickrouter.us")

    def test_operator_base_rejects_unapproved_origins_and_url_components(self):
        for value in ("", "http://api.quickrouter.ai", "http://api.quickrouter.us",
                      "https://operator:secret@api.quickrouter.us", "https://api.quickrouter.us/v1",
                      "https://api.quickrouter.us/", "https://api.quickrouter.us?extra=1",
                      "https://api.quickrouter.us#fragment", "https://api.quickrouter.us:443",
                      "https://api.quickrouter.us.other.invalid", "https://modelflare.dev"):
            with self.subTest(value=value), patch.dict(os.environ, {"FIRE_SHOWCASE_QUICKROUTER_BASE_URL": value}):
                with self.assertRaisesRegex(ValueError, "FIRE_SHOWCASE_QUICKROUTER_BASE_URL"):
                    self.new_runtime()
        self.assertEqual(self.provider_calls, [])

    def assert_four_reference_pipeline(self, base):
        images = []
        for index, roles in enumerate((["face"], ["upper", "lower"], ["pose"], ["background"])):
            status, response, _ = self.call("/api/assets", {"name": f"reference-{index}.png", "dataUrl": "data:image/png;base64," + PNG}, self.user)
            self.assertEqual(status, 201)
            images.append({"id": str(index), "assetId": response["asset"]["id"], "roles": roles})
        payload = {**self.payload(), "promptMode": "default", "images": images}
        task = self.enqueue(payload)
        store = self.runtime.owner(self.user, 7)[0]
        prepared = self.runtime.prepare(store.snapshot(task["id"]), store.resolve_asset)
        self.assertEqual(prepared["endpoint"], base + "/v1/images/edits")
        self.assertEqual(prepared["provider"], "quickrouter")
        self.assertEqual(prepared["transport"], "multipart")
        self.runtime.run_once()
        result = self.task(task["id"])
        self.assertEqual((result["status"], self.ledger_state(task["id"])), ("succeeded", "succeeded"))
        parts = self.provider_calls[0]["parts"]
        self.assertEqual(self.provider_targets, [base + "/v1/images/edits"])
        files = [content for name, content in parts if name == "image[]"]
        self.assertEqual(files, [base64.b64decode(PNG)] * 4)
        self.assertIn(("model", b"gpt-image-2.5-sunburst"), parts)
        status, content, _ = self.call(result["result"]["images"][0], user=self.user)
        self.assertEqual((status, content), (200, base64.b64decode(PNG)))
        self.assertEqual(self.call(result["result"]["images"][0], user=self.other)[0], 404)
        self.assertEqual(self.call("/api/generation-tasks/" + task["id"], user=self.other)[0], 404)

    def test_concurrent_last_image_and_same_intent_only_deliver_and_charge_once(self):
        key = str(uuid.uuid4())
        with ThreadPoolExecutor(max_workers=4) as executor:
            tasks = list(executor.map(lambda _: self.enqueue(key=key), range(4)))
        self.assertEqual(len({task["id"] for task in tasks}), 1)
        second = self.enqueue(self.payload("different composition"))
        with ThreadPoolExecutor(max_workers=2) as executor:
            list(executor.map(lambda _: self.runtime.run_once(force_billing=True), range(2)))
        self.runtime.run_once(force_billing=True)
        self.assertEqual(len(self.provider_calls), 1)
        statuses = {self.task(task_id)["status"] for task_id in (tasks[0]["id"], second["id"])}
        self.assertEqual(statuses, {"succeeded", "failed"})
        self.restart()
        self.runtime.run_once(force_billing=True)
        self.assertEqual(len(self.provider_calls), 1)
        self.assertEqual(sum(state == "succeeded" for state in self.ledger.values()), 1)

    def test_definite_rejection_releases_allowance_for_explicit_retry(self):
        self.provider_status = 422
        task = self.enqueue()
        self.runtime.run_once()
        self.assertEqual((self.task(task["id"])["status"], self.ledger_state(task["id"])), ("failed", "failed"))
        self.provider_status = 200
        status, response, _ = self.call(f"/api/generation-tasks/{task['id']}/retry", {"idempotencyKey": str(uuid.uuid4())}, self.user)
        self.assertEqual(status, 202)
        self.runtime.run_once()
        self.assertEqual(self.ledger_state(response["task"]["id"]), "succeeded")
        self.assertEqual(len(self.provider_calls), 2)

    def test_unknown_provider_response_holds_allowance_and_restart_never_resubmits(self):
        self.provider_disconnect = True
        task = self.enqueue()
        self.runtime.run_once()
        self.assertEqual((self.task(task["id"])["status"], self.ledger_state(task["id"])), ("unknown", "unknown"))
        with patch.dict(os.environ, {"FIRE_SHOWCASE_QUICKROUTER_BASE_URL": "https://api.quickrouter.us"}):
            self.restart()
        self.runtime.run_once(force_billing=True)
        same = self.enqueue()
        self.assertEqual(same["id"], task["id"])
        self.assertEqual(self.call(f"/api/generation-tasks/{task['id']}/retry", {"idempotencyKey": str(uuid.uuid4())}, self.user)[0], 409)
        other_task = self.enqueue(self.payload("cannot bypass unknown with different prompt"))
        self.runtime.run_once()
        self.assertEqual(self.task(other_task["id"])["status"], "failed")
        self.assertEqual(len(self.provider_calls), 1)
        self.assertEqual(self.provider_targets, ["https://api.quickrouter.ai/v1/images/generations"],
                         "switching to the domestic node must never reissue a prior unknown request")

    def test_lost_billing_reply_and_restart_only_retries_accounting(self):
        self.settle_disconnect = True
        task = self.enqueue()
        self.runtime.run_once()
        self.assertEqual((self.task(task["id"])["status"], self.ledger_state(task["id"])), ("succeeded", "succeeded"))
        self.settle_disconnect = False
        self.restart()
        self.runtime.run_once(force_billing=True)
        self.runtime.run_once(force_billing=True)
        self.assertEqual(len(self.provider_calls), 1)
        settles = [body for path, body in self.billing_calls if path.endswith("/settle")]
        self.assertEqual(len(settles), 2)
        self.assertEqual({body["task_id"] for body in settles}, {task["id"]})

    def test_billing_outage_after_saved_image_recovers_without_provider_retry(self):
        self.settle_unavailable = True
        task = self.enqueue()
        self.runtime.run_once()
        self.assertEqual((self.task(task["id"])["status"], self.ledger_state(task["id"])), ("succeeded", "reserved"))
        self.restart()
        self.settle_unavailable = False
        self.runtime.run_once(force_billing=True)
        self.assertEqual(self.ledger_state(task["id"]), "succeeded")
        self.assertEqual(len(self.provider_calls), 1)

    def test_lost_reserve_reply_releases_hold_and_never_calls_provider(self):
        self.reserve_disconnect = True
        task = self.enqueue()
        self.runtime.run_once()
        self.assertEqual((self.task(task["id"])["status"], self.ledger_state(task["id"])), ("failed", "failed"))
        self.assertEqual(self.provider_calls, [])

    def test_prior_reservation_is_released_if_restart_admission_is_expired_or_suspended(self):
        self.limit = 2
        for denial in ("expired", "suspended"):
            with self.subTest(denial=denial):
                self.reserve_denial = None
                task = self.enqueue(self.payload(denial))
                store, billing, _ = self.runtime.owner(self.user, 7)
                store.claim(task["id"])
                billing.reserve(task["id"])
                self.assertEqual(self.ledger_state(task["id"]), "reserved")
                # Simulate a process interruption after native admission but
                # before the original worker persisted its submitting marker.
                self.restart()
                self.reserve_denial = denial
                self.runtime.run_once(force_billing=True)
                self.assertEqual(self.task(task["id"])["status"], "failed")
                self.assertEqual(self.ledger_state(task["id"]), "failed")
                self.assertEqual(self.provider_calls, [])
                self.reserve_denial = None

    def test_local_save_failure_keeps_hold_until_journal_recovery_and_then_settles(self):
        task = self.enqueue()
        store = self.runtime.owner(self.user, 7)[0]
        with patch.object(store, "save_result", side_effect=OSError("fixture disk full")):
            self.runtime.run_once()
        failed = self.task(task["id"])
        self.assertEqual(failed["status"], "failed")
        self.assertTrue(failed["error"]["localResultAvailable"])
        self.assertEqual(self.ledger_state(task["id"]), "unknown")
        self.restart()
        self.runtime.run_once(force_billing=True)
        self.assertEqual((self.task(task["id"])["status"], self.ledger_state(task["id"])), ("succeeded", "succeeded"))
        self.assertEqual(len(self.provider_calls), 1)

    def test_restarted_submitting_is_unknown_and_queued_work_uses_fair_owner_turns(self):
        one = self.enqueue(self.payload("first"))
        two = self.enqueue(self.payload("second"), user=self.other)
        store, billing, _ = self.runtime.owner(self.user, 7)
        store.claim(one["id"])
        billing.reserve(one["id"])
        store.mark(one["id"], "submitting")
        self.restart()
        self.runtime.run_once(force_billing=True)
        self.runtime.run_once(force_billing=True)
        self.assertEqual((self.task(one["id"])["status"], self.ledger_state(one["id"])), ("unknown", "unknown"))
        self.assertEqual(self.task(two["id"], self.other)["status"], "succeeded")
        self.assertEqual(len(self.provider_calls), 1)
        self.assertTrue(all(worker.thread is None for _, _, worker in self.runtime.owners.values()))

    def test_background_dispatcher_processes_native_http_tasks_with_one_thread(self):
        one = self.enqueue(self.payload("first background task"))
        self.enqueue(self.payload("second background task"))
        two = self.enqueue(self.payload("other user background task"), self.other)
        self.runtime.start()
        original_thread = self.runtime.thread
        self.runtime.start()
        self.assertIs(self.runtime.thread, original_thread)
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            statuses = (self.task(one["id"])["status"], self.task(two["id"], self.other)["status"])
            if statuses == ("succeeded", "succeeded"):
                break
            time.sleep(0.025)
        self.assertEqual(statuses, ("succeeded", "succeeded"))
        self.assertEqual(len(self.provider_calls), 2)
        self.assertTrue(all(worker.thread is None for _, _, worker in self.runtime.owners.values()))
        self.assertEqual(self.call("/__local/health", token=None)[0], 403)
        status, health, _ = self.call("/__local/health")
        self.assertEqual(status, 200)
        self.assertFalse(health["generationPaused"])

    def test_only_deleted_native_owner_is_cleaned_and_other_account_is_preserved(self):
        task_a = self.enqueue()
        task_b = self.enqueue(user=self.other)
        store_a = self.runtime.owner(self.user, 7)[0]
        store_b = self.runtime.owner(self.other, 7)[0]
        self.owner_status[self.user] = 410
        self.runtime.cleanup_deleted_owners(force=True)
        self.assertFalse(store_a.root.exists())
        self.assertTrue(store_b.root.is_dir())
        self.assertEqual(self.call("/api/generation-tasks/" + task_a["id"], user=self.user)[0], 403)
        self.assertEqual(self.task(task_b["id"], self.other)["status"], "queued")
        self.runtime.run_once()
        self.assertEqual(self.task(task_b["id"], self.other)["status"], "succeeded")
        self.assertEqual(len(self.provider_calls), 1)

    def test_paused_or_unreachable_native_owner_never_deletes_private_images(self):
        self.enqueue()
        self.enqueue(user=self.other)
        paths = [self.runtime.owner(user, 7)[0].root for user in (self.user, self.other)]
        self.owner_status.update({self.user: 403, self.other: 503})
        self.runtime.cleanup_deleted_owners(force=True)
        self.assertTrue(all(path.is_dir() for path in paths))
        self.assertEqual(self.call("/api/generation-tasks", user=self.user)[0], 200)
        self.assertEqual(self.call("/api/generation-tasks", user=self.other)[0], 200)

    def test_deleted_owner_waits_for_existing_http_read_before_removing_private_directory(self):
        status, response, _ = self.call("/api/assets", {"dataUrl": "data:image/png;base64," + PNG}, self.user)
        self.assertEqual(status, 201)
        store = self.runtime.owner(self.user, 7)[0]
        started, release = threading.Event(), threading.Event()
        resolve = store.resolve_asset
        def slow_read(identifier):
            started.set()
            release.wait(5)
            return resolve(identifier)
        with patch.object(store, "resolve_asset", side_effect=slow_read), ThreadPoolExecutor(max_workers=1) as executor:
            reading = executor.submit(self.call, response["asset"]["url"], user=self.user)
            self.assertTrue(started.wait(2))
            self.owner_status[self.user] = 410
            self.runtime.cleanup_deleted_owners(force=True)
            self.assertTrue(store.root.is_dir())
            self.assertEqual(self.call("/api/generation-tasks", user=self.user)[0], 403)
            release.set()
            self.assertEqual(reading.result(timeout=3)[0], 200)
        self.runtime.cleanup_deleted_owners(force=True)
        self.assertFalse(store.root.exists())

    def test_unavailable_private_disk_returns_a_safe_native_http_error(self):
        with patch.object(self.runtime, "acquire_owner", side_effect=OSError("fixture private storage unavailable")):
            status, response, _ = self.call("/api/generation-tasks", user=self.user)
        self.assertEqual(status, 500)
        self.assertEqual(response["code"], "local_storage_failed")
        self.assertEqual(self.provider_calls, [])


if __name__ == "__main__":
    unittest.main()
