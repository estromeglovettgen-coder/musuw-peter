"""Translate the local form to one pinned Image 2.5 provider request.

generate validates the entire input before transport(endpoint, body, api_key) is
called. Transport returns (HTTP status, decoded JSON). Neither layer retries.
"""

import base64
import binascii
import hashlib
import json
import re
import struct
import subprocess
import time
import unicodedata
import zlib
from pathlib import Path
from tempfile import TemporaryDirectory

from reference_workflow import build_prompt


MODEL = "gpt-image-2.5-flare"
MODEL_CHOICE = "modelflare-image25"
DEFAULT_MODEL_CHOICE = "quickrouter-image25-sunburst"
PROVIDERS = {
    "quickrouter": {"label": "QuickRouter", "baseUrl": "https://api.quickrouter.ai",
                    "credentialEnv": "QUICKROUTER_API_KEY", "editTransport": "multipart"},
    "modelflare": {"label": "Modelflare", "baseUrl": "https://modelflare.dev",
                   "credentialEnv": "MODELFLARE_API_KEY"},
}
MODEL_PROVIDERS = {
    DEFAULT_MODEL_CHOICE: "quickrouter",
    MODEL_CHOICE: "modelflare",
    "modelflare-image25-sunburst": "modelflare",
}
MODEL_CHOICES = {
    DEFAULT_MODEL_CHOICE: "gpt-image-2.5-sunburst",
    MODEL_CHOICE: MODEL,
    "modelflare-image25-sunburst": "gpt-image-2.5-sunburst",
}
MODEL_OPTIONS = [{
    "id": choice,
    "label": f"GPT Image 2.5 {'Sunburst' if model.endswith('sunburst') else 'Flare'} · {PROVIDERS[MODEL_PROVIDERS[choice]]['label']}",
    "description": "持久任务，单张 1K；原图 multipart 上传，不压缩、不自动重试" if MODEL_PROVIDERS[choice] == "quickrouter" else "备用线路；模型按 Token 计费，不自动切换线路",
    "tokenCost": 1,
} for choice, model in MODEL_CHOICES.items()]
ENDPOINT = "https://modelflare.dev/v1/images/edits"
GENERATIONS_ENDPOINT = "https://modelflare.dev/v1/images/generations"
TASK_EDITS_ENDPOINT = "https://modelflare.dev/v1/images/edits"
TASK_GENERATIONS_ENDPOINT = "https://modelflare.dev/v1/images/generations"
TASK_MULTIPART_EDITS_ENDPOINT = "https://modelflare.dev/v1/images/edits"
_SIZES = {"1:1": "1024x1024", "3:4": "768x1024", "4:3": "1024x768", "9:16": "720x1280", "16:9": "1280x720"}
_LEGACY_1K_SIZES = ("576x1024", "1024x576")
_DATA_URL = re.compile(r"data:(image/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)\Z")
_SAFE_PROVIDER_FIELD = re.compile(r"[A-Za-z0-9_.:/-]{1,120}\Z")
_CURL_WRITE_OUT = 'write-out = "\\n%{http_code}|%{http_version}|%{size_upload}|%{size_download}|%{time_total}|%{time_starttransfer}"'
_CURL_FAILURES = {
    5: "无法解析代理地址", 6: "无法解析接口域名", 7: "无法连接接口服务器",
    16: "HTTP/2 协议传输失败", 23: "本机无法写入响应", 26: "本机无法读取请求内容",
    28: "等待接口响应超时", 35: "TLS 握手失败", 52: "连接关闭，未返回 HTTP 响应",
    55: "向接口发送数据失败", 56: "接收响应失败，连接中断", 60: "服务器证书验证失败",
    92: "HTTP/2 数据流被异常关闭",
}


class ProviderError(ValueError):
    """A provider failure with safe diagnostics; status None means unknown."""

    def __init__(self, status, *, code=None, param=None, request_id=None, error_type=None, message=None,
                 outcome=None, phase="generation", transport=None):
        self.status = status
        self.code = code
        self.param = param
        self.request_id = request_id
        self.error_type = error_type
        self.message = message
        self.phase = phase
        self.transport = transport
        self.outcome = outcome or ("rejected" if status in (400, 401, 403, 404, 413, 415, 422) else "unknown")
        details = [f"HTTP {status}" if status is not None else "状态未知"]
        if code:
            details.append(f"code={code}")
        if param:
            details.append(f"param={param}")
        super().__init__(f"图像接口请求失败（{'；'.join(details)}）；本地不会自动重试。")


def _safe_provider_message(value, api_key):
    # Inspect the complete explanation before truncating; secrets past character
    # 300 must reject the entire value, not expose an apparently safe prefix.
    if not isinstance(value, str) or not value.strip() or api_key in value:
        return None
    if re.search(r"authorization|bearer|sk-|data:image|base64|[A-Za-z0-9+/]{80,}", value, re.IGNORECASE):
        return None
    if any(unicodedata.category(character).startswith("C") for character in value):
        return None
    return value.strip()[:300]


def _safe_provider_fields(response, api_key):
    """Keep safe identifiers and a bounded diagnostic, never raw provider data."""
    if not isinstance(response, dict):
        return {}
    error = response.get("error", response)
    if not isinstance(error, dict):
        error = {}
    safe = {}
    for field in ("code", "type", "param", "request_id"):
        value = error.get(field)
        if field == "request_id" and value is None:
            value = response.get(field)
        if isinstance(value, str) and _SAFE_PROVIDER_FIELD.fullmatch(value) and api_key not in value:
            safe[field] = value
    message = _safe_provider_message(error.get("message"), api_key)
    if message is not None:
        safe["message"] = message
        if "request_id" not in safe:
            match = re.search(r"\(request id:\s*([A-Za-z0-9_.:/-]{1,120})\)", error["message"], re.IGNORECASE)
            if match and api_key not in match[1]:
                safe["request_id"] = match[1]
    return safe


def _png_container(data):
    if not data.startswith(b"\x89PNG\r\n\x1a\n"):
        return False
    offset, header, image_bytes = 8, None, 0
    compressed_header = b""
    while offset + 12 <= len(data):
        size = int.from_bytes(data[offset:offset + 4], "big")
        kind = data[offset + 4:offset + 8]
        end = offset + 12 + size
        if end > len(data):
            return False
        chunk = data[offset + 8:end - 4]
        if zlib.crc32(kind + chunk) & 0xffffffff != int.from_bytes(data[end - 4:end], "big"):
            return False
        if header is None:
            if kind != b"IHDR" or size != 13:
                return False
            width, height, depth, color, compression, filtering, interlace = struct.unpack(">IIBBBBB", chunk)
            allowed_depths = {0: (1, 2, 4, 8, 16), 2: (8, 16), 3: (1, 2, 4, 8), 4: (8, 16), 6: (8, 16)}
            if not (0 < width < 2**31 and 0 < height < 2**31 and depth in allowed_depths.get(color, ())
                    and compression == filtering == 0 and interlace in (0, 1)):
                return False
            header = (width, height)
        elif kind == b"IHDR":
            return False
        if kind == b"IDAT":
            image_bytes += size
            compressed_header = (compressed_header + chunk)[:2]
        if kind == b"IEND":
            if size or end != len(data) or image_bytes < 7 or len(compressed_header) != 2:
                return False
            cmf, flags = compressed_header
            return cmf & 15 == 8 and cmf >> 4 <= 7 and (cmf * 256 + flags) % 31 == 0 and not flags & 32
        offset = end
    return False


def _jpeg_container(data):
    if not data.startswith(b"\xff\xd8"):
        return False
    offset, components, scanned = 2, None, False
    frame_markers = set(range(0xc0, 0xd0)) - {0xc4, 0xc8, 0xcc}
    while offset < len(data):
        if data[offset] != 0xff:
            return False
        while offset < len(data) and data[offset] == 0xff:
            offset += 1
        if offset == len(data):
            return False
        marker = data[offset]
        offset += 1
        if marker == 0xd9:
            return scanned and components is not None and offset == len(data)
        if marker in (0, 0xd8) or 0xd0 <= marker <= 0xd7 or offset + 2 > len(data):
            return False
        size = int.from_bytes(data[offset:offset + 2], "big")
        end = offset + size
        if size < 2 or end > len(data):
            return False
        segment = data[offset + 2:end]
        if marker in frame_markers:
            if len(segment) < 6:
                return False
            depth, height, width, count = struct.unpack(">BHHB", segment[:6])
            if not width or not height or depth not in (8, 12, 16) or not 1 <= count <= 4 or len(segment) != 6 + 3 * count:
                return False
            components = set(segment[6::3])
            if len(components) != count:
                return False
        offset = end
        if marker == 0xda:
            if not segment or components is None or not 1 <= segment[0] <= len(components) or len(segment) != 4 + 2 * segment[0]:
                return False
            if not set(segment[1:-3:2]).issubset(components):
                return False
            start = offset
            # Entropy bytes may contain escaped 0xff or restart markers.
            while offset < len(data):
                if data[offset] != 0xff:
                    offset += 1
                elif offset + 1 < len(data) and (data[offset + 1] == 0 or 0xd0 <= data[offset + 1] <= 0xd7):
                    offset += 2
                else:
                    break
            if offset == start:
                return False
            scanned = True
    return False


def _webp_container(data):
    if len(data) < 20 or data[:4] != b"RIFF" or data[8:12] != b"WEBP" or int.from_bytes(data[4:8], "little") + 8 != len(data):
        return False
    offset, canvas, image = 12, None, None
    while offset + 8 <= len(data):
        kind = data[offset:offset + 4]
        size = int.from_bytes(data[offset + 4:offset + 8], "little")
        end = offset + 8 + size
        if end + (size & 1) > len(data):
            return False
        chunk = data[offset + 8:end]
        if kind == b"VP8X":
            if size != 10 or canvas is not None:
                return False
            canvas = (int.from_bytes(chunk[4:7], "little") + 1, int.from_bytes(chunk[7:10], "little") + 1)
        elif kind == b"VP8 ":
            if image is not None or size <= 10 or chunk[0] & 1 or chunk[3:6] != b"\x9d\x01\x2a":
                return False
            image = (int.from_bytes(chunk[6:8], "little") & 0x3fff, int.from_bytes(chunk[8:10], "little") & 0x3fff)
        elif kind == b"VP8L":
            if image is not None or size <= 5 or chunk[0] != 0x2f:
                return False
            bits = int.from_bytes(chunk[1:5], "little")
            if bits >> 29:
                return False
            image = ((bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1)
        elif kind in (b"ANIM", b"ANMF"):
            return False  # References must be static images, not animations.
        offset = end + (size & 1)
    return offset == len(data) and image is not None and all(image) and (canvas is None or canvas == image)


def _image_data(value):
    """Validate MIME and container structure, not a full pixel/entropy decode.

    The stdlib has no JPEG/WebP decoder. These checks reject text, wrong MIME,
    missing dimensions, incomplete segments/chunks and PNG CRC corruption; the
    provider remains responsible for decoding the compressed image stream.
    """
    match = _DATA_URL.fullmatch(value) if isinstance(value, str) else None
    if not match:
        raise ValueError("参考图必须是 JPEG、PNG 或 WebP 的 Base64 图片。")
    try:
        decoded = base64.b64decode(match[2], validate=True)
    except (binascii.Error, ValueError):
        raise ValueError("图片的 Base64 数据无效。") from None
    if not decoded:
        raise ValueError("图片数据不能为空。")
    validator = {"image/png": _png_container, "image/jpeg": _jpeg_container, "image/webp": _webp_container}[match[1]]
    if not validator(decoded):
        raise ValueError("图片内容与声明格式不一致、结构损坏或已截断；请上传完整的静态 JPEG、PNG 或 WebP 图片。")
    return {"mime_type": match[1], "data": match[2]}


def _request_options(payload):
    if not isinstance(payload, dict):
        raise ValueError("生成请求必须是 JSON 对象。")
    try:
        json.dumps(payload, ensure_ascii=False).encode("utf-8")
    except (TypeError, ValueError, UnicodeError):
        raise ValueError("生成请求不是有效的 JSON。") from None
    choice = payload.get("modelChoice")
    if not isinstance(choice, str) or choice not in MODEL_CHOICES:
        raise ValueError("请选择已配置的 GPT Image 2.5 图像模型线路。")
    if type(payload.get("count")) is not int or payload["count"] != 1:
        raise ValueError("本地测试仅支持一次生成 1 张图片。")
    hints = payload.get("layoutHints", {})
    ratio_label = hints.get("ratio", "竖版 3:4") if isinstance(hints, dict) else None
    ratio_match = re.search(r"(?<![0-9])(?:1:1|3:4|4:3|9:16|16:9)(?![0-9])", ratio_label) if isinstance(ratio_label, str) else None
    if not ratio_match:
        raise ValueError("图片比例必须是 1:1、3:4、4:3、9:16 或 16:9。")
    ratio = ratio_match[0]
    size = payload.get("size", "auto")
    if size not in ("auto", "1k", "1K", *_SIZES.values(), *_LEGACY_1K_SIZES):
        raise ValueError("本地测试仅支持 1K 图片，不支持 2K 或 4K。")
    prompt = build_prompt(payload)
    body = {
        "model": MODEL_CHOICES[choice],
        "prompt": prompt,
        "n": 1,
        "size": _SIZES[ratio],
        "quality": "low",
    }
    return body, _SIZES[ratio]


def _request(payload):
    body, size = _request_options(payload)
    images = payload.get("images", [])
    for reference in images:
        _image_data(reference.get("dataUrl"))
    if images:
        body["images"] = [{"image_url": reference["dataUrl"]} for reference in images]
    return body, size


def _curl_quoted(value):
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n").replace("\r", "\\r").replace("\t", "\\t") + '"'


def curl_transport(endpoint, body, api_key):
    """POST JSON once, putting the credential and body in curl's stdin config."""
    if endpoint not in (ENDPOINT, GENERATIONS_ENDPOINT):
        raise ValueError("不允许修改模型接口地址。")
    if not isinstance(api_key, str) or not api_key.strip() or any(c in api_key for c in "\r\n\x00"):
        raise ValueError("Modelflare API Key 未配置或格式无效。")
    config = "\n".join([
        "url = " + _curl_quoted(endpoint),
        'request = "POST"',
        "header = " + _curl_quoted("Authorization: Bearer " + api_key),
        'header = "Content-Type: application/json"',
        "data-binary = " + _curl_quoted(json.dumps(body, ensure_ascii=False, separators=(",", ":"))),
        "silent", "show-error", 'max-time = "180"', _CURL_WRITE_OUT,
    ]) + "\n"
    return _run_curl(config, api_key)


def _run_curl(config, api_key):
    started = time.monotonic()
    # Select the protocol before sending. The origin route reproduced curl 92
    # with the unmodified five-image body; a failed POST is never retried.
    config = "http1.1\n" + config
    try:
        process = subprocess.run(["curl", "--disable", "--config", "-"], input=config, text=True,
                                 stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=190, check=False)
    except OSError:
        raise ProviderError(None, code="transport_not_started", outcome="not_sent",
                            transport={"summary": "本机未能启动网络请求", "elapsedMs": round((time.monotonic() - started) * 1000)}) from None
    except subprocess.TimeoutExpired:
        raise ProviderError(None, code="transport_process_timeout", transport={"summary": "等待网络进程结束超时", "elapsedMs": round((time.monotonic() - started) * 1000)}) from None
    response_text, separator, trailer = process.stdout.rpartition("\n")
    parts = trailer.split("|")
    status_text = parts[0]
    diagnostic = {"curlExitCode": process.returncode, "elapsedMs": round((time.monotonic() - started) * 1000)}
    # Persist only numeric measurements and fixed descriptions. Raw stderr may
    # contain credentials, image data, URLs or private local paths.
    if len(parts) == 6:
        if parts[1] in ("0", "1", "1.0", "1.1", "2", "3"):
            diagnostic["httpVersion"] = parts[1]
        for name, value in zip(("uploadedBytes", "downloadedBytes"), parts[2:4]):
            if value.isascii() and value.isdigit() and len(value) < 20:
                diagnostic[name] = int(value)
        for name, value in zip(("totalMs", "firstResponseMs"), parts[4:6]):
            if re.fullmatch(r"[0-9]{1,8}(?:\.[0-9]{1,6})?", value):
                diagnostic[name] = round(float(value) * 1000)
    status = int(status_text) if separator and status_text.isascii() and status_text.isdigit() and len(status_text) == 3 else None
    # curl can retain an interim 100 Continue when the connection closes before
    # the generation response. Only a final response is a provider HTTP status.
    status = status if status is not None and 200 <= status <= 599 else None
    if process.returncode != 0:
        outcome = "not_sent" if process.returncode in (5, 6, 7) else "unknown"
        diagnostic["summary"] = _CURL_FAILURES.get(process.returncode, "网络传输进程异常退出")
        raise ProviderError(status, code=f"curl_{process.returncode}", outcome=outcome, transport=diagnostic)
    if status is None:
        diagnostic["summary"] = "未读取到有效的 HTTP 状态码"
        raise ProviderError(None, code="invalid_http_response", transport=diagnostic)
    if status < 200 or status >= 300:
        try:
            response = json.loads(response_text)
        except (json.JSONDecodeError, UnicodeError):
            response = {}
        return status, _safe_provider_fields(response, api_key)
    try:
        response = json.loads(response_text)
    except (json.JSONDecodeError, UnicodeError):
        diagnostic["summary"] = "接口响应不是有效的 JSON"
        raise ProviderError(status, code="invalid_json_response", transport=diagnostic) from None
    return status, response


def generate(payload, api_key, *, transport=None):
    """Validate and generate exactly one image; return Alphai's result shape."""
    if isinstance(payload, dict) and MODEL_PROVIDERS.get(payload.get("modelChoice")) == "quickrouter":
        raise ValueError("QuickRouter 请使用持久任务入口，以 multipart 上传原始参考图。")
    body, size = _request(payload)
    if not isinstance(api_key, str) or not api_key.strip() or any(c in api_key for c in "\r\n\x00"):
        raise ValueError("Modelflare API Key 未配置或格式无效。")
    endpoint = ENDPOINT if body.get("images") else GENERATIONS_ENDPOINT
    status, response = (transport or curl_transport)(endpoint, body, api_key)
    return _generation_result(status, response, body, size, api_key)


def _generation_result(status, response, body, size, api_key):
    if type(status) is not int or not 100 <= status <= 599:
        raise ProviderError(None, code="invalid_http_status")
    if status < 200 or status >= 300:
        safe = _safe_provider_fields(response, api_key)
        raise ProviderError(status, code=safe.get("code"), param=safe.get("param"),
                            request_id=safe.get("request_id"), error_type=safe.get("type"), message=safe.get("message"))
    if not isinstance(response, dict):
        raise ProviderError(status, code="invalid_json_response")
    images = response.get("data", [])
    if not isinstance(images, list):
        raise ProviderError(status, code="invalid_image_response")
    for image in images:
        if not isinstance(image, dict):
            continue
        data = image.get("b64_json")
        if not isinstance(data, str):
            continue
        data_url = f"data:image/png;base64,{data}"
        try:
            _image_data(data_url)
        except ValueError:
            continue
        return {"images": [data_url], "model": body["model"], "size": size}
    raise ProviderError(status, code="no_image_returned")


def _asset_file(record):
    """Validate one server-resolved immutable file before any provider operation."""
    if not isinstance(record, dict) or record.get("mime") not in ("image/jpeg", "image/png", "image/webp"):
        raise ValueError("参考图资产类型无效。")
    path = Path(record["path"])
    if path.is_symlink() or not path.is_file():
        raise ValueError("参考图资产文件不存在或无效。")
    size = path.stat().st_size
    if size <= 0 or type(record.get("bytes")) is not int or size != record["bytes"]:
        raise ValueError("参考图资产大小无效或与保存记录不一致。")
    data = path.read_bytes()
    validator = {"image/png": _png_container, "image/jpeg": _jpeg_container, "image/webp": _webp_container}[record["mime"]]
    if not validator(data):
        raise ValueError("参考图资产内容损坏、已截断或与格式不符。")
    return {"assetId": record["id"], "path": str(path.resolve()), "mime": record["mime"],
            "name": str(record.get("name", path.name)), "bytes": size, "sha256": hashlib.sha256(data).hexdigest()}


def prepare_task_request(payload, resolve_asset, *, edit_transport="json"):
    """Build a serializable request from server-owned asset IDs, without sending."""
    if not isinstance(payload, dict) or not isinstance(payload.get("images", []), list):
        raise ValueError("生成请求与参考图列表无效。")
    if edit_transport not in ("json", "multipart"):
        raise ValueError("图片传输方式必须是 json 或 multipart。")
    choice = payload.get("modelChoice")
    if not isinstance(choice, str) or choice not in MODEL_CHOICES:
        raise ValueError("请选择已配置的 GPT Image 2.5 图像模型线路。")
    provider = MODEL_PROVIDERS[choice]
    configuration = PROVIDERS[provider]
    edit_transport = configuration.get("editTransport", edit_transport)
    images, files = [], []
    for image in payload.get("images", []):
        if not isinstance(image, dict) or not isinstance(image.get("assetId"), str) or not image["assetId"]:
            raise ValueError("新任务只能引用已上传的本机参考图资产。")
        identifier = image["assetId"]
        try:
            record = resolve_asset(identifier)
        except (KeyError, OSError, ValueError):
            raise ValueError("参考图资产不存在或不可用，请重新上传。") from None
        if not isinstance(record, dict) or record.get("id") != identifier:
            raise ValueError("参考图资产标识不匹配。")
        asset = _asset_file(record)
        files.append(asset)
        images.append({"id": image.get("id", identifier), "roles": image.get("roles")})
    metadata = {**payload, "images": images}
    body, size = _request_options(metadata)
    endpoint = configuration["baseUrl"] + ("/v1/images/edits" if files else "/v1/images/generations")
    return {"provider": provider, "endpoint": endpoint, "body": body,
            "files": files, "size": size, "transport": edit_transport if files else "json"}


def prepared_provider(prepared):
    """Validate the frozen provider/endpoint/model tuple, including old snapshots.

    Legacy prepared requests have no provider field; their exact endpoint keeps
    them on their original provider. Credentials must be selected only afterwards.
    """
    try:
        endpoint, body, files, mode = prepared["endpoint"], prepared["body"], prepared["files"], prepared["transport"]
        if not isinstance(body, dict) or not isinstance(files, list):
            raise ValueError("Invalid request shape")
        matches = [name for name, config in PROVIDERS.items()
                   if endpoint == config["baseUrl"] + ("/v1/images/edits" if files else "/v1/images/generations")]
        if len(matches) != 1:
            raise ValueError("Unrecognized endpoint")
        provider = matches[0]
        if prepared.get("provider", provider) != provider:
            raise ValueError("Provider does not match endpoint")
        allowed_models = {model for choice, model in MODEL_CHOICES.items() if MODEL_PROVIDERS[choice] == provider}
        if body.get("model") not in allowed_models or mode not in ("json", "multipart") or (not files and mode != "json"):
            raise ValueError("Invalid model or transport")
        if files and PROVIDERS[provider].get("editTransport") not in (None, mode):
            raise ValueError("Provider requires multipart")
        return provider
    except (KeyError, ValueError, TypeError):
        raise ProviderError(None, code="invalid_or_changed_prepared_request", outcome="not_sent", phase="prepare") from None


def _task_curl_transport(endpoint, body, api_key):
    files = body.get("files", [])
    allowed_endpoints = {config["baseUrl"] + path for config in PROVIDERS.values()
                         for path in ("/v1/images/edits", "/v1/images/generations")}
    if endpoint not in allowed_endpoints:
        raise ProviderError(None, code="invalid_endpoint", outcome="not_sent", phase="prepare")
    if body.get("_transport") == "json":
        try:
            request = {k: v for k, v in body.items() if k not in ("files", "_transport")}
            if files:
                request["images"] = []
                for image in files:
                    data = Path(image["path"]).read_bytes()
                    if len(data) != image["bytes"] or hashlib.sha256(data).hexdigest() != image["sha256"]:
                        raise ValueError("参考图资产在准备后发生变化。")
                    request["images"].append({"image_url": "data:" + image["mime"] + ";base64," + base64.b64encode(data).decode("ascii")})
            config = "\n".join([
                "url = " + _curl_quoted(endpoint), 'request = "POST"',
                "header = " + _curl_quoted("Authorization: Bearer " + api_key),
                'header = "Content-Type: application/json"',
                "data-binary = " + _curl_quoted(json.dumps(request, ensure_ascii=False, separators=(",", ":"))),
                "silent", "show-error", 'max-time = "180"', _CURL_WRITE_OUT,
            ]) + "\n"
        except (KeyError, OSError, TypeError, ValueError, UnicodeError):
            raise ProviderError(None, code="invalid_prepared_body", outcome="not_sent", phase="prepare") from None
        return _run_curl(config, api_key)
    # Snapshot verified immutable assets into a private temporary directory so
    # curl reads precisely the bytes checked immediately before transmission.
    try:
        temporary = TemporaryDirectory(prefix="alphai-task-", ignore_cleanup_errors=True)
    except OSError:
        raise ProviderError(None, code="temporary_storage_unavailable", outcome="not_sent", phase="prepare") from None
    with temporary as directory:
        try:
            lines = ["url = " + _curl_quoted(endpoint), 'request = "POST"',
                     "header = " + _curl_quoted("Authorization: Bearer " + api_key)]
            for field in ("model", "prompt", "size", "quality", "n"):
                lines.append("form-string = " + _curl_quoted(f"{field}={body[field]}"))
            for index, image in enumerate(files, 1):
                data = Path(image["path"]).read_bytes()
                if len(data) != image["bytes"] or hashlib.sha256(data).hexdigest() != image["sha256"]:
                    raise ValueError("参考图资产在准备后发生变化。")
                suffix = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}[image["mime"]]
                name = f"ref-{index}.{suffix}"
                path = Path(directory) / name
                path.write_bytes(data)
                lines.append("form = " + _curl_quoted(f'image[]=@"{path}";type={image["mime"]};filename={name}'))
        except (OSError, ValueError, KeyError, TypeError):
            raise ProviderError(None, code="asset_changed_or_unavailable", outcome="not_sent", phase="prepare") from None
        lines.extend(["silent", "show-error", 'max-time = "180"', _CURL_WRITE_OUT])
        return _run_curl("\n".join(lines) + "\n", api_key)


def submit_task_request(prepared, api_key, *, transport=None):
    """Send one prepared operation; no provider retries or model/format fallback."""
    prepared_provider(prepared)
    if not isinstance(api_key, str) or not api_key.strip() or any(c in api_key for c in "\r\n\x00"):
        raise ProviderError(None, code="invalid_local_credentials", outcome="not_sent", phase="prepare")
    try:
        endpoint, body, files, size = prepared["endpoint"], prepared["body"], prepared["files"], prepared["size"]
        mode = prepared["transport"]
        for image in files:
            current = _asset_file({"id": image["assetId"], "path": image["path"], "mime": image["mime"], "name": image["name"], "bytes": image["bytes"]})
            if current["sha256"] != image["sha256"]:
                raise ValueError("Asset changed")
    except (KeyError, OSError, ValueError, TypeError):
        raise ProviderError(None, code="invalid_or_changed_prepared_request", outcome="not_sent", phase="prepare") from None
    status, response = (transport or _task_curl_transport)(endpoint, {**body, "files": files, "_transport": mode}, api_key)
    return _generation_result(status, response, body, size, api_key)
