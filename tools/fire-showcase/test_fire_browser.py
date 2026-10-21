"""Actual HTML, host, four source scripts and HTTP in a private offline browser."""
import json
import os
import subprocess
import tempfile
import threading
import unittest
import uuid
from pathlib import Path
from urllib.parse import urlsplit

import fire_server


@unittest.skipUnless(os.environ.get("FIRE_SHOWCASE_TEST_CHROME"), "Set FIRE_SHOWCASE_TEST_CHROME to an existing local Chromium executable")
class BrowserStartupTests(unittest.TestCase):
    def test_parallel_public_downloads_keep_source_order_and_hidden_workspace_state(self):
        user = str(uuid.uuid4())
        scripts = {"fire-components.js", "generation-tasks.js", "script.js", "workbench.js"}
        started, requests = {}, []
        all_started = threading.Event()
        lock = threading.Lock()
        counts = {"bootstrap": 0, "tasks": 0}
        parallel_at_bootstrap = []
        owner = self

        class Fixture(fire_server.Handler):
            def do_GET(self):
                path = urlsplit(self.path).path
                with lock:
                    requests.append(("GET", path))
                if path == "/fixture-host":
                    content = ("<!doctype html><html><body><script>localStorage.clear();"
                               "localStorage.setItem('weknora_user',JSON.stringify({id:" + json.dumps(user) + "}));"
                               "localStorage.setItem('weknora_token','fixture-native-token');</script>"
                               '<iframe src="/tools/fire-showcase/"></iframe></body></html>').encode()
                    self.send_response(200)
                    self.send_header("Content-Type", "text/html")
                    self.send_header("Content-Length", str(len(content)))
                    self.end_headers()
                    self.wfile.write(content)
                    return
                if path == "/fixture-stats":
                    with lock:
                        self.send_json(200, counts.copy())
                    return
                if path == "/api/v1/fire-showcase/bootstrap":
                    owner.assertEqual(self.headers.get("Authorization"), "Bearer fixture-native-token")
                    with lock:
                        counts["bootstrap"] += 1
                    self.send_json(200, {"success": True, "data": {"user_id": user, "tenant_id": 7,
                        "allowance": {"status": "active", "remaining_images": 2}}})
                    return
                if path == "/api/v1/fire-showcase/api/config":
                    all_started.wait(3)
                    parallel_at_bootstrap.append(all_started.is_set())
                self.native_path()
                return super().do_GET()

            def do_POST(self):
                with lock:
                    requests.append(("POST", urlsplit(self.path).path))
                self.native_path()
                return super().do_POST()

            def send_json(self, status, data):
                if urlsplit(self.path).path == "/api/config" and status == 200:
                    data = {**data, "fireIdentity": {"user_id": user, "tenant_id": 7},
                        "fireAllowance": {"status": "active", "remaining_images": 2}}
                return super().send_json(status, data)

            def native_path(self):
                prefix = "/api/v1/fire-showcase"
                if self.path.startswith(prefix + "/api/"):
                    if urlsplit(self.path).path == prefix + "/api/generation-tasks":
                        with lock:
                            counts["tasks"] += 1
                    self.path = self.path[len(prefix):]
                    self.headers["X-Fire-Bridge-Token"] = "fixture-bridge"
                    self.headers["X-Fire-User-ID"] = user
                    self.headers["X-Fire-Tenant-ID"] = "7"

            def send_head(self):
                name = Path(urlsplit(self.path).path).name
                if name in scripts:
                    with lock:
                        started[name] = started.get(name, 0) + 1
                        if set(started) == scripts:
                            all_started.set()
                    all_started.wait(3)
                return super().send_head()

        with tempfile.TemporaryDirectory() as data:
            runtime = fire_server.FireRuntime(data, "fixture-bridge", "http://127.0.0.1:1/internal",
                submit=lambda prepared: self.fail("browser startup must never submit a provider generation"))
            with fire_server.ThreadingHTTPServer(("127.0.0.1", 0), Fixture) as server:
                server.runtime = runtime
                thread = threading.Thread(target=server.serve_forever, daemon=True)
                thread.start()
                try:
                    result = subprocess.run(["node", str(Path(__file__).with_name("fire_browser_fixture.mjs")),
                        f"http://127.0.0.1:{server.server_port}/fixture-host"], text=True,
                        capture_output=True, timeout=30)
                    self.assertEqual(result.returncode, 0, result.stdout + result.stderr + repr({"counts": counts, "started": started, "requests": requests}))
                    self.assertTrue(json.loads(result.stdout)["ready"])
                    self.assertTrue(all(parallel_at_bootstrap), "all four public script requests must start while native config is pending")
                    self.assertEqual(started, {name: 1 for name in scripts}, "preloads must be reused, never downloaded twice")
                    self.assertFalse(any("/assets/brand/" in path for _, path in requests), "hidden branding must not download")
                    self.assertFalse(any(method == "POST" and "generation-tasks" in path for method, path in requests))
                finally:
                    server.shutdown()
                    thread.join()


if __name__ == "__main__":
    unittest.main()
