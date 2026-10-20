"""Exercise reference selection through the same prompt interface as HTTP."""

import unittest

from reference_workflow import WORKFLOW_CONFIG, preview_prompt


class ReferenceWorkflowTests(unittest.TestCase):
    def test_selected_roles_follow_image_order_without_implying_other_references(self):
        result = preview_prompt({"promptMode": "default", "images": [
            {"id": "riverside", "roles": ["background", "pose"]},
            {"id": "person", "roles": ["face"]},
            {"id": "outfit", "roles": ["upper", "lower"]},
        ]})
        self.assertTrue(result["valid"], result["errors"])
        self.assertIn("图1：背景、动作", result["prompt"])
        self.assertIn("图2：脸部身份", result["prompt"])
        self.assertIn("图3：上半身穿搭、下半身穿搭", result["prompt"])
        self.assertNotIn("发型参考", result["prompt"])
        self.assertNotIn("首饰参考", result["prompt"])
        self.assertIn("严格遵守", result["prompt"])
        self.assertIn("屏幕反光", result["prompt"])
        self.assertIn("不要机械复制表情", result["prompt"])
        self.assertIn("肩颈", result["prompt"])

    def test_two_images_can_cover_only_two_roles_without_filling_the_others(self):
        result = preview_prompt({"promptMode": "default", "images": [
            {"id": "arbitrary:first", "roles": ["face"]},
            {"id": "arbitrary:second", "roles": ["upper"]},
        ]})
        self.assertTrue(result["valid"], result["errors"])
        for absent_instruction in ("发型参考：", "背景参考：", "动作参考：", "首饰参考：", "身材参考：", "下半身穿搭参考：", "鞋履参考："):
            self.assertNotIn(absent_instruction, result["prompt"])

    def test_invalid_drafts_return_errors_and_never_infer_legacy_slot_roles(self):
        invalid_images = [
            [], [{"id": "one", "roles": ["face"]}],
            [{"id": "one", "roles": []}, {"id": "two", "roles": ["upper"]}],
            [{"id": "one", "roles": ["upper"]}, {"id": "two", "roles": ["upper"]}],
            [{"id": "one", "roles": ["face", "face"]}, {"id": "two", "roles": ["upper"]}],
            [{"id": "one", "roles": ["invalid"]}, {"id": "two", "roles": ["upper"]}],
            [{"id": "one", "roles": "face"}, {"id": "two", "roles": ["upper"]}],
            [{"id": "same", "roles": ["face"]}, {"id": "same", "roles": ["upper"]}],
            [{"id": "image-one"}, {"id": "image-two"}, {"id": "image-three"}],
            [None, {"id": "two", "roles": ["upper"]}],
        ]
        for images in invalid_images:
            with self.subTest(images=images):
                result = preview_prompt({"promptMode": "default", "images": images})
                self.assertFalse(result["valid"])
                self.assertTrue(result["errors"])

    def test_strict_pose_is_optional_and_is_not_added_without_pose_selection(self):
        draft = {"promptMode": "default", "poseStrict": False, "images": [
            {"id": "pose", "roles": ["pose"]}, {"id": "person", "roles": ["face"]},
        ]}
        result = preview_prompt(draft)
        self.assertTrue(result["valid"])
        self.assertIn("允许为自然舒展", result["prompt"])
        self.assertNotIn("严格遵守", result["prompt"])
        draft["poseStrict"] = "false"
        self.assertFalse(preview_prompt(draft)["valid"])

    def test_custom_has_no_reference_minimum_or_role_restrictions_and_keeps_coordination(self):
        for images in ([], [{"id": "one"}], [
            {"id": "one", "roles": ["face"]}, {"id": "two", "roles": ["face"]},
        ]):
            with self.subTest(images=images):
                result = preview_prompt({"promptMode": "custom", "prompt": "自然的街头时装摄影", "images": images})
                self.assertTrue(result["valid"], result["errors"])
                self.assertIn("整体协调规则", result["prompt"])
                self.assertIn("自然的街头时装摄影", result["prompt"])
                self.assertNotIn("脸部身份参考：", result["prompt"])

    def test_final_prompt_keeps_long_user_input_without_a_local_character_cap(self):
        text = "x" * 32001
        result = preview_prompt({"promptMode": "custom", "prompt": text, "images": []})
        self.assertTrue(result["valid"], result["errors"])
        self.assertIn(text, result["prompt"])

    def test_face_selection_prioritizes_identity_without_imposing_it_on_other_roles(self):
        draft = {"promptMode": "default", "images": [
            {"id": "person", "roles": ["face"]}, {"id": "outfit", "roles": ["upper"]},
        ]}
        result = preview_prompt(draft)
        self.assertTrue(result["valid"])
        for instruction in ("身份保真优先于美化", "脸部宽度", "颊部体积", "下颌轮廓", "眼鼻唇的相对比例和嘴型", "不瘦脸、不削下巴", "不混入未指定为脸部身份参考图的人脸", "表情可以自然变化"):
            self.assertIn(instruction, result["prompt"])
        self.assertNotIn("发型参考：", result["prompt"])
        self.assertNotIn("首饰参考：", result["prompt"])
        draft["images"][0]["roles"] = ["background"]
        result = preview_prompt(draft)
        self.assertTrue(result["valid"])
        for instruction in ("身份保真优先于美化", "颊部体积", "不瘦脸、不削下巴", "不混入未指定为脸部身份参考图的人脸"):
            self.assertNotIn(instruction, result["prompt"])

    def test_all_modes_preserve_existing_lens_tone_without_copying_screen_reflections(self):
        for mode in ("default", "custom"):
            draft = {"promptMode": mode, "prompt": "自然人像摄影", "images": [
                {"id": "scene", "roles": ["background"]}, {"id": "outfit", "roles": ["upper"]},
            ]}
            with self.subTest(mode=mode):
                result = preview_prompt(draft)
                self.assertTrue(result["valid"])
                self.assertIn("保留实际眼镜合理的镜片色调", result["prompt"])
                self.assertIn("不复制参考照片中的屏幕反光", result["prompt"])
                self.assertIn("整体协调规则", result["prompt"])
                self.assertNotIn("镜片通透、双眼清晰可见", result["prompt"])
                self.assertNotIn("首饰参考：", result["prompt"])

    def test_multiple_face_sources_form_one_identity_group_in_upload_order(self):
        result = preview_prompt({"promptMode": "default", "images": [
            {"id": "scene", "roles": ["pose", "background"]},
            {"id": "front", "roles": ["face"]},
            {"id": "outfit", "roles": ["upper", "lower"]},
            {"id": "side", "roles": ["face"]},
            {"id": "smile", "roles": ["face"]},
        ]})
        self.assertTrue(result["valid"], result["errors"])
        self.assertIn("脸部身份组：图2、图4、图5", result["prompt"])
        self.assertIn("同一目标人物的多角度身份参考", result["prompt"])
        self.assertIn("只输出该人物一人", result["prompt"])
        self.assertIn("未指定脸部身份的参考图不得贡献人脸", result["prompt"])
        self.assertIn("不要把不同照片的表情、拍摄距离或镜头畸变平均成新脸", result["prompt"])
        self.assertEqual(result["prompt"].count("身份保真优先于美化"), 1)
        self.assertNotIn("不混入其他参考图的人脸", result["prompt"])
        for index in (2, 4, 5):
            self.assertIn(f"图{index}：脸部身份", result["prompt"])

    def test_face_is_the_only_role_with_multiple_source_metadata(self):
        roles = {role["id"]: role["allowMultipleSources"] for role in WORKFLOW_CONFIG["roles"]}
        self.assertTrue(roles.pop("face"))
        self.assertTrue(roles)
        self.assertFalse(any(roles.values()))

    def test_other_roles_stay_exclusive_and_same_image_cannot_repeat_face(self):
        for role in ("hair", "pose", "background", "jewelry", "body", "upper", "lower", "shoes"):
            with self.subTest(role=role):
                result = preview_prompt({"promptMode": "default", "images": [
                    {"id": "first", "roles": [role]}, {"id": "second", "roles": [role]},
                ]})
                self.assertFalse(result["valid"])
                self.assertIn("只能由一张参考图提供", " ".join(result["errors"]))
        result = preview_prompt({"promptMode": "default", "images": [
            {"id": "first", "roles": ["face", "face"]}, {"id": "second", "roles": ["face"]},
        ]})
        self.assertFalse(result["valid"])
        self.assertIn("不能重复选择", " ".join(result["errors"]))

    def test_covering_every_role_still_allows_an_additional_face_source(self):
        images = [{"id": role["id"], "roles": [role["id"]]} for role in WORKFLOW_CONFIG["roles"]]
        images.append({"id": "another-angle", "roles": ["face"]})
        result = preview_prompt({"promptMode": "default", "images": images})
        self.assertTrue(result["valid"], result["errors"])
        self.assertIn("脸部身份组：图1、图10", result["prompt"])
        self.assertEqual(result["prompt"].count("身份保真优先于美化"), 1)

    def test_both_modes_request_natural_true_features_without_changing_identity(self):
        drafts = [
            {"promptMode": "default", "images": [
                {"id": "front", "roles": ["face"]}, {"id": "side", "roles": ["face"]},
            ]},
            {"promptMode": "default", "images": [
                {"id": "scene", "roles": ["background"]}, {"id": "outfit", "roles": ["upper"]},
            ]},
            {"promptMode": "custom", "prompt": "自然的河边摄影", "images": []},
        ]
        for draft in drafts:
            with self.subTest(mode=draft["promptMode"], images=draft["images"]):
                result = preview_prompt(draft)
                self.assertTrue(result["valid"], result["errors"])
                for phrase in ("有脸部参考时", "更自然的五官比例", "更接近参考照中的真实五官", "保留参考照真实的五官相对比例", "只纠正不合理的成像畸变", "不改变骨相或身份", "不做通用帅化"):
                    self.assertIn(phrase, result["prompt"])
                if draft["images"] and draft["images"][0]["roles"] == ["face"]:
                    self.assertEqual(result["prompt"].count("脸部身份参考："), 1)
                    self.assertIn("脸部身份组：图1、图2", result["prompt"])
                else:
                    self.assertNotIn("脸部身份参考：", result["prompt"])
                    self.assertNotIn("脸部身份组：", result["prompt"])


if __name__ == "__main__":
    unittest.main()
