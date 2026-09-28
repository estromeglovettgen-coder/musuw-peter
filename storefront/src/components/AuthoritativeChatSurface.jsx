import { CaretDown } from "@phosphor-icons/react/CaretDown";
import { ImageSquare } from "@phosphor-icons/react/ImageSquare";
import { Paperclip } from "@phosphor-icons/react/Paperclip";
import { PaperPlaneTilt } from "@phosphor-icons/react/PaperPlaneTilt";
import { MusuwProductShell } from "./MusuwProductShell";
import "./authoritative-chat-surface.css";

/**
 * The public product demos use one read-only chat surface.  This is the
 * authoritative seam for the shell, the collapsed navigation, the centered
 * conversation column, and the responsive composer.  Individual demos only
 * provide their fixture messages and timing state.
 */
export function AuthoritativeChatSurface({
  children,
  composer,
  className = "",
  messages,
  messagesRef,
  overlay = null,
  newChat = false,
  newChatTitle,
  shellRef,
  title,
  welcome = null,
  ...rootProps
}) {
  return (
    <MusuwProductShell
      {...rootProps}
      className={`authoritative-chat-surface ${className}`.trim()}
      data-authoritative-chat-surface="true"
      shellRef={shellRef}
      title={title}
    >
      {newChat ? (
        <main className="visual-new-chat-view">
          <section className="visual-new-chat-stack" aria-labelledby="visual-new-chat-title">
            <h2 id="visual-new-chat-title" className="visual-new-chat-title">{newChatTitle}</h2>
            <div className="visual-new-chat-composer">{composer}</div>
          </section>
        </main>
      ) : (
        <main className="authoritative-chat-body visual-chat-view is-sidebar-collapsed">
          <div className="authoritative-chat-scroll visual-chat-scroll" ref={messagesRef}>
            <div className="authoritative-chat-messages visual-chat-messages">
              {welcome ? <div className="authoritative-chat-welcome" aria-hidden="true">{welcome}</div> : null}
              {messages ?? children}
            </div>
          </div>
          <div className="authoritative-chat-composer-slot visual-chat-input">{composer}</div>
          {overlay}
        </main>
      )}
    </MusuwProductShell>
  );
}

export function AuthoritativeChatComposer({
  agent = "知识问答",
  className = "",
  effort,
  isReplying = false,
  model,
  placeholder,
  query = "",
  stopLabel = "Stop",
  sendLabel = "Send",
}) {
  return (
    <div
      className={`authoritative-chat-composer visual-chat-composer ${className}`.trim()}
      data-authoritative-chat-composer="true"
    >
      <div className="authoritative-chat-composer__surface visual-chat-composer__surface">
        <textarea
          className="authoritative-chat-composer__textarea visual-chat-composer__textarea"
          aria-label={placeholder}
          placeholder={placeholder}
          rows="1"
          value={query}
          readOnly
          tabIndex="-1"
        />
        <div className="authoritative-chat-composer__toolbar visual-chat-composer__toolbar">
          <div className="authoritative-chat-composer__tools visual-chat-composer__tools" aria-hidden="true">
            <button type="button" className="authoritative-chat-composer__tool visual-chat-composer__tool" tabIndex="-1" aria-label="Attach image" disabled><ImageSquare size={18} /></button>
            <button type="button" className="authoritative-chat-composer__tool visual-chat-composer__tool" tabIndex="-1" aria-label="Attach file" disabled><Paperclip size={18} /></button>
            <button type="button" className="authoritative-chat-composer__tool visual-chat-composer__tool is-at" tabIndex="-1" aria-label="Mention knowledge" disabled><span className="visual-chat-composer__at">@</span></button>
          </div>
          <div className="authoritative-chat-composer__actions visual-chat-composer__actions">
            <button type="button" className="authoritative-chat-composer__model visual-chat-composer__combined-picker" tabIndex="-1" aria-expanded="false" aria-label={`${agent} ${model} ${effort ?? ""}`} disabled>
              <span className="visual-chat-composer__combined-picker-copy">
                <span className="visual-chat-composer__combined-picker-agent" title={agent}>{agent}</span>
                <span className="visual-chat-composer__combined-picker-dot" aria-hidden="true">·</span>
                <span className="visual-chat-composer__combined-picker-model" title={model}>{model}</span>
                {effort ? <span className="visual-chat-composer__combined-picker-effort">{effort}</span> : null}
              </span>
              <CaretDown size={14} />
            </button>
            <div className="visual-chat-composer__submit authoritative-chat-composer__submit">
              <button
                type="button"
                className={`authoritative-chat-composer__send visual-chat-composer__send${isReplying ? " is-stop" : query.trim() ? "" : " is-disabled"}`}
                aria-label={isReplying ? stopLabel : sendLabel}
                disabled
              >
                {isReplying ? <span className="authoritative-chat-composer__stop-square visual-chat-composer__stop-square" /> : <PaperPlaneTilt size={16} weight="fill" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
