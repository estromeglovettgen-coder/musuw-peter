"""Cold-start acceptance against actual HTML and all four source scripts.

Only loopback native HTTP responses are delayed. Public downloads, application
code, IndexedDB and the generation client run in the existing Chromium fixture.
No existing source file is rewritten, and no worker/provider is started.
"""
import json
import os
import subprocess
import tempfile
import threading
import time
import unittest
import uuid
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

import fire_server


@unittest.skipUnless(os.environ.get("FIRE_SHOWCASE_TEST_CHROME"), "Set FIRE_SHOWCASE_TEST_CHROME to an existing local Chromium executable")
class ColdStartLatencyTests(unittest.TestCase):
    def test_one_authenticated_config_and_tasks_do_not_gate_cold_editor_readiness(self):
        user = str(uuid.uuid4())
        allowance = {"status": "active", "remaining_images": 0}
        scripts = {"fire-components.js", "generation-tasks.js", "script.js", "workbench.js"}
        editor_ready = threading.Event()
        lock = threading.Lock()
        times, observations, downloads, writes = {}, {}, {}, []
        counts = {"bootstrap": 0, "config": 0, "tasks": 0}
        owner = self

        def mark(name):
            with lock:
                times[name] = time.monotonic()

        class Fixture(fire_server.Handler):
            def do_GET(self):
                parsed = urlsplit(self.path)
                path = parsed.path
                if path == "/fixture-host":
                    mark("navigation")
                    content = ("<!doctype html><html><body><script>localStorage.clear();"
                        "localStorage.setItem('weknora_user',JSON.stringify({id:" + json.dumps(user) + "}));"
                        "localStorage.setItem('weknora_token','fixture-native-token');"
                        "addEventListener('message',event=>{const frame=document.querySelector('iframe');"
                        "if(event.origin!==location.origin||event.source!==frame?.contentWindow||event.data?.type!=='fire-showcase:state'||event.data.state!=='ready')return;"
                        "void fetch('/fixture-ready?canGenerate='+String(frame.contentWindow.FireShowcaseHost.canGenerate()));});</script>"
                        '<iframe src="/tools/fire-showcase/"></iframe></body></html>').encode()
                    self.send_response(200)
                    self.send_header("Content-Type", "text/html")
                    self.send_header("Content-Length", str(len(content)))
                    self.end_headers()
                    self.wfile.write(content)
                    return
                if path == "/fixture-ready":
                    mark("ready")
                    observations["ready_can_generate"] = parse_qs(parsed.query).get("canGenerate") == ["true"]
                    observations["startup_config_requests"] = counts["config"]
                    observations["startup_bootstrap_requests"] = counts["bootstrap"]
                    editor_ready.set()
                    self.send_json(200, {"success": True})
                    return
                if path == "/fixture-stats":
                    with lock:
                        self.send_json(200, counts.copy())
                    return
                if path == "/api/v1/fire-showcase/bootstrap":
                    owner.assertEqual(self.headers.get("Authorization"), "Bearer fixture-native-token")
                    with lock:
                        counts["bootstrap"] += 1
                    self.send_json(200, {"success": True, "data": {"user_id": user, "tenant_id": 7, "allowance": allowance}})
                    return
                prefix = "/api/v1/fire-showcase"
                if path.startswith(prefix + "/api/"):
                    # A parallel read must still carry the exact native bearer.
                    owner.assertEqual(self.headers.get("Authorization"), "Bearer fixture-native-token")
                    if path == prefix + "/api/config":
                        with lock:
                            counts["config"] += 1
                        mark("config_start")
                        time.sleep(0.4)
                        mark("config_end")
                    if path == prefix + "/api/generation-tasks":
                        with lock:
                            counts["tasks"] += 1
                            initial = counts["tasks"] == 1
                        if initial:
                            mark("tasks_start")
                            time.sleep(0.4)
                            observations["editor_ready_before_task_response"] = editor_ready.wait(0.8)
                            mark("tasks_end")
                    self.path = self.path[len(prefix):]
                    self.headers["X-Fire-Bridge-Token"] = "fixture-bridge"
                    self.headers["X-Fire-User-ID"] = user
                    self.headers["X-Fire-Tenant-ID"] = "7"
                return super().do_GET()

            def do_POST(self):
                writes.append(urlsplit(self.path).path)
                self.send_json(200, {"prompt": "offline fixture", "valid": False, "errors": []})

            def send_json(self, status, data):
                # The real Go adapter adds this owner-scoped field to config.
                if urlsplit(self.path).path == "/api/config" and status == 200:
                    data = {**data, "fireIdentity": {"user_id": user, "tenant_id": 7}, "fireAllowance": allowance}
                return super().send_json(status, data)

            def send_head(self):
                name = Path(urlsplit(self.path).path).name
                if name in scripts:
                    with lock:
                        downloads[name] = downloads.get(name, 0) + 1
                return super().send_head()

        with tempfile.TemporaryDirectory() as data:
            runtime = fire_server.FireRuntime(data, "fixture-bridge", "http://127.0.0.1:1/internal",
                submit=lambda prepared: self.fail("cold startup cannot submit a provider generation"))
            with fire_server.ThreadingHTTPServer(("127.0.0.1", 0), Fixture) as server:
                server.runtime = runtime
                thread = threading.Thread(target=server.serve_forever, daemon=True)
                thread.start()
                try:
                    result = subprocess.run(["node", str(Path(__file__).with_name("fire_browser_fixture.mjs")),
                        f"http://127.0.0.1:{server.server_port}/fixture-host"], text=True,
                        capture_output=True, timeout=30)
                    self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                    self.assertTrue(json.loads(result.stdout)["ready"])
                    evidence = {"timing_ms": {name: round((value - times["navigation"]) * 1000)
                        for name, value in times.items()}, **observations}
                    print(json.dumps(evidence, sort_keys=True), flush=True)
                    self.assertEqual(downloads, {name: 1 for name in scripts})
                    self.assertEqual(observations["startup_config_requests"], 1, "host and source must consume one authenticated config response")
                    self.assertEqual(observations["startup_bootstrap_requests"], 0, "cold entry must not request a second identity/bootstrap response")
                    self.assertEqual(counts["config"], 1)
                    self.assertEqual(counts["bootstrap"], 1, "returning to a ready editor refreshes allowance once")
                    self.assertGreaterEqual(times["ready"], times["config_end"], "unverified identity must never reveal an editor")
                    self.assertFalse(observations["ready_can_generate"], "zero owner allowance must never grant generation")
                    self.assertFalse(any("generation-tasks" in path or "assets" in path for path in writes))
                    with self.subTest("historical task network must not hide the authenticated editor"):
                        self.assertTrue(observations["editor_ready_before_task_response"], evidence)
                        self.assertLess(times["ready"], times["tasks_end"], evidence)
                finally:
                    server.shutdown()
                    thread.join()


if __name__ == "__main__":
    unittest.main()
