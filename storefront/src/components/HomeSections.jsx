import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check } from "@phosphor-icons/react/Check";
import { CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { ClipboardText } from "@phosphor-icons/react/ClipboardText";
import { Minus } from "@phosphor-icons/react/Minus";
import { Plus } from "@phosphor-icons/react/Plus";
import { SquaresFour } from "@phosphor-icons/react/SquaresFour";
import { Star } from "@phosphor-icons/react/Star";
import {
  articles,
  benefits,
  comparisonGroups,
  customerMarks,
  faqs,
  features,
  currencySymbols,
  priceBooks,
  plans,
  testimonials,
  workflows
} from "../data/homeContent";
import { Reveal, StaggerGroup, StaggerItem } from "./MotionPrimitives";
import { ButtonLink, SectionIntro } from "./SiteChrome";
import { APP_LOGIN_URL, createProductLoginUrl } from "../productHandoff";
import {
  FinalCtaProductDemo,
  GraphCapabilityDemo,
  ReasoningCapabilityDemo,
  WikiCapabilityDemo,
} from "./ProductCapabilityDemos";

function formatPlanAmount(symbol, amount) {
  return `${symbol}${amount.toLocaleString("en-US")}`;
}

const PUBLIC_COMPARISON_CAPABILITIES = new Set([
  "Storage",
  "Knowledge bases",
  "Documents per knowledge base",
  "Video upload",
  "Multi-platform link import",
  "Advanced model access"
]);

function getPublicComparisonRows(copy) {
  const localizedNames = new Map();

  comparisonGroups.forEach((group, groupIndex) => {
    group.rows.forEach(([sourceName], rowIndex) => {
      localizedNames.set(
        sourceName,
        copy.comparison.groups[groupIndex]?.rows[rowIndex] ?? sourceName
      );
    });
  });

  return comparisonGroups
    .flatMap((group) => group.rows)
    .filter(([sourceName]) => PUBLIC_COMPARISON_CAPABILITIES.has(sourceName))
    .map(([sourceName, ...availability]) => ({
      sourceName,
      name: localizedNames.get(sourceName) ?? sourceName,
      availability
    }));
}

export function CustomerStrip({ copy }) {
  return (
    <section className="customer-strip" aria-label={copy.customerStrip.label}>
      <div className="container">
        <p>{copy.customerStrip.label}</p>
        <div className="customer-ticker">
          <div className="customer-track">
            {[...customerMarks, ...customerMarks, ...customerMarks].map(({ name, icon: Icon }, idx) => (
              <div className="customer-logo" key={`${name}-${idx}`}>
                <Icon size={20} weight="duotone" aria-hidden="true" />
                <span>{name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

const FEATURE_DEMOS = Object.freeze({
  0: ReasoningCapabilityDemo,
  2: GraphCapabilityDemo,
  3: WikiCapabilityDemo,
});

function FeatureStory({ feature, index, locale, sourceIndex }) {
  const reverse = index % 2 === 1;
  const CapabilityDemo = FEATURE_DEMOS[sourceIndex];

  return (
    <article className={`feature-story ${reverse ? "feature-story-reverse" : ""}`}>
      <div className="feature-copy">
        <h3>{feature.title}</h3>
        <p>{feature.description}</p>
        <ul className="feature-bullets">
          {feature.bullets.map((bullet) => (
            <li key={bullet}>
              <CheckCircle size={18} weight="fill" aria-hidden="true" />
              {bullet}
            </li>
          ))}
        </ul>
      </div>
      <div className="feature-visual">
        <CapabilityDemo locale={locale} />
      </div>
    </article>
  );
}

export function FeaturesSection({ copy, locale }) {
  const visibleFeatureIndexes = [0, 3, 2];
  const localizedFeatures = visibleFeatureIndexes.map((sourceIndex) => ({
    ...features[sourceIndex],
    ...copy.features.items[sourceIndex],
    sourceIndex,
  }));
  return (
    <section className="section features-section" id="feature">
      <div className="container">
        <SectionIntro
          title={copy.features.intro.title}
          body={copy.features.intro.body}
        />
        <div className="feature-stack">
          {localizedFeatures.map((feature, index) => (
            <FeatureStory
              feature={feature}
              index={index}
              locale={locale}
              sourceIndex={feature.sourceIndex}
              key={feature.title}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

export function WorkflowSection({ copy }) {
  const reduceMotion = useReducedMotion();

  return (
    <section className="section workflow-section" id="use-cases">
      <div className="container">
        <Reveal>
          <SectionIntro
            label={copy.workflow.intro.label}
            icon={SquaresFour}
            title={copy.workflow.intro.title}
            body={copy.workflow.intro.body}
          />
        </Reveal>
        <StaggerGroup className="workflow-grid" amount={0.12} stagger={0.11}>
          {workflows.map(({ icon: Icon }, index) => {
            const { title, body } = copy.workflow.items[index];
            return (
            <StaggerItem
              className={`workflow-card ${index < 2 ? "workflow-card-large" : "workflow-card-small"}`}
              direction={index === 0 ? "left" : index === 1 ? "right" : "up"}
              distance={index < 2 ? 64 : 52}
              key={title}
            >
              {index >= 2 && (
                <span className="workflow-icon">
                  <Icon size={21} weight="regular" aria-hidden="true" />
                </span>
              )}
              <div>
                <h3>{title}</h3>
                <p>{body}</p>
              </div>
              {index < 2 ? (
                <motion.div
                  className={`workflow-image workflow-image-${index + 1}`}
                  initial={
                    reduceMotion
                      ? false
                      : { y: 24, opacity: 0.85 }
                  }
                  whileInView={{
                    y: 0,
                    opacity: 1
                  }}
                  viewport={{ once: true, amount: 0.2 }}
                  transition={{
                    type: "spring",
                    stiffness: 90,
                    damping: 20,
                    mass: 0.8,
                    delay: reduceMotion ? 0 : 0.1
                  }}
                >
                  <img
                    src={index === 0 ? "/images/musuw-wiki-page.jpg" : "/images/musuw-wiki-graph.jpg"}
                    alt={copy.workflow.imageAlts[index]}
                    width="3024"
                    height="1898"
                    draggable={false}
                    loading="lazy"
                  />
                </motion.div>
              ) : null}
            </StaggerItem>
            );
          })}
        </StaggerGroup>
      </div>
    </section>
  );
}

export function BenefitsSection({ copy }) {
  return (
    <section className="section benefits-section">
      <div className="container">
        <Reveal>
          <SectionIntro
            label={copy.benefits.intro.label}
            icon={CheckCircle}
            title={copy.benefits.intro.title}
            body={copy.benefits.intro.body}
          />
        </Reveal>
        <StaggerGroup className="benefit-grid" amount={0.2} stagger={0.085}>
          {benefits.map(({ icon: Icon }, index) => {
            const { title, body } = copy.benefits.items[index];
            return (
            <StaggerItem
              className={`benefit-item benefit-item-${(index % 3) + 1}`}
              direction={index % 3 === 0 ? "left" : index % 3 === 2 ? "right" : "up"}
              distance={48}
              key={title}
            >
              <span>
                <Icon size={23} weight="duotone" aria-hidden="true" />
              </span>
              <h3>{title}</h3>
              <p>{body}</p>
            </StaggerItem>
            );
          })}
        </StaggerGroup>
      </div>
    </section>
  );
}

export function PricingSection({ copy, pricingCurrency }) {
  const [yearly, setYearly] = useState(false);
  const effectiveCurrency = pricingCurrency ?? copy.pricing.currencyCode;
  const priceBook = priceBooks[effectiveCurrency] ?? priceBooks[copy.pricing.currencyCode] ?? priceBooks.USD;
  const currencySymbol = currencySymbols[effectiveCurrency] ?? copy.pricing.currencySymbol;
  const localizedPlans = plans.map((plan, index) => ({
    ...plan,
    ...copy.pricing.plans[index],
    ...priceBook[index]
  }));

  return (
    <section className="section pricing-section" id="pricing">
      <div className="container">
        <Reveal className="pricing-heading">
          <h2>{copy.pricing.intro.title}</h2>
        </Reveal>
        <div className="pricing-controls">
          <div className="billing-toggle" role="group" aria-label={copy.pricing.billingAria}>
            <button
              type="button"
              className={!yearly ? "active" : ""}
              aria-pressed={!yearly}
              onClick={() => setYearly(false)}
            >
              {copy.pricing.monthly}
            </button>
            <button
              type="button"
              className={yearly ? "active" : ""}
              aria-pressed={yearly}
              onClick={() => setYearly(true)}
            >
              {copy.pricing.yearly}
              <span>{copy.pricing.save}</span>
            </button>
          </div>
        </div>
        <div className="pricing-grid">
          {localizedPlans.map((plan) => (
            <article
              className="pricing-card"
              data-plan={plan.key}
              key={plan.name}
            >
              <div className="pricing-card-content">
                <div className="plan-summary">
                  <div className="plan-heading">
                    <div className="plan-title-row">
                      <h3>{plan.name}</h3>
                      {plan.featured ? <span className="plan-recommended">{copy.pricing.recommended}</span> : null}
                    </div>
                    <p className="plan-description">{plan.description}</p>
                  </div>
                  <div className="plan-price">
                    <strong>{formatPlanAmount(currencySymbol, yearly ? plan.yearlyTotal : plan.monthly)}</strong>
                    <span>{yearly ? copy.pricing.perYear : copy.pricing.perUserMonth}</span>
                  </div>
                </div>
                {plan.key === "free" ? (
                  <ButtonLink
                    className="pricing-button"
                    href={APP_LOGIN_URL}
                    variant="secondary"
                  >
                    {copy.pricing.freeAction}
                  </ButtonLink>
                ) : plan.available === false ? (
                  <ButtonLink
                    className="pricing-button"
                    href="/contact"
                    variant="secondary"
                  >
                    {copy.pricing.unavailableAction}
                  </ButtonLink>
                ) : (
                  <ButtonLink
                    className="pricing-button"
                    href={createProductLoginUrl({
                      plan: plan.key,
                      billingPeriod: yearly ? "yearly" : "monthly"
                    })}
                    variant="primary"
                  >
                    {copy.pricing.checkout.action}
                  </ButtonLink>
                )}
                <div className="plan-includes">
                  <strong>{copy.pricing.includes}</strong>
                  <ul>
                    {plan.features.map((feature) => (
                      <li key={feature}>
                        <Check size={18} weight="bold" aria-hidden="true" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function ComparisonSection({ copy }) {
  return (
    <section className="comparison-section">
      <div className="container">
        <ComparisonTable copy={copy} />
      </div>
    </section>
  );
}

function ComparisonTable({ copy }) {
  const rows = getPublicComparisonRows(copy);
  const chinese = copy.pricing.currencyCode === "CNY";
  const sharedCapabilities = chinese
    ? "所有方案都包含有依据的回答、精确引用、AI 整理的 Wiki、知识图谱、资料历史、导出与删除控制。"
    : "Every plan includes grounded answers, exact citations, an AI-organized Wiki, a knowledge graph, source history, export, and deletion controls.";
  const noPlanCap = chinese ? "不限" : "Unlimited";

  return (
    <Reveal className="comparison-wrap">
      <h2 style={{ margin: 0, textAlign: "center" }}>{copy.comparison.title}</h2>
      <p
        className="comparison-description"
        style={{
          maxWidth: "760px",
          margin: "18px auto 48px",
          color: "var(--ink-soft)",
          fontSize: "16px",
          lineHeight: 1.55,
          textAlign: "center"
        }}
      >
        {sharedCapabilities}
      </p>
      <div
        className="comparison-table"
        role="table"
        aria-label={copy.comparison.tableAria}
        style={{
          width: "100%",
          minWidth: "820px",
          marginLeft: 0,
          overflow: "hidden"
        }}
      >
        <div className="comparison-head" role="row">
          <span role="columnheader">{copy.comparison.firstColumn}</span>
          {copy.comparison.plans.map((plan) => <span role="columnheader" key={plan}>{plan}</span>)}
        </div>
        <div role="rowgroup">
          {rows.map(({ sourceName, name, availability }) => (
            <div className="comparison-row" role="row" key={sourceName}>
              <span role="cell">{name}</span>
              {availability.map((enabled, index) => (
                <span role="cell" key={`${sourceName}-${index}`}>
                  {typeof enabled === "string" ? (
                    <span className="comparison-value-text">
                      {enabled === "No plan-specific cap"
                        ? noPlanCap
                        : copy.comparison.valueLabels[enabled] ?? enabled}
                    </span>
                  ) : enabled ? (
                    <CheckCircle size={19} weight="fill" aria-label={copy.comparison.included} />
                  ) : (
                    <Minus size={17} aria-label={copy.comparison.notIncluded} />
                  )}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </Reveal>
  );
}

export function TestimonialsSection({ copy }) {
  const localizedTestimonials = testimonials.map((testimonial, index) => ({
    ...testimonial,
    ...copy.testimonials.items[index]
  }));
  const col1 = localizedTestimonials.filter((_, i) => i % 3 === 0);
  const col2 = localizedTestimonials.filter((_, i) => i % 3 === 1);
  const col3 = localizedTestimonials.filter((_, i) => i % 3 === 2);

  return (
    <section className="section testimonials-section">
      <div className="container testimonial-frame">
        <Reveal>
          <SectionIntro
            label={copy.testimonials.intro.label}
            icon={ClipboardText}
            title={copy.testimonials.intro.title}
            body={copy.testimonials.intro.body}
          />
          <div className="testimonial-rating">
            <Star size={16} weight="fill" aria-hidden="true" />
            <span>{copy.testimonials.rating}</span>
          </div>
        </Reveal>

        <div className="testimonial-shell">
          <div className="testimonial-col col-down">
            <div className="testimonial-track">
              {[...col1, ...col1].map((testimonial, idx) => (
                <div className="testimonial-card" key={`c1-${idx}`}>
                  <p>{testimonial.quote}</p>
                  <div className="testimonial-person">
                    <img
                      src={testimonial.avatar}
                      alt={testimonial.name}
                      width="42"
                      height="42"
                      draggable={false}
                      loading="lazy"
                    />
                    <div>
                      <strong>{testimonial.name}</strong>
                      <span>{testimonial.role}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="testimonial-col col-up">
            <div className="testimonial-track">
              {[...col2, ...col2].map((testimonial, idx) => (
                <div className="testimonial-card" key={`c2-${idx}`}>
                  <p>{testimonial.quote}</p>
                  <div className="testimonial-person">
                    <img
                      src={testimonial.avatar}
                      alt={testimonial.name}
                      width="42"
                      height="42"
                      draggable={false}
                      loading="lazy"
                    />
                    <div>
                      <strong>{testimonial.name}</strong>
                      <span>{testimonial.role}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="testimonial-col col-down">
            <div className="testimonial-track">
              {[...col3, ...col3].map((testimonial, idx) => (
                <div className="testimonial-card" key={`c3-${idx}`}>
                  <p>{testimonial.quote}</p>
                  <div className="testimonial-person">
                    <img
                      src={testimonial.avatar}
                      alt={testimonial.name}
                      width="42"
                      height="42"
                      draggable={false}
                      loading="lazy"
                    />
                    <div>
                      <strong>{testimonial.name}</strong>
                      <span>{testimonial.role}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function BlogPreviewSection({ copy }) {
  const localizedArticles = articles.map((article, index) => ({
    ...article,
    ...copy.blog.items[index]
  }));
  return (
    <section className="section blog-section" id="blog">
      <div className="container">
        <div className="blog-heading">
          <div>
            <h2>{copy.blog.title}</h2>
          </div>
          <ButtonLink href="/#feature" variant="text" icon>
            {copy.blog.allPosts}
          </ButtonLink>
        </div>
        <StaggerGroup className="article-grid" amount={0.2} stagger={0.12}>
          {localizedArticles.map((article) => (
            <StaggerItem className="article-card" distance={58} key={article.title}>
              <a href={article.href}>
                <div className="article-image">
                  <img
                    src={article.image}
                    alt={article.alt}
                    width="3024"
                    height="1898"
                    draggable={false}
                    loading="lazy"
                  />
                </div>
                <h3>{article.title}</h3>
                <div>
                  <span>{article.author}</span>
                  <time>{article.date}</time>
                </div>
              </a>
            </StaggerItem>
          ))}
        </StaggerGroup>
      </div>
    </section>
  );
}

export function FAQSection({ copy }) {
  const [openIndex, setOpenIndex] = useState(-1);
  const reduceMotion = useReducedMotion();

  return (
    <section className="section faq-section" id="faq">
      <div className="container faq-layout">
        <Reveal className="faq-intro">
          <h2>{copy.faq.title}</h2>
          <p>{copy.faq.body}</p>
        </Reveal>
        <div className="faq-list">
          {copy.faq.items.map((faq, index) => {
            const open = openIndex === index;
            return (
              <div className={`faq-item ${open ? "open" : ""}`} key={faq.question}>
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={`faq-answer-${index}`}
                  onClick={() => setOpenIndex(open ? -1 : index)}
                >
                  <span>{faq.question}</span>
                  {open ? <Minus size={20} /> : <Plus size={20} />}
                </button>
                <AnimatePresence initial={false}>
                  {open ? (
                    <motion.div
                      id={`faq-answer-${index}`}
                      className="faq-answer"
                      initial={reduceMotion ? false : { height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
                      transition={{ duration: reduceMotion ? 0 : 0.28 }}
                    >
                      <p>{faq.answer}</p>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function FinalCTA({ copy, locale }) {
  return (
    <section className="final-cta">
      <div className="container">
        <div className="final-cta-card">
          <img
            src="/images/dot-background.png"
            className="final-cta-bg"
            alt=""
            draggable={false}
            aria-hidden="true"
          />
          <div className="final-cta-copy">
            <h2>{copy.finalCta.title}</h2>
            <p>{copy.finalCta.body}</p>
            <ButtonLink href={APP_LOGIN_URL}>{copy.finalCta.action}</ButtonLink>
          </div>
          <div className="final-cta-visual" aria-hidden="true">
            <div className="final-cta-dashboard-frame">
              <FinalCtaProductDemo locale={locale} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
