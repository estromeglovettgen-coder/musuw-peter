import { X } from "@phosphor-icons/react/X";
import { FileText } from "@phosphor-icons/react/FileText";
import { getDemoSource, getSourceLabels } from "../data/demoSources";
import "../demo-source-preview.css";

// A bounded source view inside the existing product surface. Automatic previews
// never take keyboard focus; visitors can inspect and dismiss citations normally.
export function DemoSourcePreview({ sourceId, locale = "en", onClose, className = "" }) {
  if (!sourceId) return null;
  const source = getDemoSource(sourceId, locale);
  const labels = getSourceLabels(locale);
  return (
    <aside
      className={`demo-source-preview ${className}`.trim()}
      aria-label={labels.label}
      data-demo-source={sourceId}
      data-source-kind={source.kind}
      onKeyDown={(event) => {
        if (event.key === "Escape") { event.stopPropagation(); onClose?.(); }
      }}
    >
      <header>
        <FileText size={13} aria-hidden="true" />
        <strong>{source.title}</strong>
        <button type="button" aria-label={labels.close} onClick={onClose}><X size={13} /></button>
      </header>
      <div className="demo-source-preview__locator">{source.locator}</div>
      <small>{labels[source.format]}</small>
      <p>{source.excerpt}</p>
      {source.url ? (
        <a href={source.url} target="_blank" rel="noopener noreferrer">{labels.open}</a>
      ) : null}
      {source.reviewedAt ? <small className="demo-source-preview__reviewed">{labels.reviewed}: {source.reviewedAt}</small> : null}
    </aside>
  );
}
