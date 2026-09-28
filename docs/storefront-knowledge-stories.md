# Storefront knowledge stories

## Approved scope

The marketing page has four independent stories: everyday legal information in the Hero, work prioritization in the chat demo, a researcher's evolving understanding in the Wiki, and literary reading connections in the Graph.

The H1, section order, alternating layout, global typography, colors, borders, shadows, navigation, pricing, and Hero background/entry animation remain unchanged. The walkthrough surfaces autoplay and are inert: visitors cannot click, focus, drag, or pause them. The existing final-CTA visual reuses the work-research context; it is not a fifth feature section.

## Fixtures and source ownership

`storefront/src/data/knowledgeStories.js` owns the bilingual scenario copy. `storefront/src/data/littlePrinceGraph.js` owns the compact bilingual reading outline and deterministically expands it into the graph renderer's data shape. `storefront/src/data/demoSources.js` owns citations, short excerpts or explicitly labelled paraphrases, source URLs, review dates, and simulated research records. Citation identifiers must resolve to this registry.

- The Hero asks about a wedding photographer using privately commissioned photographs in advertising. The Chinese fixture is explicitly scoped to mainland China (Copyright Law Article 19 and Civil Code Articles 1019/1021). The English fixture is explicitly a UK example (IPO guidance and CDPA sections 85/87). Selecting a UI language selects a scripted example, not the real visitor's jurisdiction. Neither example is individual legal advice or a worldwide legal rule.
- The work fixture is a simulated online learning product. Interviews, support cohorts and the first-exercise funnel support a recommendation to test the initial exercise path. They do not establish causation or describe musuw's usability.
- The research Wiki uses LongMemEval and LoCoMo as real published sources. Research interpretations and test plans are explicitly illustrative, not completed experiments.
- The Little Prince graph uses short original labels and reading interpretations, not a reproduction of the book. Chapter-based associations are not a definitive literary interpretation.

Public sources were checked on 2026-09-06. Review dates describe the fixture review, not a live retrieval or a promise of automatic legal updates. Do not fabricate source counts, customer statistics, independent evaluations, or performance claims when refreshing the copy.

## Graph contract

The Little Prince fixture covers all 27 chapters with three concise event notes per chapter, plus characters, places, themes, symbols, relationship bundles and chapter summaries. The compact outline expands to 337 nodes and 788 valid links without runtime randomness or hand-authored coordinates. IDs, category colors, edge order and counts remain stable in both locales; changing locale changes labels, not topology.

The storefront and product keep one mechanically aligned Obsidian renderer and Worker. Growth reuses Obsidian's file-plus-outgoing-link progression counter, neighbor/annulus seeding, force simulation, camera inertia, label fade, `focusNode`, and hover/selection dimming. The storefront only compresses wall time from 2× to 5× as density rises and choreographs the terminal focus. Its first 28 visible files are the book summary plus all chapter nodes; later low-cost nodes arrive faster while the camera pulls back and native labels fade. After completion, the camera focuses the Little Prince, native one-hop highlighting runs, and the real WeKnora-style detail drawer opens and remains visible.

The Graph scene keeps the product sidebar in its collapsed rail state and constrains the graph canvas to 78% of the available surface. Visitor controls stay disabled and the whole preview remains read-only.

## Wiki inspection contract

Use the real Wiki product surface rather than a handcrafted page, screenshot, or custom source popup. The viewport remains fixed at the product's real scale. The automatic sequence is readable page -> cursor moves to an inline Wiki link -> click feedback -> linked Wiki page. It stops on the destination page without looping. Reduced-motion mode goes directly to the linked page, and the surface remains inert in every mode.

## Validation

Run the existing storefront build/tests and Worker dry run:

```sh
npm ci --prefix storefront --ignore-scripts
npm --prefix storefront test
(cd storefront && npx wrangler deploy --dry-run --config wrangler.jsonc)
```

Browser acceptance uses the repository-locked Playwright dependency:

```sh
npm ci --ignore-scripts
npx playwright install --with-deps chromium
npx playwright test --config=storefront/playwright.config.mjs
```

The read-only `Storefront browser acceptance` workflow exercises Chinese/English, desktop/mobile, ordinary playback/reduced motion and inspectable source excerpts. It retains screenshots and failure traces. Its success does not replace canonical CI or the production release gate. This workflow has no deployment credentials and does not publish the site.

Production remains exclusively on the documented GitHub main/CI/Cloudflare delivery path. A committed branch, successful build, dry run, or screenshot artifact is not evidence of production deployment.
