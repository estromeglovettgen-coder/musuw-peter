"""Own reference selections and the prompt shared by preview and generation."""

ROLES = (
    ("face", "脸部身份"), ("hair", "发型"), ("pose", "动作"),
    ("background", "背景"), ("jewelry", "首饰与配饰"), ("body", "身材"),
    ("upper", "上半身穿搭"), ("lower", "下半身穿搭"), ("shoes", "鞋履"),
)
ROLE_LABELS = dict(ROLES)
_MULTIPLE_SOURCE_ROLES = frozenset({"face"})
WORKFLOW_CONFIG = {
    "roles": [{"id": role, "label": label, "allowMultipleSources": role in _MULTIPLE_SOURCE_ROLES}
              for role, label in ROLES],
    "minimumImages": 2, "maximumImages": None, "poseStrictDefault": True,
    "providerReferenceLimit": None, "requestTargetBytes": None,
}

SYSTEM_PROMPT = (
    "整体协调规则：把画面作为同一次真实摄影整体重新创作，不做贴脸、剪贴或机械替换。"
    "涉及人物时，指定身份参考应保持可辨识，但不要机械复制表情；根据最终动作、镜头和环境形成放松自然的神态，"
    "嘴唇、下颌、牙齿及面部肌肉符合真实解剖，不拉扯嘴部或硬贴笑容。"
    "有脸部参考时，呈现更自然的五官比例、更接近参考照中的真实五官；这里的自然是保留参考照真实的五官相对比例，"
    "只纠正不合理的成像畸变，不改变骨相或身份，不做通用帅化。"
    "如画面中出现眼镜，保留实际眼镜合理的镜片色调，不复制参考照片中的屏幕反光、窗口倒影或拍摄设备倒影，"
    "只保留最终场景下合理而轻微的反射。"
    "统一头身比例、肩颈连接、身形与服装贴合、手脚结构、镜头透视、景深、光向、阴影、色温和皮肤质感；"
    "面部、身体、服装和环境应像同一时刻自然拍下，整体协调；人像应精神而自然。"
    "输出一张完整成片，不要文字、水印、拼图或对照面板。"
)

_INSTRUCTIONS = {
    "face": (
        "脸部身份参考：身份保真优先于美化。严格保持该参考人物真实的脸部宽度、颊部体积、下颌轮廓、"
        "眼鼻唇的相对比例和嘴型；不瘦脸、不削下巴，不混入未指定为脸部身份参考图的人脸。"
        "根据最终视角自然重建面部，表情可以自然变化，但不能改变上述身份特征。"
    ),
    "hair": "发型参考：参考头发的长度、发量、轮廓与造型，贴合最终头部朝向和光线。",
    "background": "背景参考：参考环境、构图、拍摄机位和场景光线，人物须真实处于该环境中。",
    "jewelry": "首饰参考：参考眼镜款式、耳饰、项链、手表等配饰，正确佩戴并服从最终场景光线。",
    "body": "身材参考：参考体型、身形和身体比例，保持头身连接及整体解剖自然。",
    "upper": "上半身穿搭参考：参考上衣的款式、颜色、材质、层次与版型，褶皱贴合最终身体及动作。",
    "lower": "下半身穿搭参考：参考裤装或裙装的款式、颜色、材质与版型，腰线和褶皱符合最终动作。",
    "shoes": "鞋履参考：参考鞋子的款式、颜色与材质，脚部透视和地面接触真实。",
}


def preview_prompt(payload):
    """Return a draft and validation errors without credentials or side effects.

    References are numbered in upload order. This interface intentionally does
    not inspect image bytes: preview only needs selection metadata; generation
    separately validates local image data before any transport is possible.
    """
    errors = []
    lines = [SYSTEM_PROMPT]
    if not isinstance(payload, dict):
        return {"prompt": SYSTEM_PROMPT, "valid": False, "errors": ["请求必须是 JSON 对象。"]}
    mode = payload.get("promptMode")
    if mode not in ("default", "custom"):
        errors.append("提示词模式无效。")
    images = payload.get("images", [])
    if not isinstance(images, list):
        errors.append("参考图必须是数组。")
        images = []
    identifiers = set()
    for index, image in enumerate(images, 1):
        identifier = image.get("id") if isinstance(image, dict) else None
        if not isinstance(identifier, str) or not identifier.strip():
            errors.append(f"图{index}需要有效的唯一标识。")
        elif identifier in identifiers:
            errors.append("参考图标识不能重复。")
        else:
            identifiers.add(identifier)
    if mode == "custom":
        custom = payload.get("prompt")
        if not isinstance(custom, str) or not custom.strip():
            errors.append("自定义模式需要填写提示词。")
        else:
            lines.append("用户创作要求：\n" + custom.strip())
    elif mode == "default":
        if len(images) < 2:
            errors.append("合成模式至少需要两张参考图。")
        strict = payload.get("poseStrict", True)
        if type(strict) is not bool:
            errors.append("动作严格度必须是布尔值。")
            strict = True
        occupied, face_sources = set(), []
        lines.append("参考图按上传顺序编号；只将以下明确选中的要素作为对应参考图的约束：")
        for index, image in enumerate(images, 1):
            roles = image.get("roles") if isinstance(image, dict) else None
            if not isinstance(roles, list) or not roles:
                errors.append(f"图{index}至少选择一个参考要素。")
                continue
            selected, image_roles = [], set()
            for role in roles:
                if not isinstance(role, str) or role not in ROLE_LABELS:
                    errors.append(f"图{index}包含无效参考要素。")
                    continue
                if role in image_roles:
                    errors.append(f"图{index}的{ROLE_LABELS[role]}不能重复选择。")
                    continue
                image_roles.add(role)
                if role in occupied and role not in _MULTIPLE_SOURCE_ROLES:
                    errors.append(f"{ROLE_LABELS[role]}只能由一张参考图提供。")
                    continue
                occupied.add(role)
                selected.append(role)
                if role == "face":
                    face_sources.append(index)
            if not selected:
                continue
            lines.append(f"图{index}：" + "、".join(ROLE_LABELS[role] for role in selected) + "。")
            for role in selected:
                if role == "face":
                    continue  # One shared identity rule applies to every face source below.
                elif role == "pose":
                    lines.append(
                        "动作参考：严格遵守该图的头部朝向、肩胯角度、躯干姿势、双臂双手及腿部位置、重心和站坐关系；"
                        "只允许为真实解剖、服装贴合及合理接触所必需的微调，不得换成另一种动作。" if strict else
                        "动作参考：参考该图动作的整体意图与站坐关系，允许为自然舒展及画面协调调整肢体位置。"
                    )
                else:
                    lines.append(_INSTRUCTIONS[role])
        if face_sources:
            sources = "、".join(f"图{index}" for index in face_sources)
            grouping = "共同作为同一目标人物的多角度身份参考" if len(face_sources) > 1 else "作为目标人物的身份参考"
            lines.append(
                f"脸部身份组：{sources}{grouping}，只输出该人物一人。"
                "只从该身份组提取一致的真实身份特征，未指定脸部身份的参考图不得贡献人脸。"
                "不要把不同照片的表情、拍摄距离或镜头畸变平均成新脸。"
            )
            lines.append(_INSTRUCTIONS["face"])
    hints = payload.get("layoutHints", {})
    ratio = hints.get("ratio") if isinstance(hints, dict) else None
    if isinstance(ratio, str) and ratio.strip():
        lines.append("输出比例：" + ratio.strip() + "。")
    prompt = "\n\n".join(lines)
    return {"prompt": prompt, "valid": not errors, "errors": list(dict.fromkeys(errors))}


def build_prompt(payload):
    """Return the authoritative valid prompt or reject before transport."""
    result = preview_prompt(payload)
    if not result["valid"]:
        raise ValueError("；".join(result["errors"]))
    return result["prompt"]
