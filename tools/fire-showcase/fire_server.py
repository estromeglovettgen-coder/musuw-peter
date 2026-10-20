#!/usr/bin/env python3
"""Internal Fire adapter for the copied durable generation workbench.

Only the native authenticated proxy may supply owner headers. One dispatcher
uses the original workers without creating a thread for every account. Its
durable accounting outbox only retries native callbacks, never provider calls.
"""
import argparse
import hashlib
import hmac
import io
import json
import logging
import os
import re
import shutil
import threading
import time
import uuid
from http.server import ThreadingHTTPServer
from http.client import HTTPException
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

import server as source
from generation_tasks import GenerationStore, GenerationWorker, SubmissionBlocked
from modelflare_adapter import DEFAULT_MODEL_CHOICE

_OWNER_DIR = re.compile(r"([1-9][0-9]*)-([a-f0-9-]{36})\Z")


class OwnerStore(GenerationStore):
    def validate_payload(self, payload):
        if isinstance(payload, dict):
            payload = {**payload, "modelChoice": DEFAULT_MODEL_CHOICE}
        return super().validate_payload(payload)


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


class BillingCallbacks:
    def __init__(self, store, user_id, tenant_id, url, token):
        self.store, self.user_id, self.tenant_id = store, user_id, tenant_id
        self.url, self.token = url.rstrip("/"), token
        self.transport = build_opener(_NoRedirect())
        with store._connection() as connection:
            connection.execute("""CREATE TABLE IF NOT EXISTS fire_billing (
                task_id TEXT PRIMARY KEY, state TEXT NOT NULL,
                settled_outcome TEXT, next_attempt REAL NOT NULL DEFAULT 0)""")

    def _call(self, operation, task_id=None, outcome=None):
        payload = {"user_id": self.user_id, "tenant_id": self.tenant_id}
        if task_id is not None:
            payload["task_id"] = task_id
        if outcome is not None:
            payload["outcome"] = outcome
        request = Request(self.url + "/" + operation, data=json.dumps(payload).encode(),
                          headers={"Content-Type": "application/json", "X-Fire-Bridge-Token": self.token}, method="POST")
        with self.transport.open(request, timeout=5) as response:
            result = json.load(response)
            if response.status != 200 or not isinstance(result, dict) or result.get("success") is not True:
                raise ValueError("Native billing did not confirm the operation")

    def reserve(self, task_id):
        # Persist intent first: a dropped reserve response can already have held
        # allowance remotely. The same task UUID makes retry/release idempotent.
        with self.store._connection() as connection:
            first_attempt = connection.execute("INSERT OR IGNORE INTO fire_billing(task_id,state) VALUES (?, 'pending')", (task_id,)).rowcount == 1
        try:
            self._call("reserve", task_id)
        except HTTPError as error:
            status = error.code
            error.close()
            if status == 402:
                # A prior admitted request may have crashed before submitting.
                # Expiry/suspension now denies replay, but its existing hold
                # still needs the definite-not-sent failed settlement below.
                if first_attempt:
                    with self.store._connection() as connection:
                        connection.execute("UPDATE fire_billing SET state='denied' WHERE task_id=?", (task_id,))
                raise SubmissionBlocked("image_allowance_exhausted", "图片额度不足或套餐不可用，请联系管理员追加图片额度后显式重试。") from None
            raise SubmissionBlocked("image_billing_unavailable", "图片额度暂时无法确认，尚未调用模型；请稍后显式重试。") from None
        except (OSError, ValueError, URLError, HTTPException):
            raise SubmissionBlocked("image_billing_unavailable", "图片额度暂时无法确认，尚未调用模型；请稍后显式重试。") from None
        with self.store._connection() as connection:
            connection.execute("UPDATE fire_billing SET state='reserved' WHERE task_id=?", (task_id,))

    def reconcile(self, *, force=False):
        with self.store._connection() as connection:
            rows = connection.execute("""SELECT b.*,t.status,t.error FROM fire_billing b
                JOIN tasks t ON t.id=b.task_id WHERE b.state!='denied'""").fetchall()
        for row in rows:
            error = json.loads(row["error"]) if row["error"] else {}
            if row["status"] == "succeeded":
                outcome = "succeeded"
            elif row["status"] == "unknown" or error.get("localResultAvailable"):
                outcome = "unknown"
            elif row["status"] in ("failed", "cancelled"):
                outcome = "failed"
            else:
                continue
            if row["settled_outcome"] == outcome or (not force and row["next_attempt"] > time.time()):
                continue
            try:
                self._call("settle", row["task_id"], outcome)
            except (OSError, ValueError, URLError, HTTPException) as error:
                if isinstance(error, HTTPError):
                    error.close()
                with self.store._connection() as connection:
                    connection.execute("UPDATE fire_billing SET next_attempt=? WHERE task_id=?", (time.time() + 5, row["task_id"]))
                continue
            with self.store._connection() as connection:
                connection.execute("UPDATE fire_billing SET settled_outcome=?,next_attempt=0 WHERE task_id=?", (outcome, row["task_id"]))


class FireRuntime:
    def __init__(self, data_dir, bridge_token, billing_url, *, prepare=None, submit=None):
        if not isinstance(bridge_token, str) or not bridge_token.strip():
            raise ValueError("FIRE_SHOWCASE_BRIDGE_TOKEN is required")
        parsed = urlsplit(billing_url)
        if parsed.scheme not in ("http", "https") or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
            raise ValueError("FIRE_SHOWCASE_BILLING_URL must be an internal HTTP URL")
        quickrouter_base = os.environ.get("FIRE_SHOWCASE_QUICKROUTER_BASE_URL", "https://api.quickrouter.ai")
        if quickrouter_base not in ("https://api.quickrouter.ai", "https://api.quickrouter.us"):
            raise ValueError("FIRE_SHOWCASE_QUICKROUTER_BASE_URL must be an approved official HTTPS origin")
        source.PROVIDERS["quickrouter"]["baseUrl"] = quickrouter_base
        self.data_dir = Path(data_dir)
        if self.data_dir.is_symlink():
            raise ValueError("Showcase data directory cannot be a symlink")
        self.data_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.owners_dir = self.data_dir / "owners"
        if self.owners_dir.is_symlink():
            raise ValueError("Showcase owners directory cannot be a symlink")
        self.owners_dir.mkdir(exist_ok=True, mode=0o700)
        self.data_dir.chmod(0o700)
        self.owners_dir.chmod(0o700)
        self.bridge_token, self.billing_url = bridge_token, billing_url
        self.prepare, self.submit = prepare or source.prepare_task, submit or source.submit_task
        self.lock, self.owners = threading.RLock(), {}
        self.dispatch_lock = threading.RLock()
        self.active_requests, self.deleted_owners, self.next_owner_check = {}, set(), {}
        self.cursor, self.stop_event, self.thread = 0, threading.Event(), None
        self._load_public_bundle()
        self._scan()

    def _load_public_bundle(self):
        # Production code is mounted read-only. Hash the public site once per
        # runtime, including paths, so every deployment gets one stable revision.
        self.site_root = (source.ROOT / "site").resolve()
        bundle = hashlib.sha256()
        self.public_files, templates = {}, {}
        for path in sorted(self.site_root.rglob("*")):
            if not path.is_file() or path.is_symlink() or not path.resolve().is_relative_to(self.site_root):
                continue
            relative = path.relative_to(self.site_root).as_posix()
            content = path.read_bytes()
            bundle.update(relative.encode() + b"\0" + str(len(content)).encode() + b"\0" + content)
            self.public_files[relative] = '"' + hashlib.sha256(content).hexdigest() + '"'
            if relative in ("index.html", "fire-host.js"):
                templates[relative] = content
        self.bundle_revision = bundle.hexdigest()
        self.public_templates = {
            name: re.sub(rb"\?v=[a-zA-Z0-9_-]+", b"?v=" + self.bundle_revision.encode(), content)
            for name, content in templates.items()
        }
        for name, content in self.public_templates.items():
            self.public_files[name] = '"' + hashlib.sha256(content).hexdigest() + '"'

    @staticmethod
    def owner_identity(user_id, tenant_id):
        user = str(uuid.UUID(user_id))
        tenant = int(tenant_id)
        if tenant < 1 or tenant > (2 ** 64 - 1):
            raise ValueError("Invalid tenant")
        return user, tenant

    def owner(self, user_id, tenant_id):
        user, tenant = self.owner_identity(user_id, tenant_id)
        key = f"{tenant}-{user}"
        with self.lock:
            if key in self.deleted_owners:
                raise ValueError("Native owner has been deleted")
            if key not in self.owners:
                store = OwnerStore(self.owners_dir / key)
                billing = BillingCallbacks(store, user, tenant, self.billing_url, self.bridge_token)
                worker = GenerationWorker(store, self.prepare, self.submit, before_submit=billing.reserve)
                self.owners[key] = (store, billing, worker)
                self.next_owner_check[key] = 0
            return self.owners[key]

    def acquire_owner(self, user_id, tenant_id):
        with self.lock:
            store = self.owner(user_id, tenant_id)[0]
            key = store.root.name
            self.active_requests[key] = self.active_requests.get(key, 0) + 1
            return key

    def release_owner(self, key):
        with self.lock:
            self.active_requests[key] -= 1

    def cleanup_deleted_owners(self, *, force=False):
        # Called on the dispatcher's thread, between provider operations. HTTP
        # leases prevent removal while an existing upload/read uses this owner.
        with self.dispatch_lock:
            with self.lock:
                owners = list(self.owners.items())
            for key, (store, billing, _) in owners:
                if key not in self.deleted_owners:
                    if not force and self.next_owner_check.get(key, 0) > time.monotonic():
                        continue
                    self.next_owner_check[key] = time.monotonic() + 300
                    try:
                        billing._call("owner")
                    except HTTPError as error:
                        status = error.code
                        error.close()
                        if status != 410:
                            continue
                        with self.lock:
                            self.deleted_owners.add(key)
                    except (OSError, ValueError, URLError, HTTPException):
                        continue
                    else:
                        continue
                with self.lock:
                    if self.active_requests.get(key, 0):
                        continue
                    path = store.root
                    if (self.data_dir.is_symlink() or self.owners_dir.is_symlink() or path.is_symlink()
                            or not _OWNER_DIR.fullmatch(key)
                            or path.parent.resolve() != self.owners_dir.resolve()
                            or path.resolve().parent != self.owners_dir.resolve()):
                        logging.error("Refusing unsafe deleted-owner cleanup")
                        continue
                    try:
                        if path.exists():
                            shutil.rmtree(path)
                        self.owners.pop(key, None)
                        self.active_requests.pop(key, None)
                        self.next_owner_check.pop(key, None)
                    except OSError:
                        logging.error("Deleted-owner cleanup will retry when private storage is available")

    def _scan(self):
        for directory in sorted(self.owners_dir.iterdir()):
            match = _OWNER_DIR.fullmatch(directory.name)
            if match and directory.is_dir() and not directory.is_symlink():
                self.owner(match[2], match[1])

    def run_once(self, *, force_billing=False):
        with self.dispatch_lock:
            self.cleanup_deleted_owners()
            with self.lock:
                owners = sorted(key for key in self.owners if key not in self.deleted_owners)
                if not owners:
                    return False
                key = owners[self.cursor % len(owners)]
                self.cursor = (self.cursor + 1) % len(owners)
                _, billing, worker = self.owners[key]
            worked = worker.run_once()
            billing.reconcile(force=force_billing)
            return worked

    def start(self):
        if self.thread and self.thread.is_alive():
            return
        def dispatch():
            while not self.stop_event.is_set():
                try:
                    worked = self.run_once()
                except Exception:
                    logging.exception("Showcase dispatcher failed; provider execution is never retried after submission")
                    worked = False
                if not worked:
                    self.stop_event.wait(0.25)
        self.thread = threading.Thread(target=dispatch, name="fire-showcase-dispatcher", daemon=True)
        self.thread.start()

    def stop(self):
        self.stop_event.set()
        if self.thread:
            self.thread.join(timeout=6)


class Handler(source.Handler):
    def handle_one_request(self):
        self.owner_lease = None
        self.lease_runtime = None
        self.public_cache = None
        try:
            super().handle_one_request()
        finally:
            if self.owner_lease is not None:
                self.lease_runtime.release_owner(self.owner_lease)
                self.owner_lease = None

    def log_message(self, *args):
        # Paths and payloads can contain private account data.
        pass

    def _token_valid(self):
        values = self.headers.get_all("X-Fire-Bridge-Token", [])
        return len(values) == 1 and hmac.compare_digest(values[0], self.server.runtime.bridge_token)

    def local_request(self, *, mutation=False):
        try:
            if not self._token_valid():
                raise ValueError("Invalid bridge token")
            if urlsplit(self.path).path == "/__local/health":
                return True
            user = self.headers.get_all("X-Fire-User-ID", [])
            tenant = self.headers.get_all("X-Fire-Tenant-ID", [])
            if len(user) != 1 or len(tenant) != 1:
                raise ValueError("Missing native identity")
            self.identity = self.server.runtime.owner_identity(user[0], tenant[0])
            self.lease_runtime = self.server.runtime
            self.owner_lease = self.lease_runtime.acquire_owner(*self.identity)
            return True
        except (ValueError, TypeError, AttributeError):
            self.send_json(403, {"error": "请通过火种登录后访问展示面。", "code": "native_auth_required"})
            return False
        except Exception:
            self.send_json(500, {"error": "私有素材目录暂时无法读取或保存，请保留任务记录后稍后重试。", "code": "local_storage_failed"})
            return False

    def task_store(self):
        # A deletion discovered after this request acquired its lease blocks new
        # requests while allowing this in-flight read/upload to finish safely.
        with self.lease_runtime.lock:
            return self.lease_runtime.owners[self.owner_lease][0]

    def api_response(self):
        if urlsplit(self.path).path == "/__local/health":
            if self.local_request():
                self.send_json(200, {"status": "ok", "mode": "fire-showcase",
                                     "durableGenerationEnabled": True, "generationPaused": False})
            return True
        if urlsplit(self.path).path == "/api/config":
            if self.local_request():
                self.send_json(200, {**source.CONFIG, "modelOptions": [], "hideModelChoice": True,
                                     "defaultModelChoice": DEFAULT_MODEL_CHOICE, "generationPaused": False,
                                     "requireLogin": False, "nativeAuthentication": True,
                                     "signupCredits": 0, "rechargePackages": [], "generationSubmitted": False})
            return True
        return super().api_response()

    def send_header(self, keyword, value):
        if keyword.lower() == "cache-control":
            value = self.public_cache or "no-store"
        super().send_header(keyword, value)

    def send_head(self):
        runtime = self.server.runtime
        path = Path(self.translate_path(self.path))
        if path.is_dir():
            path = path / "index.html"
        try:
            relative = path.resolve().relative_to(runtime.site_root).as_posix()
            if path.is_symlink() or relative not in runtime.public_files:
                raise ValueError("Not a public file")
            content = runtime.public_templates.get(relative)
            stream = io.BytesIO(content) if content is not None else path.open("rb")
        except (OSError, ValueError):
            self.send_error(404)
            return None
        is_html = path.suffix.lower() == ".html"
        version = parse_qs(urlsplit(self.path).query).get("v")
        self.public_cache = "no-store" if is_html else (
            "public, max-age=31536000, immutable" if version == [runtime.bundle_revision] else "no-cache")
        etag = runtime.public_files[relative]
        conditional = self.headers.get("If-None-Match", "").split(",")
        unchanged = not is_html and any(value.strip() == "*" or value.strip().removeprefix("W/") == etag
                                        for value in conditional)
        self.send_response(304 if unchanged else 200)
        self.send_header("Cache-Control", self.public_cache)
        self.send_header("ETag", etag)
        if not unchanged:
            self.send_header("Content-Type", self.guess_type(str(path)))
            self.send_header("Content-Length", str(len(content) if content is not None else path.stat().st_size))
        self.end_headers()
        if unchanged:
            stream.close()
            return None
        return stream

    def translate_path(self, path):
        prefix = "/tools/fire-showcase"
        if path == prefix or path.startswith(prefix + "/"):
            path = path[len(prefix):] or "/"
        return super().translate_path(path)

    def unsupported_write(self):
        if self.local_request(mutation=True):
            super().unsupported_write()

    do_PUT = unsupported_write
    do_PATCH = unsupported_write
    do_DELETE = unsupported_write


def make_server(runtime, host="0.0.0.0", port=5179):
    httpd = ThreadingHTTPServer((host, port), Handler)
    httpd.runtime = runtime
    return httpd


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="0.0.0.0", choices=("0.0.0.0", "127.0.0.1"))
    parser.add_argument("--port", default=5179, type=int)
    args = parser.parse_args()
    runtime = FireRuntime(os.environ.get("FIRE_SHOWCASE_DATA_DIR", "/data/showcase"),
                          os.environ.get("FIRE_SHOWCASE_BRIDGE_TOKEN", ""),
                          os.environ.get("FIRE_SHOWCASE_BILLING_URL", ""))
    runtime.start()
    with make_server(runtime, args.host, args.port) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
        finally:
            runtime.stop()


if __name__ == "__main__":
    main()
