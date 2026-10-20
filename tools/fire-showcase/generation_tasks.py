"""Private immutable assets and crash-safe, explicitly retried image tasks."""

import base64
import contextlib
import fcntl
import hashlib
import json
import os
import re
import sqlite3
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path

from modelflare_adapter import MODEL_CHOICES, ProviderError, _image_data, _SIZES, _LEGACY_1K_SIZES
from reference_workflow import build_prompt

ACTIVE = ("queued", "preparing", "submitting", "unknown")
DEFINITE_REJECTIONS = {400, 401, 403, 404, 413, 422}
_ASSET_ID = re.compile(r"sha256_[a-f0-9]{64}\Z")
# No application input-size ceiling; providers and available storage still have
# their own limits. Keep the public configuration name for existing consumers.
MAX_ASSET_BYTES = None


class TaskConflict(ValueError):
    pass


class TaskNotFound(ValueError):
    pass


class SubmissionBlocked(ValueError):
    """An optional admission hook refused execution before provider transport."""

    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def _now():
    return datetime.now(timezone.utc).isoformat()


def _canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)


def _key(value):
    try:
        return str(uuid.UUID(value))
    except (ValueError, TypeError, AttributeError):
        raise ValueError("每次生成意图必须提供有效 UUID idempotencyKey。") from None


class GenerationStore:
    def __init__(self, root):
        self.root = Path(root)
        if self.root.is_symlink():
            raise ValueError("私有数据目录不能是符号链接。")
        self.root.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.root.chmod(0o700)
        self.assets_dir = self.root / "assets"
        if self.assets_dir.is_symlink():
            raise ValueError("素材目录不能是符号链接。")
        self.assets_dir.mkdir(exist_ok=True, mode=0o700)
        self.assets_dir.chmod(0o700)
        self.responses_dir = self.root / "responses"
        if self.responses_dir.is_symlink():
            raise ValueError("响应目录不能是符号链接。")
        self.responses_dir.mkdir(exist_ok=True, mode=0o700)
        self.responses_dir.chmod(0o700)
        self.database = self.root / "generation.sqlite3"
        descriptor = os.open(self.database, os.O_CREAT | os.O_RDWR, 0o600)
        os.close(descriptor)
        self.database.chmod(0o600)
        with self._connection() as connection:
            connection.executescript("""
                CREATE TABLE IF NOT EXISTS assets (
                    id TEXT PRIMARY KEY, name TEXT NOT NULL, mime TEXT NOT NULL,
                    bytes INTEGER NOT NULL, created_at TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS tasks (
                    id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, payload TEXT NOT NULL,
                    status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
                    retry_of TEXT, error TEXT, result TEXT);
                CREATE TABLE IF NOT EXISTS intents (
                    key TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, task_id TEXT NOT NULL, retry_of TEXT);
                CREATE INDEX IF NOT EXISTS task_fingerprint ON tasks(fingerprint, status);
            """)
            connection.execute("BEGIN IMMEDIATE")
            if "retry_of" not in {row["name"] for row in connection.execute("PRAGMA table_info(intents)")}:
                connection.execute("ALTER TABLE intents ADD COLUMN retry_of TEXT")
            if "compiled_prompt" not in {row["name"] for row in connection.execute("PRAGMA table_info(tasks)")}:
                connection.execute("ALTER TABLE tasks ADD COLUMN compiled_prompt TEXT")
            # Upgrade older local snapshots once. Never recompile a frozen row
            # merely because the installed system prompt has changed.
            for row in connection.execute("SELECT id,payload FROM tasks WHERE compiled_prompt IS NULL").fetchall():
                try:
                    compiled = build_prompt(json.loads(row["payload"]))
                except (ValueError, TypeError):
                    compiled = ""  # An un-reconstructable snapshot must not submit.
                connection.execute("UPDATE tasks SET compiled_prompt=? WHERE id=? AND compiled_prompt IS NULL", (compiled, row["id"]))
            connection.commit()

    @contextlib.contextmanager
    def _connection(self):
        connection = sqlite3.connect(self.database, timeout=15, isolation_level=None)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA synchronous=FULL")
        try:
            yield connection
        finally:
            connection.close()

    def add_asset(self, data_url, name="image"):
        validated = _image_data(data_url)
        data = base64.b64decode(validated["data"], validate=True)
        identifier = "sha256_" + hashlib.sha256(data).hexdigest()
        name = name.strip() if isinstance(name, str) and name.strip() else "image"
        destination = self.assets_dir / identifier
        temporary = self.assets_dir / (".upload-" + uuid.uuid4().hex)
        try:
            descriptor = os.open(temporary, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
            with os.fdopen(descriptor, "wb") as output:
                output.write(data)
                output.flush()
                os.fsync(output.fileno())
            try:
                os.link(temporary, destination)
            except FileExistsError:
                pass
            self._sync_directory(self.assets_dir)
        finally:
            temporary.unlink(missing_ok=True)
        with self._connection() as connection:
            connection.execute("INSERT OR IGNORE INTO assets VALUES (?, ?, ?, ?, ?)",
                               (identifier, name, validated["mime_type"], len(data), _now()))
        return self.asset(identifier)

    @staticmethod
    def _sync_directory(path):
        descriptor = os.open(path, os.O_RDONLY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)

    def asset(self, identifier):
        if not isinstance(identifier, str) or not _ASSET_ID.fullmatch(identifier):
            raise TaskNotFound("素材不存在。")
        with self._connection() as connection:
            row = connection.execute("SELECT * FROM assets WHERE id = ?", (identifier,)).fetchone()
        path = self.assets_dir / identifier
        if row is None or path.is_symlink() or not path.is_file() or path.resolve().parent != self.assets_dir.resolve():
            raise TaskNotFound("素材不存在。")
        return {"id": row["id"], "name": row["name"], "mime": row["mime"], "bytes": row["bytes"],
                "url": f"/api/assets/{identifier}/content"}

    def resolve_asset(self, identifier):
        asset = self.asset(identifier)
        path = self.assets_dir / identifier
        if hashlib.sha256(path.read_bytes()).hexdigest() != identifier.removeprefix("sha256_"):
            raise ValueError("素材完整性校验失败，尚未调用模型。")
        return {**asset, "path": path}

    def validate_payload(self, payload):
        if not isinstance(payload, dict):
            raise ValueError("生成输入必须是 JSON 对象。")
        snapshot = json.loads(_canonical({key: payload[key] for key in (
            "promptMode", "prompt", "poseStrict", "layoutHints", "modelChoice", "size", "count", "images") if key in payload}))
        images = snapshot.get("images", [])
        if not isinstance(images, list):
            raise ValueError("参考图必须是数组。")
        for image in images:
            if not isinstance(image, dict) or any(key in image for key in ("path", "dataUrl", "image_url")):
                raise ValueError("任务仅接受已上传素材的 assetId，不能指定文件路径或内联图片。")
        snapshot["images"] = [{key: image[key] for key in ("id", "assetId", "roles") if key in image} for image in images]
        if snapshot.get("modelChoice") not in MODEL_CHOICES:
            raise ValueError("请选择已接入的 Image 2.5 模型。")
        if type(snapshot.get("count")) is not int or snapshot["count"] != 1:
            raise ValueError("每个任务仅支持生成一张图片。")
        if snapshot.get("size", "auto") not in ("auto", "1k", "1K", *_SIZES.values(), *_LEGACY_1K_SIZES):
            raise ValueError("当前模型仅支持 1K 图片。")
        hints = snapshot.get("layoutHints", {})
        ratio = hints.get("ratio", "竖版 3:4") if isinstance(hints, dict) else None
        if not isinstance(ratio, str) or not re.search(r"(?<![0-9])(?:1:1|3:4|4:3|9:16|16:9)(?![0-9])", ratio):
            raise ValueError("图片比例无效。")
        build_prompt(snapshot)
        images = snapshot.get("images", [])
        for image in images:
            if "dataUrl" in image or "image_url" in image:
                raise ValueError("任务仅接受已上传素材的 assetId。")
            self.asset(image.get("assetId"))
        return snapshot

    def _task(self, row, *, connection):
        if row is None:
            raise TaskNotFound("生成任务不存在。")
        payload = json.loads(row["payload"])
        error = json.loads(row["error"]) if row["error"] else None
        # A list cursor may already hold this connection's read lock. Opening a
        # second reader here can wait behind a committing worker, while that
        # worker waits for the first cursor: both HTTP reads then time out.
        # Read aliases in the caller's existing snapshot instead.
        keys = [item["key"] for item in connection.execute("SELECT key FROM intents WHERE task_id=? ORDER BY rowid", (row["id"],))]
        return {"id": row["id"], "status": row["status"], "createdAt": row["created_at"],
                "updatedAt": row["updated_at"], "modelChoice": payload["modelChoice"],
                "referenceCount": len(payload.get("images", [])), "error": error,
                "canRetry": row["status"] == "failed", "retryOf": row["retry_of"],
                "result": json.loads(row["result"]) if row["result"] else None,
                "idempotencyKey": keys[0] if keys else None, "idempotencyKeys": keys}

    def enqueue(self, idempotency_key, payload, *, retry_of=None):
        key = _key(idempotency_key)
        snapshot = self.validate_payload(payload)
        serialized = _canonical(snapshot)
        fingerprint = hashlib.sha256(serialized.encode()).hexdigest()
        with self._connection() as connection:
            connection.execute("BEGIN IMMEDIATE")
            prior = connection.execute("SELECT * FROM intents WHERE key = ?", (key,)).fetchone()
            if prior:
                if prior["fingerprint"] != fingerprint or prior["retry_of"] != retry_of:
                    raise TaskConflict("相同 idempotencyKey 不能用于不同的输入。")
                row = connection.execute("SELECT * FROM tasks WHERE id = ?", (prior["task_id"],)).fetchone()
                connection.commit()
                return self._task(row, connection=connection)
            compiled = self.compiled_prompt(retry_of) if retry_of else build_prompt(snapshot)
            candidates = connection.execute("SELECT * FROM tasks WHERE fingerprint = ? ORDER BY created_at DESC", (fingerprint,)).fetchall()
            row = next((item for item in candidates if item["status"] == "unknown"), None)
            if row is None:
                row = next((item for item in candidates if
                            (item["status"] in ACTIVE and item["compiled_prompt"] == compiled) or
                            (item["compiled_prompt"] == compiled and item["error"] and
                             json.loads(item["error"]).get("localResultAvailable"))), None)
            if row is None:
                identifier, now = str(uuid.uuid4()), _now()
                connection.execute("INSERT INTO tasks (id,fingerprint,payload,status,created_at,updated_at,retry_of,error,result,compiled_prompt) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?)",
                                   (identifier, fingerprint, serialized, "queued", now, now, retry_of, compiled))
                row = connection.execute("SELECT * FROM tasks WHERE id = ?", (identifier,)).fetchone()
            connection.execute("INSERT INTO intents VALUES (?, ?, ?, ?)", (key, fingerprint, row["id"], retry_of))
            connection.commit()
            return self._task(row, connection=connection)

    def get_task(self, identifier):
        with self._connection() as connection:
            return self._task(connection.execute("SELECT * FROM tasks WHERE id = ?", (identifier,)).fetchone(), connection=connection)

    def list_tasks(self):
        with self._connection() as connection:
            return [self._task(row, connection=connection) for row in connection.execute("SELECT * FROM tasks ORDER BY created_at DESC")]

    def snapshot(self, identifier):
        with self._connection() as connection:
            row = connection.execute("SELECT payload FROM tasks WHERE id = ?", (identifier,)).fetchone()
        if row is None:
            raise TaskNotFound("生成任务不存在。")
        return json.loads(row["payload"])

    def compiled_prompt(self, identifier):
        """Server-compiled immutable prompt; never accepted from an HTTP client."""
        with self._connection() as connection:
            row = connection.execute("SELECT compiled_prompt FROM tasks WHERE id=?", (identifier,)).fetchone()
        if row is None:
            raise TaskNotFound("生成任务不存在。")
        prompt = row["compiled_prompt"]
        if not isinstance(prompt, str) or not prompt.strip():
            raise ValueError("任务的冻结提示词不可用，请创建新的生成意图。")
        return prompt

    def retry(self, identifier, idempotency_key):
        key = _key(idempotency_key)
        with self._connection() as connection:
            prior = connection.execute("SELECT * FROM intents WHERE key=?", (key,)).fetchone()
        if prior:
            if prior["retry_of"] != identifier:
                raise TaskConflict("此 idempotencyKey 已绑定其他生成意图。")
            return self.get_task(prior["task_id"])
        task = self.get_task(identifier)
        if not task["canRetry"]:
            raise TaskConflict("仅明确失败的任务可以显式重试；结果未知时请先核对上游记录，不能重复提交。")
        if (task.get("error") or {}).get("localResultAvailable"):
            payload = self.snapshot(identifier)
            fingerprint = hashlib.sha256(_canonical(payload).encode()).hexdigest()
            with self._connection() as connection:
                connection.execute("BEGIN IMMEDIATE")
                prior = connection.execute("SELECT * FROM intents WHERE key=?", (key,)).fetchone()
                if prior:
                    if prior["retry_of"] != identifier:
                        raise TaskConflict("此 idempotencyKey 已绑定其他生成意图。")
                else:
                    connection.execute("INSERT INTO intents VALUES (?, ?, ?, ?)", (key, fingerprint, identifier, identifier))
                connection.commit()
            self.restore_local_result(identifier)
            return self.get_task(identifier)
        return self.enqueue(idempotency_key, self.snapshot(identifier), retry_of=identifier)

    def cancel(self, identifier):
        with self._connection() as connection:
            connection.execute("BEGIN IMMEDIATE")
            row = connection.execute("SELECT * FROM tasks WHERE id = ?", (identifier,)).fetchone()
            task = self._task(row, connection=connection)
            if task["status"] != "queued":
                raise TaskConflict("只能取消尚未开始的任务。")
            connection.execute("UPDATE tasks SET status='cancelled', error=?, updated_at=? WHERE id=?",
                               (_canonical({"code": "cancelled", "message": "任务已在提交前取消，未调用模型。"}), _now(), identifier))
            connection.commit()
        return self.get_task(identifier)

    def recover_interrupted(self):
        """Called only while holding the cross-process worker lock."""
        for task in self.list_tasks():
            if task["status"] in ("submitting", "unknown", "failed") and self._journal_path(task["id"]).is_file():
                self.restore_local_result(task["id"])
        with self._connection() as connection:
            connection.execute("BEGIN IMMEDIATE")
            connection.execute("UPDATE tasks SET status='queued',updated_at=? WHERE status='preparing'", (_now(),))
            connection.execute("UPDATE tasks SET status='unknown',error=?,updated_at=? WHERE status='submitting'",
                               (_canonical({"code": "interrupted_submission", "message": "上次进程在提交阶段中断，结果与扣费未知；已隔离，不能自动重发。"}), _now()))
            connection.commit()

    def claim(self, identifier=None):
        with self._connection() as connection:
            connection.execute("BEGIN IMMEDIATE")
            # Another frozen rule version can already be queued when the first
            # request becomes unknown. Do not let it bypass uncertain billing.
            for queued in connection.execute("SELECT id,fingerprint FROM tasks WHERE status='queued'").fetchall():
                unknown = connection.execute("SELECT id FROM tasks WHERE fingerprint=? AND status='unknown' LIMIT 1", (queued["fingerprint"],)).fetchone()
                if unknown:
                    connection.execute("UPDATE tasks SET status='unknown',error=?,updated_at=? WHERE id=?",
                                       (_canonical({"code": "blocked_by_unknown_input", "phase": "queued", "outcome": "not_sent",
                                                    "relatedTaskId": unknown["id"], "message": "相同输入已有结果未知的任务，本任务已隔离且未再次调用模型；请先核对上游记录。"}), _now(), queued["id"]))
            if identifier is None:
                row = connection.execute("SELECT * FROM tasks WHERE status='queued' ORDER BY created_at LIMIT 1").fetchone()
            else:
                row = connection.execute("SELECT * FROM tasks WHERE status='queued' AND id=?", (identifier,)).fetchone()
            if row is not None:
                connection.execute("UPDATE tasks SET status='preparing',updated_at=? WHERE id=? AND status='queued'", (_now(), row["id"]))
            connection.commit()
        return row["id"] if row else None

    def mark(self, identifier, status, *, error=None, result=None):
        with self._connection() as connection:
            connection.execute("UPDATE tasks SET status=?,error=?,result=?,updated_at=? WHERE id=?",
                               (status, _canonical(error) if error else None, _canonical(result) if result else None, _now(), identifier))

    def save_result(self, result):
        if not isinstance(result, dict) or not isinstance(result.get("images"), list) or len(result["images"]) != 1:
            raise ValueError("模型没有返回单张可保存图片。")
        asset = self.add_asset(result["images"][0], "generated.png")
        return {"images": [asset["url"]], "model": result.get("model"), "size": result.get("size")}

    def _journal_path(self, identifier):
        return self.responses_dir / (str(uuid.UUID(identifier)) + ".json")

    def journal_result(self, identifier, result):
        if not isinstance(result, dict) or not isinstance(result.get("images"), list) or len(result["images"]) != 1:
            raise ValueError("模型没有返回单张合格图片。")
        _image_data(result["images"][0])
        path = self._journal_path(identifier)
        temporary = path.with_name("." + uuid.uuid4().hex)
        try:
            descriptor = os.open(temporary, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
            with os.fdopen(descriptor, "w") as output:
                output.write(_canonical(result))
                output.flush()
                os.fsync(output.fileno())
            os.replace(temporary, path)
            self._sync_directory(self.responses_dir)
        finally:
            temporary.unlink(missing_ok=True)

    def restore_local_result(self, identifier):
        try:
            path = self._journal_path(identifier)
            if path.is_symlink():
                raise ValueError("Invalid response journal")
            result = self.save_result(json.loads(path.read_text()))
            self.mark(identifier, "succeeded", result=result)
        except Exception:
            self.mark(identifier, "failed", error={"code": "local_result_save_failed", "message": "模型已返回结果，正在等待本地保存恢复；重试仅恢复保存，不重新调用模型。", "localResultAvailable": True})


class GenerationWorker:
    def __init__(self, store, prepare, submit, *, before_submit=None):
        self.store, self.prepare, self.submit = store, prepare, submit
        self.before_submit = before_submit
        self.stop_event = threading.Event()
        self.thread = None

    @contextlib.contextmanager
    def _exclusive(self):
        descriptor = os.open(self.store.root / "worker.lock", os.O_CREAT | os.O_RDWR, 0o600)
        try:
            try:
                fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                yield False
                return
            yield True
        finally:
            os.close(descriptor)

    def recover(self):
        with self._exclusive() as acquired:
            if acquired:
                self.store.recover_interrupted()

    def run_once(self, task_id=None):
        with self._exclusive() as acquired:
            if not acquired:
                return False
            self.store.recover_interrupted()
            identifier = self.store.claim(task_id)
            if not identifier:
                return False
            try:
                payload = self.store.validate_payload(self.store.snapshot(identifier))
                prepared = self.prepare(payload, self.store.resolve_asset)
                # The prepared adapter interface is a dictionary with a body
                # dictionary. Assets/options are revalidated locally, while the
                # final prompt always comes from this task's creation snapshot.
                if not isinstance(prepared, dict) or not isinstance(prepared.get("body"), dict):
                    raise ValueError("Prepared request has no body")
                prepared["body"]["prompt"] = self.store.compiled_prompt(identifier)
            except Exception:
                self.store.mark(identifier, "failed", error={"code": "preparation_failed", "phase": "preparing", "outcome": "not_sent", "message": "素材或生成参数准备失败，尚未提交模型；请核对素材后显式重试。"})
                return True
            if self.before_submit:
                try:
                    self.before_submit(identifier)
                except SubmissionBlocked as error:
                    self.store.mark(identifier, "failed", error={"code": error.code, "phase": "preparing", "outcome": "not_sent", "message": str(error)})
                    return True
            self.store.mark(identifier, "submitting")
            try:
                result = self.submit(prepared)
                self.store.journal_result(identifier, result)
                self.store.restore_local_result(identifier)
            except ProviderError as error:
                outcome = getattr(error, "outcome", None)
                definite = outcome in ("not_sent", "rejected") if outcome else error.status in DEFINITE_REJECTIONS
                message = "请求尚未送出，可核对输入后显式重试。" if outcome == "not_sent" else "模型明确拒绝本次请求，可核对上游记录后显式重试。" if definite else "模型结果或扣费状态未知，请核对上游记录；不会自动重发。"
                details = {"code": error.code or "provider_error", "message": message,
                           "phase": getattr(error, "phase", None) or "submitting", "providerStatus": error.status,
                           "requestId": error.request_id, "outcome": outcome or ("rejected" if definite else "unknown")}
                # ProviderError contains only the adapter's sanitized diagnostics;
                # raw HTTP bodies and exception strings are never persisted.
                for field, value in (("providerParam", error.param), ("providerMessage", error.message),
                                     ("providerType", error.error_type), ("transport", error.transport)):
                    if value is not None:
                        details[field] = value
                self.store.mark(identifier, "failed" if definite else "unknown", error=details)
            except Exception:
                self.store.mark(identifier, "unknown", error={"code": "submission_unconfirmed", "phase": "submitting", "outcome": "unknown", "message": "提交后未能确认并保存合格图片，生成与扣费状态未知；不会自动重发。"})
            return True

    def start(self):
        if self.thread and self.thread.is_alive():
            return
        def loop():
            while not self.stop_event.is_set():
                try:
                    worked = self.run_once()
                except Exception:
                    worked = False
                if not worked:
                    self.stop_event.wait(0.25)
        self.thread = threading.Thread(target=loop, name="generation-worker", daemon=True)
        self.thread.start()

    def stop(self):
        self.stop_event.set()
        if self.thread:
            self.thread.join(timeout=2)
