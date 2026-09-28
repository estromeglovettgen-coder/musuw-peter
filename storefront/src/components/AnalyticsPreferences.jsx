import { useEffect, useRef, useState } from "react";
import { getPublicAnalytics } from "../publicAnalytics.js";

export function AnalyticsChoice({ isZh, consent, onChoice, onClose }) {
  return (
    <section className="analytics-choice" role="region" aria-label={isZh ? "统计偏好" : "Analytics preferences"}>
      <h2>{isZh ? "允许基础访问统计吗？" : "Allow basic visit analytics?"}</h2>
      <p>{isZh
        ? "同意后，我们才会加载 Google Analytics，使用 Cookie 了解官网访问情况。不发送您的聊天、文档、搜索内容或账户身份，也不用于广告。拒绝不影响使用。"
        : "With your consent, we load Google Analytics and use cookies to understand visits to this website. We do not send chats, documents, search content or account identities, or use this for advertising. Declining does not affect access."}</p>
      <a href={isZh ? "/cookies?lang=zh-CN" : "/cookies?lang=en"}>{isZh ? "查看 Cookie 说明" : "Read our cookie notice"}</a>
      <div className="analytics-choice-actions">
        <button type="button" className="button button-secondary" onClick={() => onChoice("rejected")}>
          {isZh ? (consent === "accepted" ? "撤回同意" : "拒绝统计") : (consent === "accepted" ? "Withdraw consent" : "Decline analytics")}
        </button>
        <button type="button" className="button button-secondary" onClick={() => onChoice("accepted")}>
          {isZh ? "同意统计" : "Allow analytics"}
        </button>
      </div>
      {consent ? <button type="button" className="analytics-preferences-link" onClick={onClose}>{isZh ? "保持当前设置" : "Keep current choice"}</button> : null}
    </section>
  );
}

export function AnalyticsPreferences({ isZh }) {
  const [consent, setConsent] = useState(null);
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const trigger = useRef(null);

  useEffect(() => {
    const analytics = getPublicAnalytics();
    if (!analytics?.enabled) return;
    analytics.start();
    setEnabled(true);
    setConsent(analytics.consent);
    setOpen(!analytics.consent);
    const refresh = () => {
      setConsent(analytics.consent);
      setOpen(!analytics.consent);
    };
    window.addEventListener("storage", refresh);
    return () => window.removeEventListener("storage", refresh);
  }, []);

  if (!enabled) return null;
  function close() {
    setOpen(false);
    trigger.current?.focus();
  }
  function choose(next) {
    getPublicAnalytics().setConsent(next);
    setConsent(next);
    setOpen(false);
  }
  return <>
    <button ref={trigger} type="button" className="analytics-preferences-link" onClick={() => setOpen(true)} aria-expanded={open}>
      {isZh ? "统计偏好" : "Analytics preferences"}
    </button>
    {open ? <AnalyticsChoice isZh={isZh} consent={consent} onChoice={choose} onClose={close} /> : null}
  </>;
}
