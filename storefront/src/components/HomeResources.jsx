import { CITATION_GUIDES } from "../citationGuideContent";
import { NOTEBOOK_COMPARISONS } from "../notebookComparisonContent";
import { SectionIntro } from "./SiteChrome";
import "./home-resources.css";

export function HomeResources({ locale }) {
  const isZh = locale === "zh-CN";
  const guide = CITATION_GUIDES[locale] ?? CITATION_GUIDES.en;
  const comparison = NOTEBOOK_COMPARISONS[locale] ?? NOTEBOOK_COMPARISONS.en;
  const resources = [
    { href: guide.path, title: guide.title, body: guide.meta.description },
    { href: comparison.path, title: comparison.title, body: isZh ? "按资料问答、Wiki、图谱和学习形式比较，了解适用场景与实际限制。" : "Compare source questions, Wiki, graphs and study formats, including practical limitations." },
    { href: "https://docs.musuw.com/quickstart", title: isZh ? "从资料上传到第一次问答" : "From your first upload to your first answer", body: isZh ? "跟随官方文档创建知识库、上传资料并开始问答，再了解智能体和集成接入。" : "Follow the official quick start for knowledge bases, uploads and questions, then explore agents and integrations. Documentation is currently in Chinese." },
  ];

  return (
    <section className="section home-resources" id="resources" aria-labelledby="home-resources-title">
      <div className="container">
        <div id="home-resources-title">
          <SectionIntro title={isZh ? "使用指南与产品比较" : "Guides and product comparison"} />
        </div>
        <div className="article-grid">
          {resources.map((resource) => <article className="article-card home-resource-card" key={resource.href}>
            <a href={resource.href}>
              <h3>{resource.title}</h3>
              <p>{resource.body}</p>
              <span className="home-resource-action">{isZh ? "阅读全文" : "Read more"} <span aria-hidden="true">→</span></span>
            </a>
          </article>)}
        </div>
      </div>
    </section>
  );
}
