"""Offline contract tests: no credentials or real provider requests are used."""

import base64
import json
import struct
import subprocess
import threading
import unittest
import zlib
from email import policy
from email.parser import BytesParser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from modelflare_adapter import ENDPOINT, GENERATIONS_ENDPOINT, ProviderError, curl_transport, generate
from reference_workflow import ROLES, build_prompt


PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC"


def reference(slot, roles=None):
    # A valid ancillary chunk makes each actual PNG distinct for order checks.
    png = base64.b64decode(PNG)
    text = b"reference\0" + slot.encode()
    chunk = struct.pack(">I", len(text)) + b"tEXt" + text + struct.pack(">I", zlib.crc32(b"tEXt" + text) & 0xffffffff)
    encoded = base64.b64encode(png[:-12] + chunk + png[-12:]).decode()
    result = {"id": slot, "name": slot + ".png", "type": "image/png", "dataUrl": "data:image/png;base64," + encoded}
    if roles is not None:
        result["roles"] = roles
    return result


def payload():
    return {
        "promptMode": "default", "prompt": "", "modelChoice": "modelflare-image25",
        "layoutHints": {"ratio": "竖版 3:4"}, "count": 1, "size": "768x1024",
        "images": [reference("image-three", ["background", "pose"]), reference("image-one", ["face"]), reference("image-two", ["upper", "lower"])],
    }


def edit_body():
    return {
        "model": "gpt-image-2.5-flare", "prompt": '人物参考；保留 "引号" 和换行\n等内容',
        "images": [{"image_url": reference(slot)["dataUrl"]} for slot in ("image-one", "image-two", "image-three")],
        "n": 1, "size": "768x1024", "quality": "low"
    }


class GenerateContractTests(unittest.TestCase):
    def test_prepared_task_uses_immutable_local_files_without_base64_and_keeps_roles(self):
        import modelflare_adapter as adapter
        request = payload()
        with TemporaryDirectory() as directory:
            assets = {}
            for index, image in enumerate(request["images"]):
                identifier = f"asset-{index}"
                data = base64.b64decode(image.pop("dataUrl").split(",", 1)[1])
                path = Path(directory) / (identifier + ".png")
                path.write_bytes(data)
                image["assetId"] = identifier
                assets[identifier] = {"id": identifier, "path": path, "mime": "image/png", "name": path.name, "bytes": len(data)}
            prepared = adapter.prepare_task_request(request, assets.__getitem__)
            self.assertEqual(prepared["endpoint"], "https://modelflare.dev/v1/images/edits")
            self.assertEqual(prepared["transport"], "json")
            self.assertNotIn("base64,", json.dumps(prepared))
            self.assertEqual([item["assetId"] for item in prepared["files"]], ["asset-0", "asset-1", "asset-2"])
            self.assertIn("图1：背景、动作", prepared["body"]["prompt"])
            self.assertIn("图2：脸部身份", prepared["body"]["prompt"])
            observed = []

            def provider(endpoint, body, key):
                observed.append(body)
                self.assertEqual([Path(item["path"]).read_bytes() for item in body["files"]], [Path(assets[name]["path"]).read_bytes() for name in ("asset-0", "asset-1", "asset-2")])
                return 200, {"data": [{"b64_json": PNG}]}

            result = adapter.submit_task_request(prepared, "fake-test-key", transport=provider)
            self.assertEqual(result["images"], ["data:image/png;base64," + PNG])
            self.assertEqual(len(observed), 1)

    def test_real_curl_task_multipart_preserves_file_order_bytes_and_unicode_prompt(self):
        import modelflare_adapter as adapter
        received = []

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def do_POST(self):
                data = self.rfile.read(int(self.headers["Content-Length"]))
                message = BytesParser(policy=policy.default).parsebytes(
                    ("Content-Type: " + self.headers["Content-Type"] + "\r\nMIME-Version: 1.0\r\n\r\n").encode() + data)
                parts = [(part.get_param("name", header="Content-Disposition"), part.get_payload(decode=True), part.get_filename(), part.get_content_type()) for part in message.iter_parts()]
                received.append((self.path, self.headers.get("Authorization"), self.headers["Content-Type"], parts))
                reply = json.dumps({"data": [{"b64_json": PNG}]}).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(reply)))
                self.end_headers()
                self.wfile.write(reply)

        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        real_run = subprocess.run
        commands = []

        def local_curl(args, **options):
            commands.append(args)
            self.assertNotIn("fake-test-key", " ".join(args))
            self.assertNotIn("base64,", options["input"])
            self.assertNotIn("Content-Type: application/json", options["input"])
            options["input"] = options["input"].replace(adapter.TASK_MULTIPART_EDITS_ENDPOINT, f"http://127.0.0.1:{server.server_port}/v1/images/edits", 1)
            return real_run(args, **options)

        try:
            with TemporaryDirectory() as directory:
                request = payload()
                request.update(promptMode="custom", prompt='保留 "引号"；@图片，反斜线\\和换行\n不要改变人物')
                assets, original = {}, []
                for index, image in enumerate(request["images"]):
                    data = base64.b64decode(image.pop("dataUrl").split(",", 1)[1])
                    original.append(data)
                    identifier = f"asset-{index}"
                    path = Path(directory) / (identifier + ".png")
                    path.write_bytes(data)
                    image["assetId"] = identifier
                    assets[identifier] = {"id": identifier, "path": path, "mime": "image/png", "name": path.name, "bytes": len(data)}
                prepared = adapter.prepare_task_request(request, assets.__getitem__, edit_transport="multipart")
                with patch("modelflare_adapter.subprocess.run", side_effect=local_curl):
                    result = adapter.submit_task_request(prepared, "fake-test-key")
                self.assertEqual(result["images"], ["data:image/png;base64," + PNG])
                self.assertEqual(len(commands), 1)
                path, auth, content_type, parts = received[0]
                self.assertEqual(path, "/v1/images/edits")
                self.assertEqual(auth, "Bearer fake-test-key")
                self.assertTrue(content_type.startswith("multipart/form-data; boundary="))
                scalars = {name: data.decode() for name, data, filename, mime in parts if name != "image[]"}
                self.assertEqual(scalars, {key: str(value) for key, value in prepared["body"].items()})
                files = [(data, filename, mime) for name, data, filename, mime in parts if name == "image[]"]
                self.assertEqual(files, [(data, f"ref-{index}.png", "image/png") for index, data in enumerate(original, 1)])
        finally:
            server.shutdown()
            server.server_close()

    def test_task_generation_without_assets_and_changed_file_have_safe_local_outcomes(self):
        import modelflare_adapter as adapter
        request = payload()
        request.update(promptMode="custom", prompt="窗边的一只猫", images=[])
        prepared = adapter.prepare_task_request(request, lambda identifier: self.fail("Zero references resolved an asset"))
        self.assertEqual(prepared["endpoint"], "https://modelflare.dev/v1/images/generations")
        self.assertEqual(prepared["files"], [])
        seen = []
        result = adapter.submit_task_request(prepared, "fake-test-key", transport=lambda *args: (seen.append(args) or (200, {"data": [{"b64_json": PNG}]})))
        self.assertEqual(len(result["images"]), 1)
        self.assertEqual(len(seen), 1)
        with TemporaryDirectory() as directory:
            path = Path(directory) / "reference.png"
            data = base64.b64decode(PNG)
            path.write_bytes(data)
            request["images"] = [{"assetId": "asset-1", "id": "image-1"}]
            asset = {"id": "asset-1", "path": path, "mime": "image/png", "name": path.name, "bytes": len(data)}
            prepared = adapter.prepare_task_request(request, lambda identifier: asset)
            path.write_bytes(b"changed")
            with self.assertRaises(ProviderError) as failure:
                adapter.submit_task_request(prepared, "fake-test-key", transport=lambda *args: self.fail("Changed asset reached provider"))
            self.assertEqual(failure.exception.outcome, "not_sent")
            self.assertEqual(failure.exception.phase, "prepare")

    def test_task_rejections_unknown_and_before_connect_failures_are_not_retried(self):
        import modelflare_adapter as adapter
        request = payload()
        request.update(promptMode="custom", prompt="窗边的一只猫", images=[])
        prepared = adapter.prepare_task_request(request, lambda _: None)
        for status in (400, 401, 403, 404, 413, 415, 422, 408, 429, 499, 500, 502, 503):
            with self.subTest(status=status):
                seen = []
                def provider(*args):
                    seen.append(args)
                    return status, {"error": {"code": "safe_error", "param": "size", "request_id": "req_offline"}}
                with self.assertRaises(ProviderError) as failure:
                    adapter.submit_task_request(prepared, "fake-test-key", transport=provider)
                self.assertEqual(failure.exception.status, status)
                expected = "rejected" if status in (400, 401, 403, 404, 413, 415, 422) else "unknown"
                self.assertEqual(failure.exception.outcome, expected)
                self.assertEqual(len(seen), 1)
        for code, expected in ((6, "not_sent"), (7, "not_sent"), (28, "unknown"), (52, "unknown")):
            with self.subTest(curl_exit=code):
                completed = subprocess.CompletedProcess([], code, "", "fake-test-key private stderr")
                with patch("modelflare_adapter.subprocess.run", return_value=completed) as process:
                    with self.assertRaises(ProviderError) as failure:
                        adapter.submit_task_request(prepared, "fake-test-key")
                self.assertEqual(failure.exception.outcome, expected)
                self.assertEqual(process.call_count, 1)
                self.assertNotIn("fake-test-key", str(failure.exception))

    def test_task_accepts_seventeen_face_assets_without_an_application_count_cap(self):
        import modelflare_adapter as adapter
        with TemporaryDirectory() as directory:
            path = Path(directory) / "reference.png"
            data = base64.b64decode(PNG)
            path.write_bytes(data)
            request = payload()
            request.update(modelChoice="quickrouter-image25-sunburst", images=[{"id": f"image-{index}", "assetId": f"asset-{index}", "roles": ["face"]} for index in range(17)])
            resolved = []
            def resolve(identifier):
                resolved.append(identifier)
                return {"id": identifier, "path": path, "mime": "image/png", "name": path.name, "bytes": len(data)}
            prepared = adapter.prepare_task_request(request, resolve)
            self.assertEqual([item["assetId"] for item in prepared["files"]], [f"asset-{index}" for index in range(17)])
            self.assertEqual(len(resolved), 17)
            seen = []
            adapter.submit_task_request(prepared, "fake-test-key", transport=lambda *args: (seen.append(args) or (200, {"data": [{"b64_json": PNG}]})))
            self.assertEqual(len(seen), 1)
            self.assertEqual(len(seen[0][1]["files"]), 17)
            request["images"] = [{"id": "image-0", "path": "/private/ignored.png"}]
            with self.assertRaises(ValueError):
                adapter.prepare_task_request(request, lambda _: self.fail("Client path reached resolver"))

    def test_legacy_json_and_multipart_have_no_local_data_url_character_cap(self):
        import modelflare_adapter as adapter
        with TemporaryDirectory() as directory:
            png = base64.b64decode(PNG)
            text = b"source\0" + b"x" * (16 * 1024 * 1024)
            chunk = struct.pack(">I", len(text)) + b"tEXt" + text + struct.pack(">I", zlib.crc32(b"tEXt" + text) & 0xffffffff)
            data = png[:-12] + chunk + png[-12:]
            path = Path(directory) / "reference.png"
            path.write_bytes(data)
            asset = {"id": "asset-1", "path": path, "mime": "image/png", "name": path.name, "bytes": len(data)}
            request = payload()
            request.update(promptMode="custom", prompt="保留人物", images=[{"id": "image-1", "assetId": "asset-1"}])
            actual_characters = len("data:image/png;base64," + base64.b64encode(data).decode("ascii"))
            self.assertGreater(actual_characters, 20_971_520)
            self.assertEqual(adapter.prepare_task_request(request, lambda _: asset)["transport"], "json")
            self.assertEqual(adapter.prepare_task_request(request, lambda _: asset, edit_transport="multipart")["transport"], "multipart")

    def test_original_larger_than_fifty_mib_and_metadata_larger_than_twenty_mib_have_no_local_cap(self):
        import modelflare_adapter as adapter
        with TemporaryDirectory() as directory:
            png = base64.b64decode(PNG)
            text = b"source\0" + b"x" * (50 * 1024 * 1024 + 1024)
            chunk = struct.pack(">I", len(text)) + b"tEXt" + text + struct.pack(">I", zlib.crc32(b"tEXt" + text) & 0xffffffff)
            data = png[:-12] + chunk + png[-12:]
            path = Path(directory) / "large-original.png"
            path.write_bytes(data)
            asset = {"id": "asset-large", "path": path, "mime": "image/png", "name": path.name, "bytes": len(data)}
            request = payload()
            request.update(modelChoice="quickrouter-image25-sunburst", promptMode="custom", prompt="保留原图的全部细节",
                           images=[{"id": "image-large", "assetId": asset["id"]}])
            prepared = adapter.prepare_task_request(request, lambda _: asset)
            self.assertEqual(prepared["files"][0]["bytes"], len(data))
            self.assertEqual(Path(prepared["files"][0]["path"]).read_bytes(), data)
            request.update(prompt="x" * (20 * 1024 * 1024 + 1), images=[])
            prepared = adapter.prepare_task_request(request, lambda _: self.fail("Text input resolved an asset"))
            self.assertIn(request["prompt"], prepared["body"]["prompt"])

    def test_three_references_reach_image25_edits_and_return_frontend_image(self):
        observed = {}

        def provider(url, body, key):
            observed.update(url=url, key=key, body=body)
            return 200, {"data": [{"b64_json": PNG}]}

        request = payload()
        request.update(layoutHints={"ratio": "方形 1:1"}, size="1024x1024")
        result = generate(request, "fake-test-key", transport=provider)
        self.assertEqual(observed["url"], "https://modelflare.dev/v1/images/edits")
        self.assertEqual(observed["key"], "fake-test-key")
        body = observed["body"]
        self.assertIn("图1", body["prompt"])
        self.assertIn("图2", body["prompt"])
        self.assertIn("图3", body["prompt"])
        self.assertEqual(body["images"], [{"image_url": image["dataUrl"]} for image in request["images"]])
        self.assertEqual(body["prompt"], build_prompt(request))
        self.assertIn("图1：背景、动作", body["prompt"])
        self.assertIn("图2：脸部身份", body["prompt"])
        self.assertEqual({key: value for key, value in body.items() if key not in ("prompt", "images")}, {
            "model": "gpt-image-2.5-flare", "n": 1, "size": "1024x1024", "quality": "low"
        })
        self.assertEqual(result, {"images": ["data:image/png;base64," + PNG], "model": "gpt-image-2.5-flare", "size": "1024x1024"})

    def test_sunburst_choice_uses_exact_model_and_returns_its_identity(self):
        request = payload()
        request["modelChoice"] = "modelflare-image25-sunburst"

        def provider(url, body, key):
            self.assertEqual(url, "https://modelflare.dev/v1/images/edits")
            self.assertEqual(body["model"], "gpt-image-2.5-sunburst")
            self.assertEqual(body["size"], "768x1024")
            self.assertEqual(body["quality"], "low")
            self.assertEqual(body["n"], 1)
            self.assertEqual(body["images"], [{"image_url": image["dataUrl"]} for image in request["images"]])
            return 200, {"data": [{"b64_json": PNG}]}

        result = generate(request, "fake-test-key", transport=provider)
        self.assertEqual(result["model"], "gpt-image-2.5-sunburst")
        self.assertEqual(result["images"], ["data:image/png;base64," + PNG])

    def test_custom_edit_accepts_one_reference_and_preserves_user_prompt(self):
        request = payload()
        request.update(promptMode="custom", prompt="  把参考图的背景换成森林  ", images=[reference("image-one")])

        def provider(url, body, key):
            self.assertIn("把参考图的背景换成森林", body["prompt"])
            self.assertIn("整体协调规则", body["prompt"])
            self.assertEqual(body["prompt"], build_prompt(request))
            self.assertEqual(body["images"], [{"image_url": reference("image-one")["dataUrl"]}])
            return 200, {"data": [{"b64_json": PNG}], "usage": {"total_tokens": 110}}

        result = generate(request, "fake-test-key", transport=provider)
        self.assertEqual(result["images"], ["data:image/png;base64," + PNG])
        self.assertNotIn("tokenUsage", result)

    def test_ratios_map_to_documented_valid_sizes_including_legacy_frontend_hints(self):
        cases = [
            ("方形 1:1", "1024x1024", "1024x1024"),
            ("竖版 3:4", "768x1024", "768x1024"),
            ("横版 4:3", "1024x768", "1024x768"),
            ("竖屏 9:16", "576x1024", "720x1280"),
            ("横屏 16:9", "1024x576", "1280x720"),
        ]
        for ratio, old_hint, expected in cases:
            with self.subTest(ratio=ratio):
                request = payload()
                request.update(layoutHints={"ratio": ratio}, size=old_hint)

                def provider(url, body, key):
                    self.assertEqual(body["size"], expected)
                    width, height = map(int, body["size"].split("x"))
                    self.assertEqual(width % 16, 0)
                    self.assertEqual(height % 16, 0)
                    self.assertGreaterEqual(width * height, 655360)
                    self.assertLessEqual(width * height, 8294400)
                    return 200, {"data": [{"b64_json": PNG}]}

                self.assertEqual(generate(request, "fake-test-key", transport=provider)["size"], expected)

    def test_nine_references_have_no_old_five_slot_cap_and_follow_upload_order(self):
        request = payload()
        request["images"] = [reference("upload-" + role, [role]) for role, label in ROLES]

        def provider(url, body, key):
            self.assertEqual(body["images"], [{"image_url": image["dataUrl"]} for image in request["images"]])
            self.assertIn("图9：鞋履", body["prompt"])
            return 200, {"data": [{"b64_json": PNG}]}

        self.assertEqual(len(generate(request, "fake-test-key", transport=provider)["images"]), 1)

    def test_custom_without_references_uses_generation_endpoint_and_omits_images(self):
        request = payload()
        request.update(promptMode="custom", prompt="一只白猫在森林", images=[])

        def provider(url, body, key):
            self.assertEqual(url, GENERATIONS_ENDPOINT)
            self.assertNotIn("images", body)
            self.assertIn("整体协调规则", body["prompt"])
            self.assertIn("一只白猫在森林", body["prompt"])
            return 200, {"data": [{"b64_json": PNG}]}

        self.assertEqual(len(generate(request, "fake-test-key", transport=provider)["images"]), 1)

    def test_default_ignores_supplied_custom_prompt(self):
        request = payload()
        request["prompt"] = "THIS MUST NOT REACH THE PROVIDER"

        def provider(url, body, key):
            self.assertNotIn("THIS MUST NOT REACH", body["prompt"])
            return 200, {"data": [{"b64_json": PNG}]}

        generate(request, "fake-test-key", transport=provider)

    def test_two_arbitrary_references_can_generate_and_invalid_bytes_cannot_charge(self):
        request = payload()
        request["images"] = [reference("uploaded-A", ["face"]), reference("uploaded-B", ["upper"])]

        def provider(url, body, key):
            self.assertEqual(len(body["images"]), 2)
            self.assertIn("图1：脸部身份", body["prompt"])
            self.assertIn("图2：上半身穿搭", body["prompt"])
            return 200, {"data": [{"b64_json": PNG}]}

        self.assertEqual(len(generate(request, "fake-test-key", transport=provider)["images"]), 1)
        for data_url in ("data:image/png;base64,%%%", "data:image/png;base64,===", "https://example.com/reference.png"):
            with self.subTest(data_url=data_url):
                request["images"][0]["dataUrl"] = data_url
                with self.assertRaises(ValueError):
                    generate(request, "fake-test-key", transport=lambda *args: self.fail("Invalid bytes reached provider"))

    def test_multiple_face_sources_reach_one_request_in_upload_order(self):
        request = payload()
        request["images"] = [reference("scene", ["background", "pose"]), reference("front", ["face"]),
                             reference("outfit", ["upper", "lower"]), reference("side", ["face"])]

        def provider(url, body, key):
            self.assertEqual(body["images"], [{"image_url": image["dataUrl"]} for image in request["images"]])
            self.assertIn("脸部身份组：图2、图4", body["prompt"])
            self.assertEqual(body["prompt"].count("脸部身份参考："), 1)
            self.assertEqual(body["prompt"], build_prompt(request))
            return 200, {"data": [{"b64_json": PNG}]}

        self.assertEqual(len(generate(request, "fake-test-key", transport=provider)["images"]), 1)

    def test_invalid_form_is_rejected_before_provider_is_called(self):
        def must_not_send(*args):
            self.fail("Invalid local input reached a chargeable provider request")

        bad_forms = [
            {"count": 2}, {"count": True}, {"modelChoice": "quality"}, {"size": "2k"},
            {"size": "4k"}, {"size": "1536x2048"}, {"layoutHints": {"ratio": "2:1"}},
            {"images": []}, {"images": [reference("image-one", ["face"])]},
            {"promptMode": "custom", "prompt": "   "},
            {"images": [reference("image-six"), reference("image-two"), reference("image-three")]},
            {"images": [reference("image-one")] * 6},
            {"images": [reference("image-one")] * 3},
            {"images": [{**reference("image-one"), "dataUrl": "data:image/png;base64,%%%"}, reference("image-two"), reference("image-three")]},
            {"images": [{**reference("image-one"), "dataUrl": "data:image/png;base64,==="}, reference("image-two"), reference("image-three")]},
            {"images": [{**reference("image-one"), "dataUrl": "https://example.com/reference.png"}, reference("image-two"), reference("image-three")]},
        ]
        for changes in bad_forms:
            with self.subTest(changes=list(changes)):
                request = payload()
                request.update(changes)
                with self.assertRaises(ValueError):
                    generate(request, "fake-test-key", transport=must_not_send)

    def test_provider_errors_and_missing_image_are_safe_and_honest(self):
        responses = [
            (401, {"error": {"message": "fake-test-key secret provider detail"}}),
            (200, {"data": []}),
            (200, {"data": [{"url": "https://example.com/not-base64.png"}]}),
            (200, {"data": [{"b64_json": "%%%"}]}),
            (200, {"data": [{"b64_json": ""}]}),
            (200, {"data": None}),
        ]
        for status, response in responses:
            with self.subTest(status=status, response_shape=list(response)):
                with self.assertRaises(ValueError) as failure:
                    generate(payload(), "fake-test-key", transport=lambda *args: (status, response))
                self.assertNotIn("fake-test-key", str(failure.exception))
                self.assertNotIn("secret provider detail", str(failure.exception))

    def test_provider_rejection_retains_safe_status_code_param_and_request_id(self):
        response = {"error": {
            "code": "invalid_request_error", "type": "invalid_request_error", "param": "size",
            "request_id": "req_local_01", "message": "fake-test-key secret private details"
        }}
        with self.assertRaises(ValueError) as failure:
            generate(payload(), "fake-test-key", transport=lambda *args: (422, response))
        error = failure.exception
        self.assertEqual(error.status, 422)
        self.assertEqual(error.code, "invalid_request_error")
        self.assertEqual(error.param, "size")
        self.assertEqual(error.request_id, "req_local_01")
        self.assertIn("invalid_request_error", str(error))
        self.assertNotIn("fake-test-key", str(error))

    def test_request_id_is_extracted_from_safe_message_when_structured_field_is_absent(self):
        identifier = "2026101912255241592047897e656242i0qSA1T"
        response = {"error": {"code": "invalid_request", "message": f"The image generation request is invalid. (request id: {identifier})"}}
        with self.assertRaises(ProviderError) as failure:
            generate(payload(), "fake-test-key", transport=lambda *args: (400, response))
        self.assertEqual(failure.exception.request_id, identifier)
        response["error"]["request_id"] = "structured-id"
        with self.assertRaises(ProviderError) as failure:
            generate(payload(), "fake-test-key", transport=lambda *args: (400, response))
        self.assertEqual(failure.exception.request_id, "structured-id")
        response["error"].pop("request_id")
        response["error"]["message"] += " fake-test-key"
        with self.assertRaises(ProviderError) as failure:
            generate(payload(), "fake-test-key", transport=lambda *args: (400, response))
        self.assertIsNone(failure.exception.request_id)

    def test_curl_error_response_discards_everything_except_safe_identifiers(self):
        response = {"request_id": "req_top_level_01", "private": "fake-test-key", "error": {
            "code": "invalid_request_error", "type": "validation_error", "param": "size",
            "message": "fake-test-key private prompt", "extra": "fake-test-key"
        }}
        process = subprocess.CompletedProcess([], 0, json.dumps(response) + "\n400", "fake-test-key stderr")
        with patch("modelflare_adapter.subprocess.run", return_value=process):
            status, safe = curl_transport(ENDPOINT, edit_body(), "fake-test-key")
        self.assertEqual(status, 400)
        self.assertEqual(safe, {"code": "invalid_request_error", "type": "validation_error", "param": "size", "request_id": "req_top_level_01"})
        self.assertNotIn("fake-test-key", json.dumps(safe))

    def test_provider_explanation_is_bounded_private_diagnostic_not_default_string(self):
        explanation = "参数 size 不受支持，请使用 1024x1024。" + "可安全读取的说明。" * 50
        response = {"error": {"code": "invalid_request", "message": explanation}}
        with self.assertRaises(ProviderError) as failure:
            generate(payload(), "fake-test-key", transport=lambda *args: (400, response))
        self.assertEqual(failure.exception.message, explanation[:300])
        self.assertNotIn("参数 size 不受支持", str(failure.exception))

    def test_private_provider_explanation_is_discarded_before_any_truncation(self):
        unsafe_messages = [
            "fake-test-key", "正常参数错误说明。" * 50 + "fake-test-key",
            "Authorization rejected", "Bearer token invalid", "sk-private-key",
            "cannot read data:image/png;base64,AAAA", "base64 image is invalid",
            "image payload=" + "a" * 80, "参数\n不正确", "parameter\x00invalid", "parameter\u202einvalid", 42
        ]
        for message in unsafe_messages:
            response = {"error": {"code": "invalid_request", "message": message}}
            process = subprocess.CompletedProcess([], 0, json.dumps(response) + "\n400", "")
            with self.subTest(message_type=type(message).__name__):
                with patch("modelflare_adapter.subprocess.run", return_value=process):
                    status, safe = curl_transport(ENDPOINT, edit_body(), "fake-test-key")
                self.assertEqual(status, 400)
                self.assertNotIn("message", safe)
                with self.assertRaises(ProviderError) as failure:
                    generate(payload(), "fake-test-key", transport=lambda *args: (400, response))
                self.assertIsNone(failure.exception.message)
                self.assertNotIn("fake-test-key", str(failure.exception))

    def test_malicious_provider_identifiers_and_string_errors_are_not_reflected(self):
        invalid_values = ["fake-test-key", "prefix-fake-test-key-suffix", "fake-test-key secret", "unsafe\nvalue", "中文", "x" * 121, 42]
        for value in invalid_values:
            response = {"error": {field: value for field in ("code", "type", "param", "request_id")}}
            with self.subTest(value_type=type(value).__name__, length=len(value) if isinstance(value, str) else None):
                with self.assertRaises(ProviderError) as failure:
                    generate(payload(), "fake-test-key", transport=lambda *args: (403, response))
                self.assertEqual(failure.exception.status, 403)
                self.assertIsNone(failure.exception.code)
                self.assertIsNone(failure.exception.error_type)
                self.assertIsNone(failure.exception.param)
                self.assertIsNone(failure.exception.request_id)
                self.assertNotIn("fake-test-key", str(failure.exception))
        with self.assertRaises(ProviderError) as failure:
            generate(payload(), "fake-test-key", transport=lambda *args: (401, {"error": "fake-test-key private details"}))
        self.assertIsNone(failure.exception.code)
        self.assertNotIn("private details", str(failure.exception))

    def test_curl_credentials_are_only_in_stdin_and_config_disables_ambient_options(self):
        observed = []

        def curl_process(args, **kwargs):
            observed.append((args, kwargs))
            reply = {"data": [{"b64_json": PNG}]}
            return subprocess.CompletedProcess(args, 0, json.dumps(reply) + "\n200", "")

        with patch("modelflare_adapter.subprocess.run", side_effect=curl_process):
            self.assertEqual(len(generate(payload(), "fake-test-key")["images"]), 1)
        self.assertEqual(len(observed), 1)
        args, options = observed[0]
        self.assertEqual(args, ["curl", "--disable", "--config", "-"])
        self.assertNotIn("fake-test-key", " ".join(args))
        self.assertIn('header = "Authorization: Bearer fake-test-key"', options["input"])
        self.assertTrue(options["input"].startswith("http1.1\n"), "select HTTP/1.1 before the first dispatch, never retry a POST")
        self.assertIn('max-time = "180"', options["input"])
        self.assertNotIn("insecure", options["input"])
        self.assertNotIn("retry", options["input"])

    def test_curl_uses_json_data_binary_with_identical_images_and_scalar_fields(self):
        body = edit_body()

        def curl_process(args, **options):
            config = options["input"]
            self.assertIn('header = "Content-Type: application/json"', config)
            self.assertNotIn("data = ", config)
            self.assertNotIn("form = ", config)
            self.assertNotIn("form-string = ", config)
            data_lines = [line for line in config.splitlines() if line.startswith("data-binary = ")]
            self.assertEqual(len(data_lines), 1)
            json_text = json.loads(data_lines[0].split(" = ", 1)[1])
            self.assertEqual(json.loads(json_text), body)
            self.assertEqual(json_text, json.dumps(body, ensure_ascii=False, separators=(",", ":")))
            self.assertEqual(set(json.loads(json_text)), {"model", "prompt", "images", "n", "size", "quality"})
            reply = {"data": [{"b64_json": PNG}]}
            return subprocess.CompletedProcess(args, 0, json.dumps(reply) + "\n200", "")

        with patch("modelflare_adapter.subprocess.run", side_effect=curl_process):
            status, response = curl_transport(ENDPOINT, body, "fake-test-key")
        self.assertEqual(status, 200)
        self.assertEqual(response["data"][0]["b64_json"], PNG)

    def test_network_failure_is_not_retried_and_does_not_leak_process_details(self):
        with patch("modelflare_adapter.subprocess.run", side_effect=subprocess.TimeoutExpired("fake-test-key", 190)) as process:
            with self.assertRaises(ProviderError) as failure:
                generate(payload(), "fake-test-key")
        self.assertEqual(process.call_count, 1)
        self.assertIsNone(failure.exception.status)
        self.assertNotIn("fake-test-key", str(failure.exception))

    def test_disconnect_after_100_continue_has_no_final_http_status_or_retry(self):
        completed = subprocess.CompletedProcess([], 52, "\n100|1.1|14014471|0|68.130|0.001", "private stderr")
        with patch("modelflare_adapter.subprocess.run", return_value=completed) as process:
            with self.assertRaises(ProviderError) as failure:
                curl_transport(ENDPOINT, edit_body(), "fake-test-key")
        error = failure.exception
        self.assertIsNone(error.status, "100 Continue acknowledges upload, not a final generation response")
        self.assertEqual(error.code, "curl_52")
        self.assertEqual(error.outcome, "unknown")
        self.assertEqual(error.transport["uploadedBytes"], 14014471)
        self.assertEqual(error.transport["downloadedBytes"], 0)
        self.assertEqual(error.transport["httpVersion"], "1.1")
        self.assertEqual(error.transport["curlExitCode"], 52)
        self.assertEqual(process.call_count, 1)


if __name__ == "__main__":
    unittest.main()
