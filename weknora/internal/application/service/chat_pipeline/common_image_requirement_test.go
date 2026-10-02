package chatpipeline

import (
	"strings"
	"testing"
)

func TestAppendRetrievedImageOutputRequirement(t *testing.T) {
	base := "Answer from retrieved evidence."
	withImage := appendRetrievedImageOutputRequirement(
		base,
		"context\n![流程图](resource://AbCdEfGhIjKlMnOpQrStUv)",
	)
	for _, required := range []string{
		base,
		"必须至少展示一张从检索上下文复制的相关 Markdown 图片",
		"完整复制图片的 Markdown 语法及原 URL",
		"ASCII 半角括号",
		"放在它所支持的段落之后",
	} {
		if !strings.Contains(withImage, required) {
			t.Fatalf("expected %q in dynamic image requirement:\n%s", required, withImage)
		}
	}

	withoutImage := appendRetrievedImageOutputRequirement(base, "text-only retrieved context")
	if withoutImage != base {
		t.Fatalf("text-only context should not change the system prompt: %q", withoutImage)
	}
}
