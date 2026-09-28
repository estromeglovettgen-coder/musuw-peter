import { CursorClick } from "@phosphor-icons/react/CursorClick";
import { Tag } from "@phosphor-icons/react/Tag";
import { X } from "@phosphor-icons/react/X";
import { AnimatePresence, motion } from "motion/react";

function localeKey(locale) {
  return String(locale || "zh").toLowerCase().startsWith("zh") ? "zh" : "en";
}

function localized(value, locale, fallback = "") {
  if (value && typeof value === "object") return value[locale] ?? value.zh ?? value.en ?? fallback;
  return value ?? fallback;
}

function nodeIdOf(node) {
  return node?.slug ?? node?.id ?? node?.key ?? "none";
}

function nodeTitleOf(node, locale) {
  return localized(node?.title ?? node?.name ?? node?.label, locale, locale === "zh" ? "未命名页面" : "Untitled page");
}

function categoryLabelOf(node, locale) {
  return localized(
    node?.categoryLabel ?? node?.category ?? node?.pageTypeLabel,
    locale,
    node?.page_type ?? node?.pageType ?? (locale === "zh" ? "知识页" : "Knowledge page"),
  );
}

function renderInlineSegments(segments, activeLinkSlug, pointerStage, linkMoveDurationMs) {
  return (Array.isArray(segments) ? segments : []).map((segment, index) => {
    if (typeof segment === "string") return segment;
    if (!segment?.slug) return segment?.text ?? "";
    const isTarget = segment.slug === activeLinkSlug;
    const pointerVisible = isTarget && ["drawer-link-moving", "drawer-link-press"].includes(pointerStage);
    return (
      <a
        className={`wiki-content-link graph-node-drawer-wiki-link${isTarget ? " is-target" : ""}${pointerStage === "drawer-link-press" && isTarget ? " is-pressing" : ""}`}
        data-graph-drawer-link-slug={segment.slug}
        data-graph-drawer-link-state={isTarget ? pointerStage : undefined}
        href={`#${segment.slug}`}
        key={`${segment.slug}-${index}`}
      >
        {segment.text}
        {pointerVisible ? (
          <motion.span
            animate={{ opacity: 1, scale: pointerStage === "drawer-link-press" ? [1, 0.84, 1] : 1, x: 0, y: 0 }}
            aria-hidden="true"
            className={`kb-preview-graph-pointer graph-node-drawer-pointer${pointerStage === "drawer-link-press" ? " is-clicking" : ""}`}
            data-graph-auto-pointer={pointerStage}
            initial={{ opacity: 0, scale: 0.94, x: -118, y: 62 }}
            transition={{
              opacity: { duration: 0.12 },
              scale: { duration: pointerStage === "drawer-link-press" ? 0.18 : 0.12 },
              x: { duration: linkMoveDurationMs / 1_000, ease: [0.16, 1, 0.3, 1] },
              y: { duration: linkMoveDurationMs / 1_000, ease: [0.16, 1, 0.3, 1] },
            }}
          >
            <CursorClick size={22} weight="fill" />
            <i aria-hidden="true" />
          </motion.span>
        ) : null}
      </a>
    );
  });
}

function WikiPageBody({ activeLinkSlug, document, linkMoveDurationMs, pointerStage, title }) {
  return (
    <div className="wiki-reader-body graph-node-drawer-wiki-body">
      <h1>{title}</h1>
      {document?.lead ? <p>{document.lead}</p> : null}
      {(document?.blocks ?? []).map((block, index) => {
        if (block.type === "heading") {
          const Heading = block.level === 3 ? "h3" : "h2";
          return <Heading key={`heading-${index}`}>{block.text}</Heading>;
        }
        if (block.type === "list") {
          return (
            <ul key={`list-${index}`}>
              {block.items.map((item, itemIndex) => (
                <li key={typeof item === "string" ? item : `item-${itemIndex}`}>
                  {Array.isArray(item)
                    ? renderInlineSegments(item, activeLinkSlug, pointerStage, linkMoveDurationMs)
                    : item}
                </li>
              ))}
            </ul>
          );
        }
        if (block.type === "table") {
          return (
            <table key={`table-${index}`}>
              <thead>
                <tr>
                  {block.headers.map((header) => <th key={header}>{header}</th>)}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, rowIndex) => (
                  <tr key={`row-${rowIndex}`}>
                    {row.map((cell, cellIndex) => (
                      <td key={`cell-${rowIndex}-${cellIndex}`}>
                        {Array.isArray(cell)
                          ? renderInlineSegments(cell, activeLinkSlug, pointerStage, linkMoveDurationMs)
                          : cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          );
        }
        return (
          <p key={`paragraph-${index}`}>
            {renderInlineSegments(block.segments ?? [block.text ?? ""], activeLinkSlug, pointerStage, linkMoveDurationMs)}
          </p>
        );
      })}
    </div>
  );
}

/** Static replay of WikiBrowser's production graph drawer contract. */
export function GraphNodeDetailDrawer({
  open = false,
  node = null,
  locale = "zh",
  document = null,
  linkMoveDurationMs = 1_200,
  neighborHint = "",
  activeLinkSlug = null,
  pointerStage = null,
  className = "",
}) {
  const language = localeKey(locale);
  const nodeId = nodeIdOf(node);
  const title = nodeTitleOf(node, language);
  const category = categoryLabelOf(node, language);
  const expandLabel = language === "zh" ? "展开邻居" : "Expand neighbors";

  return (
    <div
      aria-hidden={!open}
      className={`graph-node-drawer-layer ${className}`.trim()}
      data-graph-drawer-node-id={nodeId}
      data-graph-node-drawer={open ? "open" : "closed"}
    >
      <AnimatePresence initial={false}>
        {open ? (
          <motion.aside
            aria-label={`${title} ${language === "zh" ? "Wiki 页面" : "Wiki page"}`}
            animate={{ opacity: 1, x: 0 }}
            className="graph-node-drawer wiki-graph-drawer"
            data-graph-drawer-panel="true"
            exit={{ opacity: 0, x: "100%" }}
            initial={{ opacity: 0, x: "100%" }}
            transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
          >
            <header className="graph-node-drawer-header">
              <strong className="graph-node-drawer-title">{title}</strong>
              <span aria-hidden="true" className="graph-node-drawer-close"><X size={19} weight="regular" /></span>
            </header>
            <div className="graph-node-drawer-body">
              <div className="wiki-reader-meta graph-node-drawer-meta">
                <span className="graph-node-drawer-chip"><Tag size={14} weight="regular" />{category}</span>
                <span className="wiki-reader-meta-text graph-node-drawer-version">v1</span>
                <span className="graph-node-drawer-expand">{expandLabel}</span>
              </div>
              {neighborHint ? <div className="wiki-drawer-neighbor-hint graph-node-drawer-neighbor-hint">{neighborHint}</div> : null}
              <WikiPageBody activeLinkSlug={activeLinkSlug} document={document} linkMoveDurationMs={linkMoveDurationMs} pointerStage={pointerStage} title={title} />
            </div>
          </motion.aside>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export default GraphNodeDetailDrawer;
