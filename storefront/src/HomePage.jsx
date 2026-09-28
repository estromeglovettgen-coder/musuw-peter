import { HeroScene } from "./components/HeroScene";
import {
  FAQSection,
  FeaturesSection,
  FinalCTA,
} from "./components/HomeSections";
import {
  MarketingComparisonSection,
  MarketingPricingSection,
  PlatformSection,
} from "./components/HomeRefreshSections";
import { SiteFooter, SiteHeader } from "./components/SiteChrome";
import { HomeResources } from "./components/HomeResources";
import { applyHomepagePlanPresentation } from "./planPresentation";
import {
  applyHomepageMarketingRefresh,
  MARKETING_FOOTER_GROUPS,
  MARKETING_NAVIGATION,
} from "./homepageMarketingRefresh";

export function HomePage({
  copy,
  locale,
  onLocaleChange,
  pricingCurrency,
  theme,
  onThemeToggle,
}) {
  const homepageCopy = applyHomepageMarketingRefresh(applyHomepagePlanPresentation(copy));
  const resolvedLocale = locale || (copy?.pricing?.currencyCode === "CNY" ? "zh-CN" : "en");

  return (
    <>
      <SiteHeader
        copy={homepageCopy}
        navigation={MARKETING_NAVIGATION}
        locale={resolvedLocale}
        onLocaleChange={onLocaleChange}
        theme={theme}
        onThemeToggle={onThemeToggle}
      />
      <main>
        <HeroScene copy={homepageCopy} locale={resolvedLocale} />
        <FeaturesSection copy={homepageCopy} locale={resolvedLocale} />
        <PlatformSection copy={homepageCopy} locale={resolvedLocale} />
        <MarketingPricingSection copy={homepageCopy} pricingCurrency={pricingCurrency} />
        <MarketingComparisonSection copy={homepageCopy} />
        <HomeResources locale={resolvedLocale} />
        <FAQSection copy={homepageCopy} />
        <FinalCTA copy={homepageCopy} locale={resolvedLocale} />
      </main>
      <SiteFooter copy={homepageCopy} groups={MARKETING_FOOTER_GROUPS} />
    </>
  );
}
