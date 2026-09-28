import { useState } from "react";
import { ArrowsClockwise } from "@phosphor-icons/react/ArrowsClockwise";
import { Check } from "@phosphor-icons/react/Check";
import { FileText } from "@phosphor-icons/react/FileText";
import { Lightning } from "@phosphor-icons/react/Lightning";
import { Minus } from "@phosphor-icons/react/Minus";
import { PaperPlaneTilt } from "@phosphor-icons/react/PaperPlaneTilt";
import { ShareNetwork } from "@phosphor-icons/react/ShareNetwork";
import { Stack } from "@phosphor-icons/react/Stack";
import { comparisonGroups, currencySymbols, priceBooks, plans } from "../data/homeContent";
import { APP_LOGIN_URL, createProductLoginUrl } from "../productHandoff";
import { Reveal } from "./MotionPrimitives";
import { ButtonLink, SectionIntro } from "./SiteChrome";

const PLATFORM_ICONS = Object.freeze([
  FileText,
  Lightning,
  ShareNetwork,
  Stack,
  PaperPlaneTilt,
  ArrowsClockwise,
]);

const PUBLIC_COMPARISON_CAPABILITIES = Object.freeze([
  "Storage",
  "Knowledge bases",
  "Documents per knowledge base",
  "Video upload",
  "Multi-platform link import",
  "Advanced model access",
]);

function formatPlanAmount(symbol, amount) {
  return `${symbol}${amount.toLocaleString("en-US")}`;
}

function getPublicComparisonRows(copy) {
  const sourceRows = new Map(
    comparisonGroups
      .flatMap((group) => group.rows)
      .map(([sourceName, ...availability]) => [sourceName, availability]),
  );

  return PUBLIC_COMPARISON_CAPABILITIES.map((sourceName) => ({
    sourceName,
    name: copy.comparison.rows[sourceName] ?? sourceName,
    availability: sourceRows.get(sourceName) ?? [],
  }));
}

function comparisonValue(copy, value) {
  if (value === "No plan-specific cap") return copy.comparison.noPlanCap;
  return copy.comparison.valueLabels?.[value] ?? value;
}

export function PlatformSection({ copy }) {
  return (
    <section className="section benefits-section platform-section" id="platform">
      <div className="container">
        <Reveal>
          <SectionIntro
            title={copy.platform.intro.title}
            body={copy.platform.intro.body}
          />
        </Reveal>
        <div className="benefit-grid platform-grid">
          {copy.platform.cards.map(({ title, body }, index) => {
            const Icon = PLATFORM_ICONS[index];
            return (
              <Reveal
                className="benefit-item platform-card"
                data-platform-capability={index + 1}
                amount={0.5}
                delay={Math.min(index * 0.06, 0.18)}
                key={title}
              >
                <span>
                  <Icon size={23} weight="regular" aria-hidden="true" />
                </span>
                <h3>{title}</h3>
                <p>{body}</p>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function MarketingPricingSection({ copy, pricingCurrency }) {
  const [yearly, setYearly] = useState(false);
  const effectiveCurrency = pricingCurrency ?? copy.pricing.currencyCode;
  const priceBook = priceBooks[effectiveCurrency] ?? priceBooks[copy.pricing.currencyCode] ?? priceBooks.USD;
  const currencySymbol = currencySymbols[effectiveCurrency] ?? copy.pricing.currencySymbol;
  const localizedPlans = plans.map((plan, index) => ({
    ...plan,
    ...copy.pricing.plans[index],
    ...priceBook[index],
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
              <span className="billing-period-label">{copy.pricing.monthly}</span>
            </button>
            <button
              type="button"
              className={`billing-toggle-yearly ${yearly ? "active" : ""}`}
              aria-pressed={yearly}
              onClick={() => setYearly(true)}
            >
              <span className="billing-period-label">{copy.pricing.yearly}</span>
              <span className="billing-discount-badge">{copy.pricing.yearlyDiscount}</span>
            </button>
          </div>
        </div>
        <div className="pricing-grid">
          {localizedPlans.map((plan) => (
            <article className="pricing-card" data-plan={plan.key} key={plan.name}>
              <div className="pricing-card-content">
                <div className="plan-summary">
                  <div className="plan-heading">
                    <div className="plan-title-row">
                      <h3>{plan.name}</h3>
                      {plan.featured ? (
                        <span className="plan-recommended">{copy.pricing.recommended}</span>
                      ) : null}
                    </div>
                    <p className="plan-description">{plan.description}</p>
                  </div>
                  <div className="plan-price">
                    <strong>
                      {formatPlanAmount(
                        currencySymbol,
                        yearly ? plan.yearlyTotal : plan.monthly,
                      )}
                    </strong>
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
                  <ButtonLink className="pricing-button" href="/contact" variant="secondary">
                    {copy.pricing.unavailableAction}
                  </ButtonLink>
                ) : (
                  <ButtonLink
                    className="pricing-button"
                    href={createProductLoginUrl({
                      plan: plan.key,
                      billingPeriod: yearly ? "yearly" : "monthly",
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

export function MarketingComparisonSection({ copy }) {
  const rows = getPublicComparisonRows(copy);

  return (
    <section className="comparison-section" id="compare">
      <div className="container">
        <div className="comparison-refresh">
          <Reveal className="comparison-intro">
            {copy.comparison.eyebrow ? (
              <span className="comparison-eyebrow">{copy.comparison.eyebrow}</span>
            ) : null}
            <h2>{copy.comparison.title}</h2>
            {copy.comparison.description ? <p>{copy.comparison.description}</p> : null}
          </Reveal>
          <div className="comparison-panel" role="table" aria-label={copy.comparison.tableAria}>
            <div className="comparison-plan-header" role="row">
              <span aria-hidden="true" />
              {copy.comparison.plans.map((plan) => (
                <span
                  className="comparison-plan-chip"
                  data-featured={plan === "Pro" ? "true" : "false"}
                  role="columnheader"
                  key={plan}
                >
                  {plan}
                </span>
              ))}
            </div>
            <div className="comparison-feature-list" role="rowgroup">
              {rows.map(({ sourceName, name, availability }) => (
                <div className="comparison-feature-row" role="row" key={sourceName}>
                  <strong className="comparison-feature-name" role="rowheader">
                    {name}
                  </strong>
                  {availability.map((value, index) => {
                    const plan = copy.comparison.plans[index];
                    const featured = plan === "Pro";
                    return (
                      <span
                        className="comparison-feature-cell"
                        data-featured={featured ? "true" : "false"}
                        role="cell"
                        key={`${sourceName}-${plan}`}
                      >
                        <small className="comparison-mobile-plan">{plan}</small>
                        {typeof value === "string" ? (
                          <span className="comparison-value">
                            {comparisonValue(copy, value)}
                          </span>
                        ) : value ? (
                          <span className="comparison-included" aria-label={copy.comparison.included}>
                            <Check size={19} weight="bold" aria-hidden="true" />
                          </span>
                        ) : (
                          <span
                            className="comparison-not-included"
                            aria-label={copy.comparison.notIncluded}
                          >
                            <Minus size={16} aria-hidden="true" />
                          </span>
                        )}
                      </span>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
