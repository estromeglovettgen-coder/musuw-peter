"""Real codec inputs at the existing durable asset seam; no provider calls."""
import base64
import io
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path

from PIL import Image
from generation_tasks import GenerationStore
from pillow_heif import register_heif_opener
import image_ingest


def image_url(data, mime):
    return f"data:{mime};base64," + base64.b64encode(data).decode("ascii")


class ImageIngestTests(unittest.TestCase):
    def setUp(self):
        register_heif_opener(thumbnails=False)

    def test_oriented_tiff_is_persisted_as_png_with_usable_preview(self):
        source = io.BytesIO()
        with Image.new("RGB", (2, 3), "red") as image:
            image.save(source, format="TIFF", tiffinfo={274: 6})
        with tempfile.TemporaryDirectory() as directory:
            store = GenerationStore(Path(directory) / "private")
            asset = store.add_asset(image_url(source.getvalue(), "image/tiff"), "手机照片.tiff")
            self.assertEqual(asset["mime"], "image/png")
            self.assertEqual(asset["name"], "手机照片.png")
            self.assertEqual(asset["sourceName"], "手机照片.tiff")
            self.assertTrue(asset["normalization"])
            self.assertTrue(asset["normalized"])
            self.assertNotIn("normalizedDataUrl", asset)
            preview = store.resolve_asset(asset["id"])["path"].read_bytes()
            with Image.open(io.BytesIO(preview)) as normalized:
                self.assertEqual(normalized.format, "PNG")
                self.assertEqual(normalized.size, (3, 2))

    def test_real_heic_and_heif_choose_primary_image_and_accept_missing_browser_mime(self):
        source = io.BytesIO()
        with Image.new("RGB", (2, 3), "red") as first, Image.new("RGB", (4, 2), "blue") as primary:
            first.save(source, format="HEIF", append_images=[primary], save_all=True, primary_index=1, quality=-1)
        for mime in ("image/heic", "image/heif", "application/octet-stream", ""):
            with self.subTest(mime=mime), tempfile.TemporaryDirectory() as directory:
                store = GenerationStore(Path(directory) / "private")
                asset = store.add_asset(image_url(source.getvalue(), mime), "IMG_0001.HEIC")
                self.assertEqual(asset["mime"], "image/png")
                self.assertEqual(asset["name"], "IMG_0001.png")
                with Image.open(store.resolve_asset(asset["id"])["path"]) as normalized:
                    self.assertEqual(normalized.size, (4, 2))
                    red, green, blue = normalized.getpixel((0, 0))
                    self.assertLess(red, 3)
                    self.assertLess(green, 3)
                    self.assertGreater(blue, 250)

    def test_real_heic_orientation_is_applied_once(self):
        source = io.BytesIO()
        with Image.new("RGB", (2, 3), "red") as image:
            exif = Image.Exif()
            exif[274] = 6
            image.info["exif"] = exif.tobytes()
            image.save(source, format="HEIF", quality=-1)
        result = image_ingest.ingest_image(image_url(source.getvalue(), "image/heic"), "portrait.heic")
        with Image.open(io.BytesIO(result["data"])) as image:
            self.assertEqual(image.size, (3, 2))
            self.assertNotIn(274, image.getexif())

    def test_provider_compatible_originals_keep_identical_bytes_and_no_preview_metadata(self):
        for fmt, mime in (("PNG", "image/png"), ("JPEG", "image/jpeg"), ("WEBP", "image/webp")):
            with self.subTest(fmt=fmt), tempfile.TemporaryDirectory() as directory:
                source = io.BytesIO()
                with Image.new("RGB", (13, 11), "red") as image:
                    image.save(source, format=fmt)
                original = source.getvalue()
                store = GenerationStore(Path(directory) / "private")
                asset = store.add_asset(image_url(original, mime), "original." + fmt.lower())
                self.assertEqual(store.resolve_asset(asset["id"])["path"].read_bytes(), original)
                self.assertEqual(asset["mime"], mime)
                self.assertNotIn("normalizedDataUrl", asset)
                self.assertNotIn("normalization", asset)

    def test_twelve_megapixel_image_converts_without_resizing(self):
        source = io.BytesIO()
        with Image.new("RGB", (4000, 3000), "blue") as image:
            image.save(source, format="TIFF", compression="tiff_deflate")
        result = image_ingest.ingest_image(image_url(source.getvalue(), "image/tiff"), "large.tiff")
        with Image.open(io.BytesIO(result["data"])) as image:
            self.assertEqual(image.size, (4000, 3000))

    def test_bad_format_truncated_images_and_multipage_tiff_never_persist(self):
        source = io.BytesIO()
        with Image.new("RGB", (2, 3), "red") as image:
            image.save(source, format="TIFF")
        pages = io.BytesIO()
        with Image.new("RGB", (2, 3), "red") as first, Image.new("RGB", (2, 3), "blue") as second:
            first.save(pages, format="TIFF", save_all=True, append_images=[second])
        for data in (image_url(source.getvalue(), "image/heic"), image_url(source.getvalue()[:20], "image/tiff"),
                     image_url(b"not a photo", "image/heif"), image_url(pages.getvalue(), "image/tiff"),
                     "data:image/heic;base64,not_valid_base64!", "data:image/tiff;base64,"):
            with self.subTest(data=data[:45]), tempfile.TemporaryDirectory() as directory:
                store = GenerationStore(Path(directory) / "private")
                with self.assertRaises(ValueError):
                    store.add_asset(data, "bad.heic")
                self.assertEqual(list(store.assets_dir.iterdir()), [])

    def test_conversion_resource_limits_and_busy_slot_are_explicit_failures(self):
        source = io.BytesIO()
        with Image.new("RGB", (20, 20), "red") as image:
            image.save(source, format="TIFF")
        data_url = image_url(source.getvalue(), "image/tiff")
        for constant, limit in (("MAX_CONVERSION_PIXELS", 399), ("MAX_CONVERSION_EDGE", 19),
                                ("MAX_CONVERSION_BYTES", 8), ("MAX_NORMALIZED_BYTES", 8)):
            with self.subTest(limit=constant), patch.object(image_ingest, constant, limit):
                with self.assertRaises(ValueError):
                    image_ingest.ingest_image(data_url, "limits.tiff")
        with image_ingest._CONVERSION_SLOT:
            with self.assertRaisesRegex(ValueError, "正在转换"):
                image_ingest.ingest_image(data_url, "busy.tiff")
        # Rejections release the slot rather than breaking subsequent uploads.
        self.assertEqual(image_ingest.ingest_image(data_url, "after.tiff")["mime_type"], "image/png")


if __name__ == "__main__":
    unittest.main()
