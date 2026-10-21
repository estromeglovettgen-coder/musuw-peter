"""Normalize extra upload formats at the asset seam, never at provider time."""
import base64
import binascii
import io
from pathlib import PurePosixPath
import threading
import warnings

from modelflare_adapter import _image_data

# Only conversions decode pixels. Existing provider-compatible originals keep
# their exact bytes and their existing validation/size behavior.
MAX_CONVERSION_BYTES = 32 * 1024 * 1024
MAX_CONVERSION_PIXELS = 16 * 1024 * 1024
MAX_CONVERSION_EDGE = 16384
MAX_NORMALIZED_BYTES = 48 * 1024 * 1024
_CONVERSION_SLOT = threading.BoundedSemaphore(1)
_HEIF_MIMES = {"image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"}
_TIFF_MIMES = {"image/tiff", "image/x-tiff"}


class ImageIngestError(ValueError):
    """Safe explanation for an upload rejected before durable storage."""


def _dimensions(image):
    width, height = image.size
    if min(width, height) <= 0 or max(width, height) > MAX_CONVERSION_EDGE or width * height > MAX_CONVERSION_PIXELS:
        raise ImageIngestError("这张图片的转换尺寸过大，请先导出为 JPEG、PNG 或 WebP 后上传。")


def _png(data, mime):
    try:
        from PIL import Image, ImageOps
        from pillow_heif import register_heif_opener
    except ImportError:
        raise ImageIngestError("图片转换组件暂不可用，请改用 JPEG、PNG 或 WebP。") from None
    register_heif_opener(thumbnails=False)
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(data), formats=["HEIF", "TIFF"]) as image:
                actual = image.format
                if (mime in _HEIF_MIMES and actual != "HEIF") or (mime in _TIFF_MIMES and actual != "TIFF"):
                    raise ImageIngestError("图片内容与声明的格式不一致，请重新选择原始图片。")
                _dimensions(image)
                if actual == "TIFF":
                    try:
                        image.seek(1)
                    except EOFError:
                        image.seek(0)
                    else:
                        raise ImageIngestError("这份 TIFF 包含多页，请先选择一页导出为图片再上传。")
                # HEIF opens its primary image; auxiliary thumbnails/depth
                # images are not treated as separate uploads.
                ImageOps.exif_transpose(image, in_place=True)
                _dimensions(image)
                profile = image.info.get("icc_profile")
                if not isinstance(profile, bytes) or len(profile) > 1024 * 1024:
                    profile = None
                converted = image if image.mode in ("RGB", "RGBA") else image.convert("RGBA" if "A" in image.getbands() else "RGB")
                try:
                    converted.info.clear()  # Do not copy GPS/EXIF/XMP into previews.
                    output = io.BytesIO()
                    converted.save(output, format="PNG", icc_profile=profile, compress_level=6)
                    if output.tell() > MAX_NORMALIZED_BYTES:
                        raise ImageIngestError("图片转换后的文件过大，请先导出为 JPEG 后上传。")
                    return output.getvalue(), actual
                finally:
                    if converted is not image:
                        converted.close()
    except ImageIngestError:
        raise
    except (OSError, ValueError, SyntaxError, EOFError, RuntimeError, MemoryError, Image.DecompressionBombWarning, Image.DecompressionBombError):
        raise ImageIngestError("图片损坏、格式不符或无法完整解码，请重新导出后上传。") from None


def ingest_image(data_url, name="image"):
    """Return stored bytes/name and optional upload-only normalization metadata."""
    name = name.strip() if isinstance(name, str) and name.strip() else "image"
    if not isinstance(data_url, str):
        raise ImageIngestError("请上传有效的 Base64 图片。")
    comma = data_url.find(",")
    header = data_url[:comma] if 0 <= comma <= 128 else ""
    if not header.startswith("data:") or not header.endswith(";base64"):
        raise ImageIngestError("请上传有效的 Base64 图片。")
    mime = header[5:-7].lower()
    if mime in {"image/jpeg", "image/png", "image/webp"}:
        validated = _image_data(data_url)
        return {"data": base64.b64decode(validated["data"], validate=True), "mime_type": validated["mime_type"], "name": name}
    if mime not in _HEIF_MIMES | _TIFF_MIMES | {"", "application/octet-stream"}:
        raise ImageIngestError("图片格式暂不支持，请使用 JPEG、PNG、WebP、HEIC、HEIF 或 TIFF。")
    if len(data_url) - comma - 1 > 4 * ((MAX_CONVERSION_BYTES + 2) // 3):
        raise ImageIngestError("这张图片的转换文件过大，请先导出为 JPEG 后上传。")
    if not _CONVERSION_SLOT.acquire(blocking=False):
        raise ImageIngestError("已有图片正在转换，请稍后再添加这张图片。")
    try:
        try:
            data = base64.b64decode(data_url[comma + 1:], validate=True)
        except (binascii.Error, ValueError):
            raise ImageIngestError("图片的 Base64 数据无效。") from None
        if not data or len(data) > MAX_CONVERSION_BYTES:
            raise ImageIngestError("图片数据为空或转换文件过大。")
        normalized, actual = _png(data, mime)
        source = PurePosixPath(name.replace("\\", "/")).name
        stem = PurePosixPath(source).stem or "image"
        return {"data": normalized, "mime_type": "image/png", "name": stem + ".png",
                "normalized": True,
                "sourceName": source, "normalization": f"{actual} 已转换为 PNG，使用主图并校正方向。"}
    finally:
        _CONVERSION_SLOT.release()
