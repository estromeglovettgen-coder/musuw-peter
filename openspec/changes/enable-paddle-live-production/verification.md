# Verification Report: enable-paddle-live-production

All evidence below is sanitized. It records only public configuration classes,
counts, statuses, and behavior. No credential, signing secret, card data,
payout detail, private provider response, or Paddle resource identifier is
stored here.

## 2026-08-27 Live cutover

- Paddle Live inventory contains exactly three active SaaS products and six
  distinct active recurring prices: Plus, Pro, and Max in monthly and yearly
  periods. The authenticated production plan page rendered all six localized
  Live amounts through Paddle.js.
- The one active production notification destination uses `traffic_source=all`
  and exactly eleven events: nine subscription/transaction lifecycle events
  plus `adjustment.created` and `adjustment.updated`. No duplicate destination
  or replacement credential was created.
- The production public Paddle response is configured and reports `live`; its
  client token class, six catalog mappings, API key class, destination secret,
  default payment link, and runtime mode passed the shared atomic preflight.
- The existing Live API key and exact destination signing secret are mounted
  from root-owned, non-symlink, mode-`0600` files. The application container
  received non-empty read-only mounts. Values were never printed or copied to
  repository files.
- Retain setup validated `https://app.musuw.com/retain`, Paddle displayed
  `Retain is now live`, and the settings page now reports Paddle.js installed
  on that public recovery page. The authenticated `pwCustomer` path remains
  provider-state-derived; the current manually granted Plus smoke account has
  no Paddle customer binding and therefore cannot prove the optional in-app
  detector.

## Checkout and webhook acceptance

- The real Live `/plans` surface rendered monthly USD 5/10/20 and yearly USD
  49/99/199 for the six server-owned mappings. Public home, contact, Terms,
  Privacy, Refund, `/pay`, `/retain`, and the Live public-config endpoint all
  returned HTTP 200.
- Paddle's official Live API created one automatically collected draft
  transaction for the Plus monthly catalog item and returned the configured
  `/pay` URL. The production page automatically opened one official Paddle
  frame showing the plan, localized tax, amount due, customer fields, and
  Paddle merchant-of-record notice. No customer or payment field was changed,
  and no payment was confirmed. The draft was canceled immediately afterward;
  it had zero payments.
- Paddle's official no-charge adjustment simulation completed twice against the
  exact production destination. Both deliveries were `success` with HTTP 200;
  the replay request was accepted. Focused production logs contained twelve
  Paddle/webhook lines, zero focused errors, and zero panic/fatal lines.
- Signed fixture and worker/service tests cover invalid signatures, sub-five-
  second acknowledgement, durable retry, duplicate and reordered delivery,
  final tenant-marker idempotency, full approved refund/chargeback withdrawal,
  partial/pending/rejected no-op, and provider-read reversal. The Live
  simulation validates the real provider signature/destination seam without
  fabricating a production entitlement event.

## Release evidence

- Exact-revision CI, storefront delivery, and GitHub-hosted production delivery
  completed successfully. The production workflow used GitHub-hosted Ubuntu to
  build immutable app/frontend images, verify their registry digests, and SSH
  through the restricted Tokyo deploy gate.
- Tokyo app and frontend revision labels matched the selected full commit,
  required containers were healthy, and public `/health` returned HTTP 200.
  TikHub and Paddle protected mounts were present and non-empty after the same
  release without reading their values.
- Fresh frontend evidence is 681/681 tests plus Vue type-check. Focused Go race
  packages, production static/runtime contracts, workflow contracts, tracked
  secret scan, credential-registry validation, and strict OpenSpec validation
  are green.

## Explicit boundaries

- The consolidated adversarial review found no Musuw card field, payment-detail
  storage, local billing ledger, refund executor, dunning state machine, or
  duplicate catalog/destination. Initial checkout uses one Paddle automatic
  transaction created from the server's allow-listed item and signed custom
  data, then Paddle.js opens that provider transaction by `transactionId`. The
  only durable row is the existing tenant-scoped active-operation fence: it
  stores the provider transaction ID and immutable request coordinates solely to
  prevent duplicate tabs and safely reuse/release one unresolved attempt. Paddle
  remains authoritative for transaction/subscription lifecycle, payment data,
  tax, currency, payment methods, receipts, and portal behavior; the same fence
  also protects the paid-subscription update because Paddle's subscription
  update API has no general client idempotency key and the available Customer
  Portal has no Product Collections configuration.
- No real card, charge, refund, transfer, payout, or payout-account operation
  occurred. Paddle owns checkout, tax, currency conversion, payment methods,
  dunning, receipts, refunds, and recovery. Musuw only mints a signed checkout
  binding, validates signed events, and mirrors entitlement state.
- Payout/bank configuration remains intentionally untouched. The owner supplied
  and authorized the real buyer-support phone now published on both localized
  Contact pages. Retain DKIM/Return-Path DNS remains an owner-controlled
  deliverability follow-up and is not represented as complete.

## 2026-08-27 historical-binding diagnosis

- A real authenticated Plus-to-Pro attempt reproduced the generic checkout
  error. The Live public config and current entitlement endpoints both returned
  HTTP 200, while the server-owned subscription-upgrade preview returned HTTP
  503.
- Sanitized production evidence classified the provider lookup as not found,
  not authentication, permission, rate-limit, or timeout failure. The tenant
  has a pre-Live customer/subscription binding and an unexpired locally mirrored
  Plus entitlement; Live Paddle therefore cannot update that historical test
  subscription.
- The application correctly fails closed instead of creating a parallel Live
  subscription or treating the browser as entitlement authority. The safe
  resolution is an explicitly authorized cleanup of disposable pre-Live test
  account state, or a fresh Free account for the initial Live checkout. No
  tenant state was deleted or rewritten during this diagnosis.

## 2026-08-28 Japan localization correction

- Paddle Live's official JPY automatic currency conversion was enabled in
  place; the six existing recurring prices, destination, credentials, tax
  mode, payout settings, and China CNY overrides were not replaced.
- A fresh read-only Paddle preview for Japan returned JPY for all six prices.
  Monthly Plus/Pro/Max totals were JPY 798/1,595/3,190, and yearly totals were
  JPY 7,816/15,791/31,741. Paddle supplied both the tax decomposition and final
  formatted amounts; Musuw calculated neither exchange rates nor tax.
- A corresponding United States preview remained in USD, proving that enabling
  JPY did not replace the six prices' USD base currency. The plan comparison
  now renders Paddle's final formatted line-item total instead of exposing the
  pre-tax subtotal in tax-inclusive markets; Checkout still shows Paddle's
  subtotal, tax, and total separately.
- No payment details were entered and no charge, refund, transfer, payout, or
  payout-account operation occurred.

## 2026-08-28 WeChat Pay eligibility diagnosis

- The Live Dashboard payment-method switch is enabled, but Paddle currently
  supports WeChat Pay only for eligible one-time items and does not support it
  for subscriptions. Musuw's six active prices are all recurring, so Paddle
  correctly omits WeChat Pay from their China/CNY Checkout.
- Musuw passes only the server-mapped recurring price, signed tenant data,
  customer email, and locale to Paddle.js. It has no payment-method whitelist,
  country override, or currency override that could suppress WeChat Pay.
- No one-time catalog, manual-renewal entitlement path, or duplicate payment
  flow was added merely to expose WeChat Pay.

## 2026-08-29 onboarding progress and source-allowlist correction

- Paddle's authenticated progress response reports `live-setup=in_progress`
  with the sole missing signal `notificationDeliveryLogs`; verification and
  all five verification substeps are complete. The Live account still has the
  verified catalog, credentials, destination, default payment link, payment
  methods, approved domain, and saved payout settings.
- The exact Live destination has successful official `adjustment.created`
  simulation deliveries returning HTTP 200, including runs from the previous
  UTC date, while the normal Notifications log remains empty. Paddle therefore does
  not count simulation traffic as the platform-origin delivery signal. There
  is no manual completion control, and producing that signal would require a
  real Live platform event outside this change's no-customer/no-transaction/
  no-charge boundary. The first onboarding card is intentionally not reported
  as complete.
- A repository audit found the documented Paddle source-IP defense had not
  been implemented. The corrective delta now fetches the fixed environment's
  official `/ips` response during runtime preparation, rejects malformed,
  empty, duplicate, non-`/32`, or out-of-range IPv4 data, and atomically keeps
  the previous allowlist on refresh failure. Production and staging mount only
  that non-secret generated directory into the shared frontend image.
- The Nginx gate uses the Cloudflare-overwritten `CF-Connecting-IP` because the
  origin is reachable only through the Tunnel and loopback; using
  `$remote_addr` would incorrectly see the `cloudflared` container. Only the
  exact Paddle webhook path is gated, and application-level Paddle signature
  verification remains authoritative. Helper, production-static, staging-
  static, shell-syntax, and diff checks are green locally. Deployment and
  provider delivery after activation remain task 5.8.
