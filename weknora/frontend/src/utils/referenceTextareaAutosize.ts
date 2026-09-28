const REFERENCE_CHAT_TEXTAREA = '.visual-chat-composer__textarea'
const REFERENCE_TEXTAREA_MAX_HEIGHT = 180

const resizeReferenceTextarea = (target: EventTarget | null) => {
  if (!(target instanceof HTMLTextAreaElement)) return
  if (!target.matches(REFERENCE_CHAT_TEXTAREA)) return

  // Mechanical translation of @视觉文件/QAPanel.tsx:
  // reset to auto so scrollHeight can shrink as text is deleted, then cap the
  // rendered height at the reference max-h-[180px]. This owns presentation
  // only; value, keyboard, IME, mention and send behavior stay in WeKnora.
  target.style.height = 'auto'
  const nextHeight = Math.min(target.scrollHeight, REFERENCE_TEXTAREA_MAX_HEIGHT)
  target.style.height = `${nextHeight}px`
  target.style.overflowY = target.scrollHeight > REFERENCE_TEXTAREA_MAX_HEIGHT ? 'auto' : 'hidden'
}

export const installReferenceTextareaAutosize = () => {
  document.addEventListener('input', (event) => resizeReferenceTextarea(event.target), true)
  document.addEventListener('focusin', (event) => resizeReferenceTextarea(event.target), true)
}
