#!/usr/bin/env python3
"""Local durable image tasks. Provider execution is paused unless enabled."""

import argparse
import json
import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

from generation_tasks import GenerationStore, GenerationWorker, TaskConflict, TaskNotFound, MAX_ASSET_BYTES
from modelflare_adapter import DEFAULT_MODEL_CHOICE, MODEL_OPTIONS, PROVIDERS
from reference_workflow import WORKFLOW_CONFIG, preview_prompt

ROOT = Path(__file__).resolve().parent
KEY_FILE = ROOT / ".env"
def _load_key(name):
    value = os.environ.get(name, "")
    if not value and KEY_FILE.exists():
        for line in KEY_FILE.read_text().splitlines():
            if line.startswith(name + "="):
                value = line.partition("=")[2].strip()
    return value


# API_KEY is the legacy Modelflare script interface. It must never be used as a
# fallback for QuickRouter, even when the new provider has no configured key.
API_KEY = _load_key(PROVIDERS["modelflare"]["credentialEnv"])
QUICKROUTER_API_KEY = _load_key(PROVIDERS["quickrouter"]["credentialEnv"])
ALLOW_GENERATION = False
IMAGE_TRANSPORT = os.environ.get("MODELFLARE_IMAGE_TRANSPORT", "json").strip().lower()
if IMAGE_TRANSPORT not in ("json", "multipart"):
    raise ValueError("MODELFLARE_IMAGE_TRANSPORT 只能是 json 或 multipart。")
STORE = None
CONFIG = json.loads((ROOT / "public-config.json").read_text())
CONFIG.update(publicMode=True, requireLogin=False, registrationEnabled=False,
              asyncGenerationEnabled=False, durableGenerationEnabled=True,
              maxUploadBytes=MAX_ASSET_BYTES, referenceWorkflow=WORKFLOW_CONFIG,
              defaultModelChoice=DEFAULT_MODEL_CHOICE)
CONFIG["modelOptions"] = MODEL_OPTIONS
UNAVAILABLE = {"error": "本地仅接入图像合成与提示词预览；登录、识图和充值暂不可用。"}


def task_store():
    global STORE
    if STORE is None:
        STORE = GenerationStore(ROOT / "private-data")
    return STORE


def prepare_task(payload, resolve_asset):
    from modelflare_adapter import prepare_task_request
    return prepare_task_request(payload, resolve_asset, edit_transport=IMAGE_TRANSPORT)


def submit_task(prepared):
    from modelflare_adapter import prepared_provider, submit_task_request
    provider = prepared_provider(prepared)
    key = QUICKROUTER_API_KEY if provider == "quickrouter" else API_KEY
    return submit_task_request(prepared, key)


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, ".mjs": "text/javascript",
                      ".wasm": "application/wasm", ".tflite": "application/octet-stream"}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / "site"), **kwargs)

    def task_store(self):
        return task_store()

    def translate_path(self, path):
        translated = Path(super().translate_path(path))
        if not translated.resolve().is_relative_to((ROOT / "site").resolve()):
            return str(ROOT / "site" / "__forbidden_path__")
        return str(translated)

    def end_headers(self):
        self.send_header("Content-Security-Policy", "connect-src 'self' blob: data:")
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()

    def send_json(self, status, data):
        content = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(content)

    def local_request(self, *, mutation=False):
        port = self.server.server_port
        if self.headers.get("Host") not in (f"127.0.0.1:{port}", f"localhost:{port}"):
            self.send_json(403, {"error": "只接受本机请求。", "code": "local_only"})
            return False
        origin = self.headers.get("Origin")
        if mutation and origin and origin not in (f"http://127.0.0.1:{port}", f"http://localhost:{port}"):
            self.send_json(403, {"error": "只接受本机页面请求。", "code": "origin_rejected"})
            return False
        return True

    def api_response(self):
        path = urlsplit(self.path).path
        if not (path.startswith("/api/") or path == "/__local/health"):
            return False
        if not self.local_request():
            return True
        try:
            if path == "/__local/health":
                self.send_json(200, {"status": "ok", "mode": "durable-generation",
                                     "durableGenerationEnabled": True, "generationSubmitted": False,
                                     "generationPaused": not ALLOW_GENERATION})
            elif path == "/api/config":
                self.send_json(200, {**CONFIG, "generationPaused": not ALLOW_GENERATION,
                                     "generationSubmitted": False})
            elif path == "/api/generation-tasks":
                self.send_json(200, {"tasks": self.task_store().list_tasks()})
            elif path.startswith("/api/generation-tasks/") and len(path.strip("/").split("/")) == 3:
                self.send_json(200, {"task": self.task_store().get_task(path.rsplit("/", 1)[1])})
            elif path.startswith("/api/assets/") and path.endswith("/content"):
                identifier = path[len("/api/assets/"):-len("/content")]
                asset = self.task_store().resolve_asset(identifier)
                etag = '"' + asset["id"] + '"'
                if self.headers.get("If-None-Match") == etag:
                    self.send_response(304)
                    self.send_header("ETag", etag)
                    self.end_headers()
                else:
                    content = asset["path"].read_bytes()
                    self.send_response(200)
                    self.send_header("Content-Type", asset["mime"])
                    self.send_header("Content-Length", str(len(content)))
                    self.send_header("Cache-Control", "private, max-age=31536000, immutable")
                    self.send_header("ETag", etag)
                    self.end_headers()
                    if self.command != "HEAD":
                        self.wfile.write(content)
            else:
                self.send_json(501, UNAVAILABLE)
        except TaskNotFound as error:
            self.send_json(404, {"error": str(error), "code": "not_found"})
        except ValueError as error:
            self.send_json(400, {"error": str(error), "code": "invalid_request"})
        except Exception:
            self.send_json(500, {"error": "本地数据读取失败，请保留任务记录后检查磁盘。", "code": "local_storage_failed"})
        return True

    def do_GET(self):
        if not self.api_response():
            super().do_GET()

    def do_HEAD(self):
        if not self.api_response():
            super().do_HEAD()

    def do_POST(self):
        path = urlsplit(self.path).path
        if not self.local_request(mutation=True):
            return
        if path == "/api/generate":
            self.send_json(410, {"error": "旧的无任务生成入口已停用，请使用持久化生成任务。", "code": "use_generation_tasks"})
            return
        if self.headers.get_content_type() != "application/json":
            self.send_json(415, {"error": "请提交 JSON 请求。", "code": "json_required"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0:
                raise ValueError("请求必须包含非空 JSON 内容。")
            content = self.rfile.read(length)
            if len(content) != length:
                raise ValueError("请求体不完整，请重新提交完整内容。")
            payload = json.loads(content)
            if not isinstance(payload, dict):
                raise ValueError("请求必须是 JSON 对象。")
            if path == "/api/prompt":
                self.send_json(200, preview_prompt(payload))
            elif path == "/api/assets":
                self.send_json(201, {"asset": self.task_store().add_asset(payload.get("dataUrl"), payload.get("name"))})
            elif path == "/api/generation-tasks":
                self.send_json(202, {"task": self.task_store().enqueue(payload.get("idempotencyKey"), payload.get("payload"))})
            elif path.startswith("/api/generation-tasks/"):
                parts = path.strip("/").split("/")
                if len(parts) != 4 or parts[3] not in ("retry", "cancel"):
                    raise TaskNotFound("任务操作不存在。")
                task = self.task_store().retry(parts[2], payload.get("idempotencyKey")) if parts[3] == "retry" else self.task_store().cancel(parts[2])
                self.send_json(202 if parts[3] == "retry" else 200, {"task": task})
            else:
                self.send_json(501, UNAVAILABLE)
        except TaskConflict as error:
            self.send_json(409, {"error": str(error), "code": "conflict"})
        except TaskNotFound as error:
            self.send_json(404, {"error": str(error), "code": "not_found"})
        except (ValueError, UnicodeError) as error:
            self.send_json(400, {"error": str(error), "code": "invalid_request"})
        except Exception:
            self.send_json(500, {"error": "本地保存失败，请保留同一提交标识后重新确认。", "code": "local_storage_failed"})

    def unsupported_write(self):
        self.send_json(501, UNAVAILABLE)

    do_PUT = unsupported_write
    do_PATCH = unsupported_write
    do_DELETE = unsupported_write


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=5173)
    execution = parser.add_mutually_exclusive_group()
    execution.add_argument("--allow-generation", action="store_true", help="允许持久任务 worker 持续处理队列")
    execution.add_argument("--execute-task", metavar="TASK_ID", help="仅执行一个已授权的排队任务，不启动其他任务")
    args = parser.parse_args()
    ALLOW_GENERATION = args.allow_generation
    worker = GenerationWorker(task_store(), prepare_task, submit_task)
    if args.execute_task:
        worker.run_once(args.execute_task)
        task = task_store().get_task(args.execute_task)
        print(json.dumps({"task": task}, ensure_ascii=False))
        sys.exit(0 if task["status"] == "succeeded" else 1)
    worker.recover()
    if ALLOW_GENERATION:
        worker.start()
    with ThreadingHTTPServer(("127.0.0.1", args.port), Handler) as http_server:
        print(f"Alphai 本地前端：http://127.0.0.1:{args.port}（生成{'开启' if ALLOW_GENERATION else '暂停'}）", flush=True)
        try:
            http_server.serve_forever()
        except KeyboardInterrupt:
            pass
        finally:
            worker.stop()
