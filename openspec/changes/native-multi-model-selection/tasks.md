## 1. Native Consumer Model Selection

- [x] 1.1 Keep the existing ModelSettings/API implementation for platform operations while hiding and denying configuration in Musuw Lite.
- [x] 1.2 Restore the existing chat model selector with last-choice and default fallback behavior.
- [x] 1.3 Filter all consumer model reads/resolution to built-in OpenRouter rows and enforce the Free/paid catalog on the server.

## 2. Verified Built-ins

- [x] 2.1 Route the managed DeepSeek modes through OpenRouter and add only region-tested chat choices.
- [x] 2.2 Configure the verified embedding, rerank, vision, and ASR presets without changing knowledge-base bindings.

## 3. Verification and Release

- [x] 3.1 Pass focused frontend, backend, static production, and OpenSpec checks.
- [x] 3.2 Verify the local browser build, authenticated Free/paid model selection, hidden settings, and direct API denials.
- [x] 3.3 Retain earlier bounded production model evidence and defer the combined CI/deploy at the user's request because GitHub Actions minutes are exhausted.
