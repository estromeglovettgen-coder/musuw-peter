export const LEGAL_OPERATOR = Object.freeze({
  englishName: "Hangzhou Didren Technology Co., Ltd.",
  chineseName: "杭州地底人科技有限公司",
  supportEmail: "support@didren.com",
  supportPhone: "+86 19176942082",
  productName: "musuw"
});

export const PUBLIC_DOCUMENT_PATHS = Object.freeze([
  "/terms",
  "/privacy",
  "/refund-policy",
  "/subscription-policy",
  "/acceptable-use",
  "/cookies",
  "/security",
  "/contact"
]);

const updated = "2026-08-27";
const billingPolicyUpdated = "2026-09-03";
const accountLifecycleUpdated = "2026-09-03";
const analyticsNoticeUpdated = "2026-09-24";
const operator = `${LEGAL_OPERATOR.englishName}（${LEGAL_OPERATOR.chineseName}）`;

const p = (text) => ({ type: "paragraph", text });
const list = (...items) => ({ type: "list", items });
const note = (text) => ({ type: "notice", text });
const contact = (label = LEGAL_OPERATOR.supportEmail) => ({
  type: "email",
  label,
  address: LEGAL_OPERATOR.supportEmail
});
const link = (label, href) => ({ type: "link", label, href });
const phone = (label) => link(label, `tel:${LEGAL_OPERATOR.supportPhone.replaceAll(" ", "")}`);
const PADDLE_LINKS = Object.freeze({
  buyerTerms: "https://www.paddle.com/legal/buyer-terms",
  refundPolicy: "https://www.paddle.com/legal/refund-policy",
  buyerSupport: "https://paddle.net/"
});

const englishDocuments = {
  "/terms": {
    path: "/terms",
    eyebrow: "Legal",
    title: "Terms of Service",
    summary:
      "These terms govern access to musuw, purchases, subscriptions, user content, and use of the product's source-grounded AI features.",
    updated: billingPolicyUpdated,
    sections: [
      {
        heading: "1. Who operates musuw",
        blocks: [
          p(`${LEGAL_OPERATOR.productName} is provided by ${operator}, referred to as “we”, “us”, or the “Operator” in these terms.`),
          p(`Questions about the service or these terms can be sent to ${LEGAL_OPERATOR.supportEmail}.`),
          contact()
        ]
      },
      {
        heading: "2. Acceptance and eligibility",
        blocks: [
          p("By creating an account, using musuw, or completing a purchase, you agree to these terms and the policies linked from them. A musuw Lite account is a personal account for one user, and its plan and limits apply only to that account."),
          p("You must be at least 16 to create or use a musuw account and legally able to enter into this agreement. If you are under the age of legal majority where you live, you also need valid consent from a parent or guardian where the law permits your use.")
        ]
      },
      {
        heading: "3. The service",
        blocks: [
          p("musuw is a personal knowledge service that preserves source materials, uploads and parses common formats, organizes connected Wiki pages with a graph view inside Wiki, and provides AI-assisted dialogue with exact evidence links, export, and deletion controls."),
          p("Features may evolve. We may improve, replace, or discontinue a feature when reasonably necessary for security, legal compliance, reliability, or product development. If a material change significantly reduces a paid feature, we will provide reasonable notice and any remedy required by law."),
          note("Available paid upgrades use Paddle's secure checkout. A URL or checkout return is not proof of payment; musuw grants a paid plan only after verifying Paddle's signed server notification.")
        ]
      },
      {
        heading: "4. Accounts and security",
        blocks: [
          list(
            "Provide accurate account and billing information and keep it current.",
            "Keep credentials confidential and use reasonable safeguards for your account.",
            "Notify us promptly if you suspect unauthorized access.",
            "Do not share an individual plan in a way that bypasses plan limits or access controls."
          ),
          p("You are responsible for activity performed through your account unless the activity results from our failure to use reasonable security measures.")
        ]
      },
      {
        heading: "5. Your content and permissions",
        blocks: [
          p("Your content includes notes, documents, prompts, saved answers, and AI output requested by you. You retain ownership of material you submit and, as between you and musuw, we do not claim ownership of requested AI output. Rights or restrictions in an output may still depend on applicable law and the selected model or provider terms. You grant us a limited, non-exclusive license to host, copy, process, transmit, and display that content only as needed to deliver the features you request, secure and support the service, troubleshoot failures, or comply with law."),
          p("musuw does not use content stored in your personal account to train general-purpose or foundation models unless you make a separate, express opt-in choice."),
          p("You confirm that you have the rights and permissions needed to upload and process your content. You must not upload content that unlawfully infringes intellectual property, privacy, confidentiality, or other rights."),
          p(`You can export content through the available product controls. To request account deletion, contact ${LEGAL_OPERATOR.supportEmail} or the published support channel. Authorized operations staff use a restricted internal deletion control; the workflow removes Musuw-controlled active product data subject to the retention boundary in the Privacy Policy.`)
        ]
      },
      {
        heading: "6. AI output and evidence",
        blocks: [
          p("AI output can be incomplete, inaccurate, or unsuitable for your circumstances. Evidence links and uncertainty indicators help you inspect an answer, but they do not make the output infallible."),
          p("You are responsible for reviewing important output before relying on it, publishing it, or using it to make decisions. musuw is not a substitute for legal, medical, financial, safety, or other regulated professional advice."),
          p("Do not use musuw to make solely automated decisions that produce legal or similarly significant effects on another person unless you independently satisfy all applicable notice, fairness, review, and legal requirements.")
        ]
      },
      {
        heading: "7. Plans, prices, and taxes",
        blocks: [
          p("The plan name, billing interval, price, included features, renewal status, and available payment methods are shown before checkout. Prices are shown in the stated currency. Applicable taxes, exchange effects, or payment-provider charges may be calculated or disclosed at checkout."),
          p("A recurring plan renews automatically until canceled. A one-time purchase does not renew. Details are in the Subscription and Cancellation Policy."),
          link("Read the Subscription and Cancellation Policy", "/subscription-policy")
        ]
      },
      {
        heading: "8. Seller and Merchant of Record",
        blocks: [
          p("Our order process is conducted by Paddle. The applicable Paddle entity shown at checkout or on the receipt acts as authorized reseller and Merchant of Record. Paddle handles purchase and transaction administration, buyer-support inquiries, and eligible refund requests. musuw provides product and technical support and works with Paddle on defect remediation and refund escalation under Paddle's current policy."),
          link("Read Paddle Buyer Terms", PADDLE_LINKS.buyerTerms),
          link("Paddle buyer support (paddle.net)", PADDLE_LINKS.buyerSupport),
          p("These provider terms apply to the purchase transaction. These musuw Terms govern your use of the product. If a mandatory consumer rule provides greater protection, that rule prevails.")
        ]
      },
      {
        heading: "9. Cancellation and refunds",
        blocks: [
          p("You can cancel a recurring plan through the management link in your receipt, Paddle's buyer portal, an in-product billing link when available, or by contacting us. Paddle records and confirms cancellation. A request received through a listed channel before renewal is treated as effective when applicable law requires, even if confirmation is delayed; keep the request evidence and contact us if that happens. Cancellation stops future renewals and takes effect at the end of the current paid period unless mandatory law provides otherwise."),
          p("musuw does not offer voluntary refunds. Transactions are final and non-refundable, subject to Paddle's current Refund Policy and mandatory consumer rights."),
          link("Read Musuw Refund Policy", "/refund-policy"),
          link("Read Paddle Refund Policy", PADDLE_LINKS.refundPolicy)
        ]
      },
      {
        heading: "10. Acceptable use",
        blocks: [
          p("You must comply with the Acceptable Use Policy. Prohibited conduct includes unlawful activity, abuse of others, rights infringement, credential theft, malicious code, unauthorized security testing, deceptive content, payment abuse, and attempts to bypass service limits."),
          link("Read the Acceptable Use Policy", "/acceptable-use")
        ]
      },
      {
        heading: "11. Our intellectual property",
        blocks: [
          p("musuw, its software, interfaces, branding, documentation, and service materials other than your content (including prompts and AI output requested by you) are owned by us or our licensors. These terms give you a limited, revocable, non-transferable right to use the service according to your plan. They do not transfer ownership of our intellectual property."),
          p("Feedback is voluntary. If you provide feedback, you allow us to use it without restriction or payment, but we will not identify you publicly without permission.")
        ]
      },
      {
        heading: "12. Suspension and termination",
        blocks: [
          p("You may stop using musuw at any time. We may restrict or suspend access when reasonably necessary to prevent harm, investigate a credible violation, comply with law, address nonpayment, or protect the service and its users."),
          p("Where practical and lawful, we will provide notice and an opportunity to cure. We may terminate immediately for serious abuse, fraud, security attacks, or unlawful conduct. On termination, provisions that by their nature should survive will remain effective, including payment obligations, intellectual property, disclaimers, liability limits, and dispute terms.")
        ]
      },
      {
        heading: "13. Warranties and liability",
        blocks: [
          p("We provide the service with reasonable care and skill. Except for warranties that cannot lawfully be excluded, musuw is provided on an “as available” basis and we do not promise uninterrupted operation or error-free AI output."),
          p("To the maximum extent permitted by law, neither party is liable for indirect, incidental, special, punitive, or consequential loss, or loss of profits, revenue, goodwill, or data, that was not reasonably foreseeable."),
          p("To the maximum extent permitted by law, our aggregate liability arising from the service is limited to the greater of USD 100 or the amount you paid for musuw during the 12 months before the event giving rise to the claim. This limit does not apply to the extent liability cannot legally be limited, including fraud, willful misconduct, death or personal injury caused by negligence, breaches of statutory data-protection or security obligations, or mandatory consumer rights.")
        ]
      },
      {
        heading: "14. Governing law and disputes",
        blocks: [
          p("These terms are governed by the laws of the People's Republic of China, without regard to conflict-of-law rules. Courts with jurisdiction at the Operator's domicile will have jurisdiction, unless mandatory law gives you the right to bring a claim elsewhere."),
          p(`Before filing a formal claim, please contact ${LEGAL_OPERATOR.supportEmail} so we can try to resolve the matter. Nothing in these terms restricts non-waivable consumer rights or your right to contact a regulator or consumer-protection authority.`)
        ]
      },
      {
        heading: "15. Changes and contact",
        blocks: [
          p("We may update these terms to reflect product, legal, security, or operational changes. We will post the effective date and provide additional notice for material changes when required. The version shown at checkout and in the receipt governs that purchase; later changes apply prospectively unless law requires otherwise."),
          contact()
        ]
      }
    ]
  },
  "/privacy": {
    path: "/privacy",
    eyebrow: "Privacy",
    title: "Privacy Policy",
    summary:
      "This policy explains what personal data musuw collects, why it is used, how long it is kept, who may process it, and the choices available to you.",
    updated: analyticsNoticeUpdated,
    sections: [
      {
        heading: "1. Operator and scope",
        blocks: [
          p(`${operator} determines how personal data is used to operate musuw. A provider that independently determines its own processing may have a separate role and notice. This policy covers the public website, accounts, product features, support, and related communications.`),
          p(`Privacy questions and rights requests can be sent to ${LEGAL_OPERATOR.supportEmail}.`),
          contact()
        ]
      },
      {
        heading: "2. Data we collect",
        blocks: [
          list(
            "Account and contact data, such as name, email address, account identifiers, language, and profile preferences.",
            "Knowledge content, such as documents, notes, prompts, saved answers, citations, topics, Wiki pages, graph links, and files you choose to upload.",
            "Usage and technical data, such as feature events, aggregate page-performance metrics, IP address, device and browser information, locale, timestamps, diagnostics, security events, and cookie or local-storage identifiers where used.",
            "Support and communication data, including messages, attachments, feedback, and records needed to resolve a request.",
            "Transaction data, such as plan, amount, currency, billing interval, transaction identifier, payment status, tax location, and limited receipt information received from the payment provider. We do not receive or store your full card number."
          )
        ]
      },
      {
        heading: "3. Sources of data",
        blocks: [
          p("We collect data directly from you, automatically from your device when you use the service, from connected services you authorize, and from payment, fraud-prevention, support, or infrastructure providers involved in delivering the service."),
          p("Cloudflare may provide a country code for storefront language selection. We use that code to select Chinese for visitors in mainland China and English elsewhere; we do not use it to infer a precise location."),
          p("Cloudflare processes request metadata at the public edge for delivery, TLS, abuse prevention, and country-level language selection. Cloudflare also provides cookie-free page-usage and performance analytics through a browser beacon."),
          p("When enabled, optional Google Analytics 4 (GA4) runs only on public storefront pages and only after you consent. It measures page visits and basic session activity using browser and device information and cookie identifiers. Page addresses are limited to approved public paths with query strings and fragments removed; referrers are limited to their source origin, without a path, query, or fragment. We do not send musuw account identifiers, email addresses, knowledge content, or conversations to GA4. Advertising features and Google signals are disabled.")
        ]
      },
      {
        heading: "4. Purposes and legal bases",
        blocks: [
          list(
            "Provide the service and requested features, under our contract with you.",
            "Process accounts, purchases, subscriptions, support, and service communications as needed to perform the contract, respond to your request, or comply with law.",
            "Secure, troubleshoot, prevent fraud and abuse, enforce policies, and maintain auditability as needed to perform the contract, comply with legal obligations, or protect users and the service.",
            "Comply with tax, accounting, sanctions, law-enforcement, and other legal requirements.",
            "Improve usability and reliability using aggregated, de-identified, or limited service data where applicable law permits it.",
            "Measure public storefront usage through optional GA4 only with your consent, which you can withdraw through Analytics preferences in the footer.",
            "Send optional marketing only when you requested it or gave any consent required by law. You can unsubscribe at any time."
          ),
          p("The available legal bases depend on where you live. They may include performing a contract, complying with legal obligations, your consent, and other grounds expressly permitted by applicable law. A legitimate-interest basis is used only in jurisdictions that recognize it and only after the required balancing; you may object where that right applies. You may withdraw consent at any time without affecting earlier lawful processing.")
        ]
      },
      {
        heading: "5. Knowledge content and AI processing",
        blocks: [
          p("musuw processes the source scope and prompts you select to retrieve evidence and generate requested output. For a requested AI feature, the minimum relevant prompts, retrieved excerpts, images, audio, or video may be sent through OpenRouter to the model and inference provider identified by the selected model. Embedding and reranking send the text needed to index or rank your sources."),
          p("OpenRouter states that it does not use API inputs or outputs for model training. A downstream model or inference provider may have different retention or training practices. The product identifies the selected model; review OpenRouter's current provider information before sending sensitive content and contact us if you need help identifying the route used for a request."),
          p("musuw does not use content stored in your personal account to train general-purpose or foundation models unless you separately and expressly opt in. This commitment describes musuw's own purpose; the current practices of OpenRouter and each downstream provider are separate and are described by their notices."),
          p("We do not sell content stored in your personal account or use it for cross-context behavioral advertising. We do not make solely automated decisions about you that produce legal or similarly significant effects."),
          p("The service is not designed to require sensitive personal data such as biometric, health, financial-account, precise-location, or children's data. Do not upload it unless the processing is specifically necessary and lawfully authorized. If musuw intentionally introduces a purpose that requires sensitive personal data, we will give the required specific notice and obtain separate consent where applicable before that processing. If you process data about another person, you are responsible for the required legal basis, notices, and rights handling.")
        ]
      },
      {
        heading: "6. Service providers and recipients",
        blocks: [
          p("We disclose personal data only as reasonably needed for the roles below. The current principal service providers and independent recipients are:"),
          p("Infrastructure and support providers generally process data for the service role described below under the applicable agreement. Paddle independently handles the purchase as Merchant of Record; Google handles the sign-in you choose; and OpenRouter, downstream model providers, and TikHub may have separate roles for their routed services. The exact legal role can vary by request and governing agreement, so their current notices also apply."),
          list(
            "Supabase, Inc. provides identity and one-time-code services and processes account email, profile claims, identity identifiers, and login/session data for that role.",
            "Resend, Inc. delivers transactional authentication email and processes the recipient address, authentication-message content and metadata, and delivery and security events for that role.",
            "Google LLC processes Google-account data when you choose Google sign-in. musuw requests only the openid, profile, and email scopes and receives the identifiers and profile fields that Google returns for them. Separately, when GA4 is enabled and you consent, Google processes the limited public storefront usage data described above to provide analytics.",
            "Cloudflare, Inc. provides DNS and edge delivery, transport security, abuse prevention, country-level language selection, and R2 object storage. It may process IP and request metadata, security signals, and uploaded source objects for those roles.",
            "Musuw's self-hosted SearXNG instance performs the product's web search and currently sends the search query from your request to Microsoft Bing, which returns public result titles, URLs, and snippets. The request does not include your musuw email or account identifier, but the query itself may reveal what you ask; Microsoft processes it under its own notice. The configured upstream search engine may change, and this notice will be updated when the production route changes.",
            "TikHub, LLC. resolves a supported public social-media URL when you choose the paid social-link import feature. Depending on the platform endpoint, musuw sends the normalized public share URL or share text, or the public post or video identifier; it does not send your musuw email or account identifier. TikHub returns public media and metadata and states that it may keep service logs and usage statistics and use service-related data for diagnostics, development, and correction.",
            "OpenRouter, Inc. routes prompts, relevant source excerpts, media, model requests, usage, and a stable pseudonymous user-attribution identifier to the selected model and inference provider. The identifier does not contain your email address and is used for request and usage attribution. Available models and providers can change; the product identifies the selected model, while the actual downstream inference route and provider practices may vary by model and request.",
            "Langfuse GmbH provides production AI observability and debugging in its Japan Cloud region. Bounded traces may include prompts or queries, retrieved or source previews, model responses, pseudonymous internal user, session, and request identifiers, endpoint and task metadata, model and tool identifiers, usage, latency, and error metadata needed to operate and troubleshoot requested AI features. Retention follows the current Langfuse project setting and applicable plan rather than a universal fixed period; contact us for the current setting or a rights request.",
            "Paddle entities act as the authorized reseller and Merchant of Record for paid musuw orders and process buyer contact, transaction, tax-location, payment, receipt, fraud-prevention, subscription, cancellation, and refund data under Paddle's buyer and privacy terms.",
            "Professional advisers, auditors, regulators, courts, and authorities when legally required or reasonably necessary to protect rights and safety.",
            "A successor in a merger, financing, reorganization, or sale, subject to appropriate confidentiality and notice requirements."
          ),
          p("We do not sell personal information for money. We do not share personal information for cross-context behavioral advertising."),
          link("Supabase Privacy Policy", "https://supabase.com/privacy"),
          link("Resend Privacy Policy", "https://resend.com/legal/privacy-policy"),
          link("Google Privacy Policy", "https://policies.google.com/privacy"),
          link("Cloudflare Privacy Policy", "https://www.cloudflare.com/privacypolicy/"),
          link("Microsoft Privacy Statement", "https://privacy.microsoft.com/en-us/privacystatement"),
          link("TikHub Privacy Policy", "https://docs.tikhub.io/5508543m0"),
          link("OpenRouter Privacy Policy", "https://openrouter.ai/privacy"),
          link("Langfuse Privacy Policy", "https://langfuse.com/privacy"),
          link("Langfuse Data Regions", "https://langfuse.com/security/data-regions"),
          link("Paddle Privacy Notice", "https://www.paddle.com/legal/privacy")
        ]
      },
      {
        heading: "7. International transfers",
        blocks: [
          p("musuw and its providers may process data outside the country where you live. The recipient list above identifies the current categories, but the exact downstream inference recipient can vary with the model and route selected for a request. You may contact us for request-specific recipient and safeguard information, subject to lawful confidentiality restrictions."),
          p("Where applicable law requires a transfer mechanism, a separate notice, or separate consent, musuw must complete that requirement before the affected transfer. This Privacy Policy itself is not separate consent.")
        ]
      },
      {
        heading: "8. Retention",
        blocks: [
          p("We retain account and knowledge content while your account is active or as needed to provide the service. After a verified deletion request or account closure, we delete or de-identify content from active systems without undue delay, subject to lawful retention, security investigations, disputes, and normal backup rotation."),
          p("When managed account closure is accepted, musuw immediately ends product access and begins removing active knowledge content. It schedules each cancellable Paddle subscription to stop future automatic renewals at the end of its current billing period. A past-due, temporarily unavailable, or otherwise non-cancelable provider state does not delay acceptance or the access fence. Once Paddle confirms that cancellation has been scheduled, musuw can complete deletion of the fenced account and billing-linkage record immediately; it does not wait for the current billing period to end. If Paddle reports every linked subscription as terminal or authoritatively not found, no cancellation is required. During any pending interval, the fenced identity and Paddle customer/subscription linkage are retained only to complete cancellation and erasure and are not presented as an active account. Account closure does not automatically refund a completed payment. Paddle is the Merchant of Record and may retain invoices, transaction records, and tax, accounting, fraud-prevention, chargeback, and dispute records for the periods required or permitted by applicable law and its provider terms. musuw retains only the minimum corresponding records needed for legal, accounting, fraud-prevention, security, dispute, cancellation, or erasure obligations, detaches or minimizes them where possible, and does not present them as active account data. These Paddle and musuw records follow their own retention periods; we do not promise immediate physical disappearance from Paddle or bounded backups."),
          p("Security logs and support records are retained only as long as reasonably needed for their purpose."),
          p("When data is no longer needed, we delete, de-identify, or securely isolate it. De-identified information may be retained where it cannot reasonably be linked back to you.")
        ]
      },
      {
        heading: "9. Your privacy rights",
        blocks: [
          p("Depending on where you live, you may have rights to be informed, access data, correct inaccurate data, delete data, restrict or object to processing, obtain portable data, withdraw consent, and appeal or complain to a data-protection authority."),
          p("Where applicable, you may request an explanation of a decision made using automated processing, object to a solely automated decision with a significant effect, and request human review."),
          p("Residents of California may also have rights to know, delete, correct, limit use of sensitive information where applicable, opt out of sale or sharing, and receive equal service. musuw does not sell or share personal information for cross-context behavioral advertising."),
          p(`To request account closure, email ${LEGAL_OPERATOR.supportEmail} with “Privacy request” or “Account deletion” in the subject, or use the published support channel. You may delete individual documents and knowledge bases with the product controls. We may request proportionate verification and may decline or limit a request only where law permits. Authorized agents must provide valid authority.`),
          p("Authorized operations staff use a restricted internal account-deletion control. The product does not expose a self-service account-deletion action in user settings."),
          p("We will respond within the period required by applicable law. You may appeal a denied request by replying with “Privacy appeal” in the subject line. You may also complain to your local supervisory or consumer-protection authority.")
        ]
      },
      {
        heading: "10. Security",
        blocks: [
          p("We use technical and organizational safeguards designed to protect personal data, including scoped access, server-side handling of service credentials, transport encryption, logging, exact evidence links, and data lifecycle controls where supported."),
          p("No system is completely secure. Protect your Google account and email inbox with multi-factor authentication and current recovery channels, protect your device, and report suspected unauthorized access promptly."),
          link("Read our Security Overview", "/security")
        ]
      },
      {
        heading: "11. Cookies and similar technology",
        blocks: [
          p("Cloudflare provides cookie-free page-usage and performance analytics and processes edge request and security metadata as described above. We do not use advertising cookies or cross-site behavioral tracking. Essential browser storage is used for language, authentication, security, checkout-return state, and your analytics choice. When enabled, optional GA4 uses analytics cookies only after consent. External identity and checkout providers may use their own necessary technology under their notices."),
          link("Read the Cookie Notice", "/cookies")
        ]
      },
      {
        heading: "12. Children",
        blocks: [
          p("A musuw account user must be at least 16. The service is not directed to children and we do not knowingly collect their personal data. If you believe a child submitted personal data, contact us so we can investigate, disable the account, and delete the data where required.")
        ]
      },
      {
        heading: "13. Changes and contact",
        blocks: [
          p("We may update this policy when our product, providers, or legal obligations change. We will post the new effective date and give additional notice when required for a material change."),
          contact()
        ]
      }
    ]
  },
  "/refund-policy": {
    path: "/refund-policy",
    eyebrow: "Purchases",
    title: "Refund Policy",
    summary:
      "Statutory withdrawal and mandatory consumer rights apply first. Outside those rights and Paddle's current Refund Policy, musuw does not offer voluntary refunds and completed transactions are final and non-refundable.",
    updated: billingPolicyUpdated,
    sections: [
      {
        heading: "1. Verified paid orders",
        blocks: [
          note("This policy applies to a completed Paddle transaction that musuw has received through a verified signed notification. A browser checkout return alone does not establish a paid order."),
          p("The Paddle receipt and musuw billing page identify the transaction and current billing status used for support and refund review.")
        ]
      },
      {
        heading: "2. Statutory withdrawal rights",
        blocks: [
          p("Paddle's current Refund Policy says buyers in China, South Korea, and Brazil have an unconditional right to cancel eligible digital content or services after delivery when the request is made within 7 days of the transaction."),
          p("It also describes a 14-day withdrawal period for eligible buyers in the EU, EEA, Switzerland, and the UK for a one-time purchase or the first subscription payment, including a new period after a free trial ends; the current policy also describes an additional UK right for an annual subscription renewal."),
          p("As of this policy's effective date, Paddle also lists current regional withdrawal periods for eligible buyers in Turkey and Israel (14 days), Canada (7 days), and Singapore (5 days). These examples are not an exhaustive substitute for Paddle's current policy or stronger local law."),
          p("For eligible digital content, a withdrawal right may be lost only after the buyer gives express consent to begin using it during the withdrawal period and acknowledges the resulting loss of that right. Paddle's current Refund Policy and any stronger non-waivable local law control the exact eligibility and timing."),
          link("Read Paddle Refund Policy", PADDLE_LINKS.refundPolicy)
        ]
      },
      {
        heading: "3. No voluntary refunds",
        blocks: [
          p("We do not offer voluntary or routine refunds. Completed transactions are final and non-refundable except where required by applicable law or allowed under Paddle's current Refund Policy."),
          p("Paddle may approve refunds at its discretion and may decline requests involving fraud, refund abuse, or other manipulative behavior. Mandatory consumer rights remain unaffected."),
          link("Read Paddle Refund Policy", PADDLE_LINKS.refundPolicy)
        ]
      },
      {
        heading: "4. How to request a refund",
        blocks: [
          list(
            "Use the refund or buyer-support link in your payment receipt.",
            "Use the applicable payment provider's customer or transaction portal.",
            `Email ${LEGAL_OPERATOR.supportEmail} with the account email, transaction identifier, purchase date, and a short description of the request.`
          ),
          p("Paddle and musuw use the receipt and transaction details to verify the request. Do not send full card numbers, passwords, government identifiers, or other unnecessary sensitive information."),
          contact()
        ]
      },
      {
        heading: "5. Who processes the refund",
        blocks: [
          p("Paddle processes eligible refunds to the original payment method where possible. Follow the Paddle receipt, Customer Portal, or buyer-support process."),
          p("We will cooperate with Paddle, the Merchant of Record, to process any refund required or approved under the applicable policy. Transaction verification, payment-network timing, currency conversion, and provider buyer terms may affect how the refund appears."),
          link("Paddle buyer support (paddle.net)", PADDLE_LINKS.buyerSupport)
        ]
      },
      {
        heading: "6. Timing and access",
        blocks: [
          p("Paddle's current Refund Policy says an eligible refund is processed to the original payment method where possible within 14 days after approval. Your bank or payment network may need additional time to display the credit; the current Paddle policy controls."),
          p("When a full refund is issued, access to the refunded paid entitlement may end immediately. Before requesting deletion, export any material you are entitled to keep.")
        ]
      },
      {
        heading: "7. Defects, misdescription, and mandatory rights",
        blocks: [
          p("If musuw is materially defective, not as described, or not supplied with legally required care, contact us through the support channels above. Remedies required by applicable law remain available."),
          p("Nothing in this policy excludes or limits mandatory consumer rights, statutory withdrawal rights, or a payment provider's buyer protections. Where different terms apply, the highest non-waivable level of protection controls.")
        ]
      },
      {
        heading: "8. Cancellations are separate",
        blocks: [
          p("Canceling a subscription stops future renewals but does not by itself refund an existing charge. Request a refund separately under this policy."),
          link("Read the Subscription and Cancellation Policy", "/subscription-policy")
        ]
      }
    ]
  },
  "/subscription-policy": {
    path: "/subscription-policy",
    eyebrow: "Billing",
    title: "Subscription and Cancellation Policy",
    summary:
      "This policy explains automatic renewal, billing intervals, cancellation methods, plan changes, and the difference between subscriptions and one-time purchases.",
    updated: accountLifecycleUpdated,
    sections: [
      {
        heading: "1. What you buy",
        blocks: [
          p("Before checkout, musuw shows whether an offer is a recurring subscription or a one-time purchase, the plan, price, currency, billing interval, and included features."),
          p("A one-time purchase does not automatically renew. A recurring subscription automatically renews at the selected monthly or annual interval until canceled.")
        ]
      },
      {
        heading: "2. Charges and taxes",
        blocks: [
          p("For a recurring plan, the Merchant of Record charges the payment method on file at the start of each new billing period. Applicable taxes and any supported local-currency amount are calculated or disclosed at checkout."),
          p("If a charge fails, the payment provider may retry it and may notify you. Access may be limited after reasonable notice if payment remains overdue.")
        ]
      },
      {
        heading: "3. How to cancel",
        blocks: [
          list(
            "Open the manage-subscription link in your receipt.",
            "Use the Paddle Customer Portal for the order.",
            "Use an in-product billing link when production account billing is available.",
            `Email ${LEGAL_OPERATOR.supportEmail} from your account email and include the transaction identifier.`
          ),
          p("Paddle records and confirms cancellation. A request received through a listed channel before renewal is treated as effective when applicable law requires, even if confirmation is delayed; keep the request evidence and contact us if that happens. Cancellation stops future renewals and takes effect at the end of the current billing period, subject to mandatory law."),
          link("Paddle buyer support (paddle.net)", PADDLE_LINKS.buyerSupport),
          contact()
        ]
      },
      {
        heading: "4. Effect of cancellation",
        blocks: [
          p("Cancellation stops future automatic renewals. Unless a refund or mandatory law provides otherwise, paid access continues until the end of the current billing period and no further subscription charge is made."),
          p("Deleting the application, not using the service, or removing a payment app does not cancel a subscription. An accepted managed account closure schedules cancellable subscriptions to stop future automatic renewals at period end, ends musuw access immediately, and does not automatically refund a completed payment.")
        ]
      },
      {
        heading: "5. Plan and price changes",
        blocks: [
          p("An upgrade may take effect immediately and may create a prorated charge or credit disclosed before confirmation. A downgrade normally takes effect at the next renewal unless stated otherwise."),
          p("If the price changes, Paddle or musuw will notify you and obtain consent before charging the new price where required by law. You may cancel before the new price takes effect.")
        ]
      },
      {
        heading: "6. Renewal notices and receipts",
        blocks: [
          p("The Merchant of Record sends a receipt for each paid order. For consumers in China, applicable platform-pricing rules require notice before each recurring charge that states the charge time, amount, cancellation method, and any price change. In other jurisdictions and subscription intervals for which law requires an advance renewal reminder, Paddle or musuw will send the legally required notice before renewal. Where no such rule applies, not every interval necessarily receives a separate reminder, so keep the account and receipt email current; you may cancel at any time before renewal through the methods above.")
        ]
      },
      {
        heading: "7. Refunds and mandatory rights",
        blocks: [
          p("Cancellation and refunds are different. A cancellation prevents future renewals. musuw does not offer voluntary or routine refunds; completed transactions are final and non-refundable except where required by law or approved under Paddle's current Refund Policy."),
          link("Read the Refund Policy", "/refund-policy"),
          p("Nothing in this policy limits mandatory consumer rights.")
        ]
      }
    ]
  },
  "/acceptable-use": {
    path: "/acceptable-use",
    eyebrow: "Trust",
    title: "Acceptable Use Policy",
    summary:
      "This policy protects musuw users, infrastructure, and third parties by defining prohibited content, conduct, automated use, and security abuse.",
    updated,
    sections: [
      {
        heading: "1. General rule",
        blocks: [
          p("Use musuw lawfully, responsibly, and only with content and systems you are authorized to access. You are responsible for your content, prompts, configured integrations, and use of output.")
        ]
      },
      {
        heading: "2. Illegal and harmful activity",
        blocks: [
          p("Do not use musuw to facilitate unlawful conduct, violence, exploitation, trafficking, terrorism, evasion of sanctions, regulated weapons, or instructions intended to cause physical or material harm."),
          p("Do not threaten, harass, stalk, discriminate against, exploit, or dox another person, or create or distribute non-consensual intimate content.")
        ]
      },
      {
        heading: "3. Rights and privacy",
        blocks: [
          p("Do not upload or process material that you lack the right to use. Do not infringe intellectual property, privacy, publicity, confidentiality, contractual, database, or other rights."),
          p("URL imports are for private knowledge indexing of content you own or are authorized to use; they are not a streaming downloader or content redistribution service."),
          p("Supported social-link imports use an unaffiliated third-party data API. You remain responsible for the source platform's terms and for having permission to retrieve and process the public post or media."),
          p("Video uploads are for private knowledge analysis of content you own or are authorized to use; musuw is not a public video hosting, streaming, downloading, or redistribution service."),
          p("Do not collect credentials, sensitive data, or personal data deceptively, or use musuw for unlawful surveillance or identification.")
        ]
      },
      {
        heading: "4. Security and platform abuse",
        blocks: [
          list(
            "No malware, ransomware, destructive code, credential theft, phishing, or fraud.",
            "No unauthorized vulnerability scanning, penetration testing, access, interception, or disruption.",
            "No bypassing authentication, workspace isolation, quotas, payment controls, rate limits, or safety mechanisms.",
            "No scraping or automated traffic that materially degrades the service or violates published limits.",
            "No reverse engineering except to the limited extent a non-waivable law expressly permits it."
          )
        ]
      },
      {
        heading: "5. Deception and high-impact decisions",
        blocks: [
          p("Do not impersonate another person, fabricate provenance, misrepresent AI output as verified fact, or use the service for spam, scams, fake engagement, or payment abuse."),
          p("Do not rely on musuw as the sole basis for decisions about employment, credit, housing, education, insurance, healthcare, legal rights, or access to essential services unless you independently meet all applicable requirements for qualified human review, notice, fairness, explanation, and appeal.")
        ]
      },
      {
        heading: "6. Sensitive and regulated use",
        blocks: [
          p("musuw is a general knowledge tool, not a regulated professional service. You may not use it to provide unlawful medical, legal, financial, credit, gambling, or other regulated services, or to evade licensing and compliance obligations.")
        ]
      },
      {
        heading: "7. Enforcement",
        blocks: [
          p("We may investigate credible reports and proportionately restrict content, integrations, or accounts to prevent harm. Serious or repeated violations may lead to suspension or termination. We may preserve and disclose information where law requires it."),
          p("Where appropriate, we will consider context, severity, recurrence, user intent, and available remediation. We may provide notice and an opportunity to appeal unless doing so would create risk or violate law.")
        ]
      },
      {
        heading: "8. Report abuse",
        blocks: [
          p(`Report suspected abuse to ${LEGAL_OPERATOR.supportEmail} with enough detail to locate the issue. Do not include unnecessary sensitive data.`),
          contact()
        ]
      }
    ]
  },
  "/cookies": {
    path: "/cookies",
    eyebrow: "Privacy",
    title: "Cookie Notice",
    summary:
      "This notice explains browser storage used by the musuw storefront and product, including essential preferences, optional analytics, security, and external checkout technology.",
    updated: analyticsNoticeUpdated,
    sections: [
      {
        heading: "1. Current storefront practice",
        blocks: [
          p("Cloudflare provides cookie-free page-usage and performance analytics through a browser beacon. It also processes edge request and security metadata to deliver and protect the site, and supplies a country code used only for language selection."),
          p("The storefront does not set advertising cookies or use cross-site behavioral tracking. It stores the selected language in the essential musuw_locale cookie for up to one year and does not store a precise location."),
          p("When enabled, optional Google Analytics 4 (GA4) runs only on public storefront pages after you accept analytics. Before consent, or if you reject it, we do not load Google's analytics script. No GA4 measurement runs when the site's measurement ID is unconfigured. Rejecting analytics does not prevent you from using the site."),
          p("After consent, GA4 may set _ga cookies to distinguish browsers and sessions and collect page visits and basic session events. We limit page addresses to approved public paths, remove query strings and fragments, and send only the source origin as the referrer. We do not send musuw account identifiers, emails, knowledge content, or conversations. Advertising features and Google signals are disabled."),
          link("Google Privacy Policy", "https://policies.google.com/privacy"),
          link("Cloudflare RUM beacon information", "https://developers.cloudflare.com/speed/observatory/rum-beacon/")
        ]
      },
      {
        heading: "2. Essential storage",
        blocks: [
          p("musuw may use cookies, local storage, or similar browser features that are necessary to keep you signed in, protect sessions, remember language or accessibility preferences, preserve checkout return state, prevent abuse, and provide requested features."),
          p("We remember your analytics choice in local storage as musuw_analytics_consent_v1 until you change it or clear site data. This preference does not identify your musuw account; if storage is unavailable, the choice applies only to the current tab."),
          p("Essential storage cannot always be disabled through a consent control because the requested account or security function may not work without it. You can clear it using browser settings.")
        ]
      },
      {
        heading: "3. Payment-provider technology",
        blocks: [
          p("When you open Paddle Checkout, Paddle may use its own necessary cookies or similar technology for fraud prevention, payment processing, tax determination, localization, and buyer support. Paddle's notice applies on its domain.")
        ]
      },
      {
        heading: "4. Managing browser storage",
        blocks: [
          p("When optional analytics is enabled, open Analytics preferences in the footer to manage your analytics preference at any time. Withdrawing consent stops analytics, clears the site's accessible _ga cookies, and reloads the page once if Google's script was already loaded. Withdrawal does not delete data already sent to Google; contact us for a data-rights request."),
          p("Most browsers let you inspect, block, or delete cookies and site data. Blocking essential storage may prevent sign-in, checkout, saved preferences, or other requested functions."),
          p("A browser's “Do Not Track” signal is not a uniform legal standard. We do not use the public storefront for cross-site behavioral advertising regardless of that signal.")
        ]
      },
      {
        heading: "5. Changes",
        blocks: [
          p("We will revise this notice if the categories, purposes, or providers of browser storage materially change. The effective date above identifies the current version.")
        ]
      },
      {
        heading: "6. Contact",
        blocks: [contact()]
      }
    ]
  },
  "/security": {
    path: "/security",
    eyebrow: "Trust",
    title: "Security Overview",
    summary:
      "musuw is designed around scoped knowledge access, preserved evidence, exact citations, server-side credentials, and visible data lifecycle controls.",
    updated,
    sections: [
      {
        heading: "1. Security approach",
        blocks: [
          p("We apply layered technical and organizational measures appropriate to the service and the sensitivity of knowledge content. Security is an ongoing risk-management process, not a guarantee that incidents can never occur."),
          p("The hosted product is delivered over HTTPS through scoped edge and server boundaries, and application releases use immutable image revisions. This page describes current product controls; it does not claim an external certification or independent assurance that has not been completed.")
        ]
      },
      {
        heading: "2. Account and retrieval scope",
        blocks: [
          p("Knowledge retrieval is bounded to the authenticated personal account and to the topics, sources, and versions authorized for a conversation. Access-control checks are applied at service boundaries rather than relying only on interface visibility."),
          p("Keep your personal account private and grant connected services only the minimum permissions needed.")
        ]
      },
      {
        heading: "3. Credentials and transport",
        blocks: [
          p("Service credentials and model-provider keys are handled server-side and are not intentionally exposed to the browser. Production traffic is served over HTTPS, and sensitive secrets are separated from public frontend code."),
          p("Payment credentials are entered on the Merchant of Record's checkout. musuw does not receive or store full payment card numbers.")
        ]
      },
      {
        heading: "4. Evidence and source integrity",
        blocks: [
          p("musuw preserves raw source materials and version references so an answer can resolve the evidence used at the time. Uploaded material can be parsed into Wiki pages and a graph view inside Wiki while answers point back to exact evidence without rewriting prior source history."),
          p("These controls improve auditability but do not replace user review of important AI output.")
        ]
      },
      {
        heading: "5. Data lifecycle",
        blocks: [
          p(`You can delete individual documents and knowledge bases through product controls. Where a data type has an export action, you can use it directly. To request full account deletion, contact ${LEGAL_OPERATOR.supportEmail} or the published support channel. Authorized operations staff submit the restricted deletion workflow; legal retention, fraud-prevention, dispute records, security logs, and backup rotation may delay complete removal as described in the Privacy Policy.`),
          link("Read the Privacy Policy", "/privacy")
        ]
      },
      {
        heading: "6. Operations and incident response",
        blocks: [
          p("We use logging, dependency review, access restriction, change verification, backups where appropriate, and incident procedures to detect, investigate, contain, and recover from security events."),
          p("If an incident is likely to create a material risk to affected people, we will provide notices required by applicable law and share practical protective steps.")
        ]
      },
      {
        heading: "7. Your responsibilities",
        blocks: [
          list(
            "Protect your Google account and email inbox with multi-factor authentication and keep their recovery channels current.",
            "Keep devices, browsers, and integrations updated.",
            "Use the narrowest appropriate knowledge and integration scope.",
            "Review important output and evidence before relying on it.",
            "Report suspected unauthorized access promptly."
          )
        ]
      },
      {
        heading: "8. Responsible disclosure",
        blocks: [
          p(`Send a suspected vulnerability to ${LEGAL_OPERATOR.supportEmail} with the subject “Security report”. Include reproducible details and avoid accessing, changing, or retaining data that is not yours.`),
          p("We do not currently operate a public bug-bounty program. Acknowledgment, eligibility, and any reward require a separate written agreement. Good-faith research must comply with law and the Acceptable Use Policy."),
          contact("Report a security issue")
        ]
      }
    ]
  },
  "/contact": {
    path: "/contact",
    eyebrow: "Support",
    title: "Contact musuw",
    summary:
      "Contact the musuw team for product help, billing and cancellation support, privacy requests, security reports, or merchant-review questions.",
    updated,
    sections: [
      {
        heading: "Operator",
        blocks: [
          p(`${LEGAL_OPERATOR.englishName}`),
          p(`${LEGAL_OPERATOR.chineseName}`),
          p("musuw is the product name used on this website.")
        ]
      },
      {
        heading: "Customer support",
        blocks: [
          p(`Email ${LEGAL_OPERATOR.supportEmail} or call ${LEGAL_OPERATOR.supportPhone}. Include the product, account, and transaction context needed to help; do not send passwords or full card numbers.`),
          contact("Email customer support"),
          phone(`Call ${LEGAL_OPERATOR.supportPhone}`)
        ]
      },
      {
        heading: "Billing, refunds, and cancellation",
        blocks: [
          p("For the fastest transaction support, use the manage-order link in your Paddle receipt or Customer Portal. You can also email us with the account email and transaction identifier. Never send a full card number or password."),
          link("Refund Policy", "/refund-policy"),
          link("Subscription and Cancellation Policy", "/subscription-policy"),
          link("Paddle buyer support (paddle.net)", PADDLE_LINKS.buyerSupport)
        ]
      },
      {
        heading: "Privacy and security",
        blocks: [
          p("Use the subject “Privacy request” to exercise a data right. Use “Security report” for a suspected vulnerability or unauthorized access. Include only the information needed to investigate."),
          link("Privacy Policy", "/privacy"),
          link("Security Overview", "/security")
        ]
      },
      {
        heading: "Merchant and review inquiries",
        blocks: [
          p("For Paddle, tax, domain-verification, or business-identification questions, include the relevant store, case, or transaction identifier. We do not publish private verification documents on this website."),
          contact("Email the operator")
        ]
      }
    ]
  }
};

const chineseDocuments = {
  "/terms": {
    path: "/terms",
    eyebrow: "法律条款",
    title: "服务条款",
    summary: "本条款适用于 musuw 的访问、购买、订阅、用户内容，以及具有来源依据和可核查证据的 AI 功能。",
    updated: billingPolicyUpdated,
    sections: [
      {
        heading: "1. 运营主体",
        blocks: [
          p(`musuw 由 ${operator} 提供，本条款中的“我们”“本公司”或“运营方”均指该公司。`),
          p(`服务或条款问题可发送至 ${LEGAL_OPERATOR.supportEmail}。`),
          contact("联系支持")
        ]
      },
      {
        heading: "2. 接受条款与使用资格",
        blocks: [
          p("创建账户、使用 musuw 或完成购买，即表示您同意本条款及其中链接的政策。musuw Lite 是一人使用的个人账户，套餐与额度仅适用于该账户。"),
          p("您必须年满 16 周岁且具有订立本协议的法律能力，才能创建或使用 musuw 账户。若您在所在地未达到法定成年年龄，还须在法律允许使用的前提下取得父母或监护人的有效同意。")
        ]
      },
      {
        heading: "3. 服务内容与当前状态",
        blocks: [
          p("musuw 是个人知识服务，用于保留原始资料、上传并解析常见格式、组织相互连接的 Wiki 页面及其中的图谱视图，并通过精确证据链接、导出和删除控制提供 AI 辅助对话。"),
          p("功能会持续演进。为安全、合规、可靠性或产品发展之合理需要，我们可以改进、替换或停止某项功能。若重大变化显著减少已付费功能，我们将提供合理通知及法律要求的救济。"),
          note("可用付费升级使用 Paddle 安全结账。网址参数或结账返回不代表付款成功；仅在 musuw 服务器验证 Paddle 签名通知后，产品才授予付费方案。")
        ]
      },
      {
        heading: "4. 账户与安全",
        blocks: [
          list(
            "提供准确并保持最新的账户和账单信息。",
            "妥善保管凭据并为账户采取合理安全措施。",
            "发现疑似未授权访问时及时通知我们。",
            "不得通过共享个人套餐规避套餐限制或访问控制。"
          ),
          p("除因我们未采取合理安全措施导致的活动外，您应对通过本人账户进行的活动负责。")
        ]
      },
      {
        heading: "5. 您的内容与授权",
        blocks: [
          p("您的内容包括笔记、文档、提示词、已保存答案及您请求生成的 AI 输出。您保留对提交材料的权利；就您与 musuw 之间而言，我们不主张您请求生成的 AI 输出的所有权。某项输出的权利或限制仍可能取决于适用法律及所选模型或服务商条款。您授予我们有限、非独占的许可，仅为交付您请求的功能、保护和支持服务、排查故障或履行法律义务之需要，对这些内容进行托管、复制、处理、传输和展示。"),
          p("除非您另行明确选择加入，musuw 不会使用您个人账户中存储的内容训练通用模型或基础模型。"),
          p("您确认有权上传和处理相关内容。不得上传非法侵犯知识产权、隐私权、保密义务或其他权利的材料。"),
          p(`您可通过产品控制导出内容。如需注销账户，请联系 ${LEGAL_OPERATOR.supportEmail} 或已公布的客服渠道。获授权的运营人员通过受限内部功能提交注销，流程会移除 Musuw 控制的活动产品数据，但受隐私政策所述留存边界约束。`)
        ]
      },
      {
        heading: "6. AI 输出与证据",
        blocks: [
          p("AI 输出可能不完整、不准确或不适合您的具体情况。证据链接和不确定性提示可帮助核查，但不能保证输出绝对正确。"),
          p("在依赖、发布或用于决策前，您应审查重要输出。musuw 不能替代法律、医疗、财务、安全或其他受监管的专业意见。"),
          p("除非您已独立满足适用的告知、公平、人工复核和法律要求，否则不得仅依赖 musuw 对他人作出具有法律或类似重大影响的自动化决定。")
        ]
      },
      {
        heading: "7. 套餐、价格与税费",
        blocks: [
          p("结账前会显示套餐名称、计费周期、价格、所含功能、是否续费和可用付款方式。价格以页面标示币种为准；适用税费、汇率影响或支付服务商费用可能在结账时计算或披露。"),
          p("循环订阅会自动续费，直至取消；单次购买不会续费。详情见订阅与取消政策。"),
          link("查看订阅与取消政策", "/subscription-policy")
        ]
      },
      {
        heading: "8. 卖方与商户记录方",
        blocks: [
          p("订单流程由 Paddle 处理。结账页或收据上列明的相应 Paddle 实体作为授权经销商和商户记录方。Paddle 处理购买与交易管理、买家支持咨询及符合条件的退款申请。musuw 提供产品和技术支持，并依 Paddle 当前政策配合处理缺陷补救与退款升级。"),
          link("查看 Paddle 买家条款", PADDLE_LINKS.buyerTerms),
          link("Paddle 买家支持（paddle.net）", PADDLE_LINKS.buyerSupport),
          p("付款服务商条款适用于购买交易，本 musuw 条款适用于产品使用。若强制性消费者规则提供更高保护，以该规则为准。")
        ]
      },
      {
        heading: "9. 取消与退款",
        blocks: [
          p("您可通过收据中的管理链接、Paddle 买家门户、可用时的产品内账单入口或联系我们取消循环订阅。Paddle 会记录并确认取消；如适用法律要求，在续费前通过上述列明渠道提出的请求，不因确认延迟而失效。请保留请求证据并在发生延迟时联系我们。取消会停止未来续费，并在当前已付费周期结束时生效，除非强制性法律另有规定。"),
          p("musuw 不提供自愿退款。交易均为最终交易且不予退款，但以 Paddle 当前《退款政策》和强制性消费者权利适用的情形为准。"),
          link("查看 musuw 退款政策", "/refund-policy"),
          link("查看 Paddle 退款政策", PADDLE_LINKS.refundPolicy)
        ]
      },
      {
        heading: "10. 可接受使用",
        blocks: [
          p("您须遵守可接受使用政策。禁止行为包括违法活动、侵害他人、侵犯权利、窃取凭据、恶意代码、未经授权的安全测试、欺骗性内容、支付滥用和绕过服务限制。"),
          link("查看可接受使用政策", "/acceptable-use")
        ]
      },
      {
        heading: "11. 我们的知识产权",
        blocks: [
          p("除您的内容（包括提示词及您请求生成的 AI 输出）外，musuw 的软件、界面、品牌、文档及服务材料归我们或许可方所有。本条款仅根据套餐授予您有限、可撤销、不可转让的使用权，不转移我们的知识产权所有权。"),
          p("反馈完全自愿。提交反馈即允许我们不受限制且无需付费地使用，但未经许可我们不会公开识别您的身份。")
        ]
      },
      {
        heading: "12. 暂停与终止",
        blocks: [
          p("您可随时停止使用。为防止损害、调查可信违规、履行法律义务、处理未付款或保护服务和用户，我们可在合理必要范围内限制或暂停访问。"),
          p("在可行且合法时，我们会通知并提供纠正机会。严重滥用、欺诈、安全攻击或违法行为可导致立即终止。付款义务、知识产权、免责声明、责任限制和争议条款等按性质应继续有效的条款，在终止后仍有效。")
        ]
      },
      {
        heading: "13. 保证与责任",
        blocks: [
          p("我们以合理注意和技能提供服务。除法律不得排除的保证外，musuw 按“可用状态”提供，我们不保证服务不中断或 AI 输出无错误。"),
          p("在法律允许的最大范围内，任何一方均不对间接、附带、特殊、惩罚性或后果性损失，以及不可合理预见的利润、收入、商誉或数据损失承担责任。"),
          p("在法律允许的最大范围内，我们因服务产生的累计责任，以 100 美元或导致索赔事件前 12 个月您为 musuw 支付的金额中较高者为限。对于法律不得限制的责任，该限制不适用，包括欺诈、故意不当行为、因过失造成的死亡或人身伤害、违反法定个人信息保护或数据安全义务，以及强制性消费者权利。")
        ]
      },
      {
        heading: "14. 适用法律与争议",
        blocks: [
          p("本条款适用中华人民共和国法律，但不适用其冲突法规则。除强制性法律允许您在其他地点主张权利外，由运营方住所地有管辖权的法院管辖。"),
          p(`提出正式主张前，请通过 ${LEGAL_OPERATOR.supportEmail} 联系我们以尝试解决。任何条款均不限制不可放弃的消费者权利，也不限制您联系监管机构或消费者保护机构。`)
        ]
      },
      {
        heading: "15. 变更与联系",
        blocks: [
          p("我们可因产品、法律、安全或运营变化更新本条款，并公布生效日期。重大变化将在法律要求时另行通知；结账页面和收据展示的版本适用于该笔购买，后续变更仅向未来生效，除非法律另有要求。"),
          contact("联系运营方")
        ]
      }
    ]
  },
  "/privacy": {
    path: "/privacy",
    eyebrow: "隐私",
    title: "隐私政策",
    summary: "本政策说明 musuw 收集哪些个人信息、使用目的、保留期限、可能的处理方、跨境处理以及您可行使的权利。",
    updated: analyticsNoticeUpdated,
    sections: [
      {
        heading: "1. 运营主体与适用范围",
        blocks: [
          p(`${operator} 决定为运营 musuw 如何使用个人信息。若服务商独立决定其处理目的和方式，则适用其自身角色和隐私说明。本政策适用于公开网站、账户、产品功能、支持及相关沟通。`),
          p(`隐私问题和权利请求可发送至 ${LEGAL_OPERATOR.supportEmail}。`),
          contact("提交隐私请求")
        ]
      },
      {
        heading: "2. 我们收集的信息",
        blocks: [
          list(
            "账户与联系信息，例如姓名、电子邮箱、账户标识、语言和个人偏好。",
            "知识内容，例如您主动上传的文档、笔记、提示词、保存的答案、引用、主题、Wiki 页面、图谱链接和文件。",
            "使用与技术信息，例如功能事件、汇总页面性能指标、IP 地址、设备和浏览器信息、地区语言、时间戳、诊断、安全事件，以及使用时的 Cookie 或本地存储标识。",
            "支持与沟通信息，包括消息、附件、反馈和解决请求所需记录。",
            "交易信息，例如套餐、金额、币种、计费周期、交易标识、付款状态、税务地区和付款服务商提供的有限收据信息。我们不接收或存储完整银行卡号。"
          )
        ]
      },
      {
        heading: "3. 信息来源",
        blocks: [
          p("信息可能直接来自您、您使用服务时的设备、您授权连接的服务，以及参与交付服务的付款、反欺诈、支持或基础设施服务商。"),
          p("Cloudflare 可能向我们提供国家或地区代码，用于向中国大陆访问者显示中文、向其他访问者显示英文。我们不会借此推断精确位置。"),
          p("Cloudflare 在公开网站边缘处理请求元数据，用于内容交付、TLS、滥用防护和国家或地区层级的语言选择。Cloudflare 还通过浏览器信标提供不使用 Cookie 的页面访问及性能统计。"),
          p("启用可选的 Google Analytics 4（GA4）时，仅在您同意后于公开官网页面运行，利用浏览器与设备信息及 Cookie 标识统计页面访问与基础会话活动。页面地址仅包含允许统计的公开路径，并移除查询参数和片段；来源地址仅保留来源站点的协议与域名，不包含路径、查询参数或片段。我们不向 GA4 发送 musuw 账户标识、邮箱、知识内容或对话。广告功能和 Google signals 均关闭。")
        ]
      },
      {
        heading: "4. 处理目的和依据",
        blocks: [
          list(
            "履行与您的合同并提供您请求的服务和功能。",
            "为履行合同、响应您的请求或遵守法律，处理账户、购买、订阅、支持和服务通知。",
            "为履行合同、履行法定义务或保护用户与服务，保障安全、排查故障、防止欺诈和滥用、执行政策并保持可审计性。",
            "履行税务、会计、制裁、执法及其他法律义务。",
            "在允许范围内使用汇总、去标识化或有限服务数据改进可用性和可靠性。",
            "仅在您同意后使用可选 GA4 统计公开官网的使用情况，您可通过页脚“统计偏好”随时撤回。",
            "仅在您主动请求或已取得法律要求的同意时发送可选营销信息，您可随时退订。"
          ),
          p("在中华人民共和国境内，我们仅在为订立或履行合同所必需、履行法定义务、已取得您的同意或个人信息保护法允许的其他情形下处理个人信息。依赖同意处理时，您可随时撤回，但不影响撤回前处理的合法性；其他地区适用当地法律认可的处理依据和相应权利。")
        ]
      },
      {
        heading: "5. 知识内容与 AI 处理",
        blocks: [
          p("musuw 处理您选择的来源范围和提示词，以检索证据并生成请求的输出。为完成您主动请求的 AI 功能，必要范围内的提示词、检索片段、图片、音频或视频可能经 OpenRouter 发送给所选模型对应的模型方和推理服务商；向量化和重排会发送建立索引或排序来源所需的文本。"),
          p("OpenRouter 声明其不使用 API 输入或输出训练模型，但下游模型方或推理服务商的保留和训练做法可能不同。产品会显示所选模型；提交敏感内容前请查看 OpenRouter 最新服务商信息，如需确认某次请求的处理路径可联系我们。"),
          p("除非您另行明确选择加入，musuw 不会使用您个人账户中存储的内容训练通用模型或基础模型。该承诺说明 musuw 自身的处理目的；OpenRouter 及各下游服务商的现行做法另受其自身说明约束。"),
          p("我们不出售您个人账户中的内容，也不将其用于跨场景行为广告。我们不会仅通过自动化方式对您作出具有法律或类似重大影响的决定。"),
          p("本服务并不要求您提供生物识别、医疗健康、金融账户、精确行踪或未成年人信息等敏感个人信息。除非确有特定必要性且已取得合法授权，请勿上传。若 musuw 主动引入必须处理敏感个人信息的用途，我们会在处理前提供法律要求的专门告知，并在适用时取得单独同意；若您处理他人信息，您有责任具备相应依据、完成告知并保障其权利。")
        ]
      },
      {
        heading: "6. 服务商、委托处理与接收方清单",
        blocks: [
          p("我们仅在履行以下职责所合理必要的范围提供个人信息。目前主要服务商和独立接收方如下："),
          p("基础设施和支持服务商通常根据适用协议，为下述服务职责处理信息。Paddle 作为商户记录方独立处理购买；Google 处理您主动选择的登录；OpenRouter、下游模型服务商和 TikHub 可能就其路由服务承担独立角色。具体法律角色可能随请求和适用协议变化，同时适用其当前公告。"),
          list(
            "Supabase, Inc. 提供身份认证和一次性验证码服务，为此处理账户邮箱、资料声明、身份标识以及登录和会话数据。",
            "Resend, Inc. 发送身份认证事务邮件，为此处理收件地址、认证邮件内容和元数据，以及投递与安全事件。",
            "您选择 Google 登录时，Google LLC 处理 Google 账户数据。musuw 仅请求 openid、profile 和 email 范围，并接收 Google 就这些范围返回的标识和资料字段。另在 GA4 已启用且您同意时，Google 会处理上文所述有限的公开官网使用数据，以提供统计服务。",
            "Cloudflare, Inc. 提供 DNS 与边缘交付、传输安全、滥用防护、国家或地区层级语言选择和 R2 对象存储，为此可能处理 IP 与请求元数据、安全信号和上传的原始资料对象。",
            "Musuw 自托管的 SearXNG 实例执行产品网络搜索，目前会将来自您请求的搜索查询发送给 Microsoft Bing，并取回公开结果标题、URL 和摘要。请求不包含您的 musuw 邮箱或账户标识，但查询本身可能透露您所问的内容；Microsoft 依其自身声明处理该查询。配置的上游搜索引擎可能变化，生产路由变更时我们会更新本说明。",
            "当您主动使用付费社媒链接导入功能时，TikHub, LLC. 会解析支持的公开社媒链接。根据平台接口，musuw 会发送标准化的公开分享 URL 或分享文本，或公开帖子/视频标识；不会发送您的 musuw 邮箱或账户标识。TikHub 返回公开媒体与元数据，并在其政策中说明可留存服务日志和使用统计，且可将服务相关数据用于诊断、开发和纠错。",
            "OpenRouter, Inc. 将提示词、相关来源片段、媒体、模型请求、用量和稳定的假名化用户归因标识路由给所选模型方和推理服务商。该标识不含您的邮箱，用于请求和用量归因。可用模型和服务商可能变化；产品会显示所选模型，但实际下游推理路由及服务商做法可能因模型和请求而异。",
            "Langfuse GmbH 在其日本云区域提供生产 AI 可观测与故障排查。为运营和排查用户请求的 AI 功能，范围受限的追踪可能包含提示词或查询、检索或来源预览、模型回复、假名化的内部用户、会话和请求标识、端点与任务元数据、模型与工具标识、用量、延迟和错误元数据。留存时间取决于当前 Langfuse 项目配置和适用套餐，不是统一固定期限；您可联系我们查询当前配置或行使相关权利。",
            "Paddle 相关实体作为 musuw 付费订单的授权经销商和商户记录方，依据其买家条款和隐私政策处理买家联系、交易、税务地区、付款、收据、反欺诈、订阅、取消和退款数据。",
            "在法律要求或为保护权利与安全所合理必要时的专业顾问、审计人员、监管机构、法院和主管机关。",
            "合并、融资、重组或出售中的继受方，但须采取适当保密和告知措施。"
          ),
          p("我们不以金钱为对价出售个人信息，也不为跨场景行为广告共享个人信息。"),
          link("Supabase 隐私政策", "https://supabase.com/privacy"),
          link("Resend 隐私政策", "https://resend.com/legal/privacy-policy"),
          link("Google 隐私政策", "https://policies.google.com/privacy"),
          link("Cloudflare 隐私政策", "https://www.cloudflare.com/privacypolicy/"),
          link("Microsoft 隐私声明", "https://privacy.microsoft.com/en-us/privacystatement"),
          link("TikHub 隐私政策", "https://docs.tikhub.io/5508543m0"),
          link("OpenRouter 隐私政策", "https://openrouter.ai/privacy"),
          link("Langfuse 隐私政策", "https://langfuse.com/privacy"),
          link("Langfuse 数据区域", "https://langfuse.com/security/data-regions"),
          link("Paddle 隐私声明", "https://www.paddle.com/legal/privacy")
        ]
      },
      {
        heading: "7. 跨境处理",
        blocks: [
          p("musuw 及其服务商可能在您所在国家或地区之外处理信息。上方清单列出当前接收方类别，但某次请求的实际下游推理接收方可能随所选模型和路由变化；在不违反合法保密限制的前提下，您可联系我们了解该次请求的接收方和保护措施。"),
          p("适用法律要求传输机制、另行告知或单独同意时，musuw 必须在相关跨境处理前完成相应要求；本隐私政策本身不构成您的单独同意。")
        ]
      },
      {
        heading: "8. 保留与删除",
        blocks: [
          p("账户处于活动状态或提供服务所需期间，我们会保留账户和知识内容。收到经核验的删除请求或账户关闭后，我们会在不无故拖延的情况下从活动系统删除或去标识化，但可能受法定留存、安全调查、争议和正常备份轮换限制。"),
          p("账户注销获接受后，musuw 会立即终止产品访问并开始移除活动知识内容，同时安排每个可取消的 Paddle 订阅在当前计费周期结束时停止后续自动续费。欠费、服务商暂不可用或其他暂不可取消状态不会延迟接受注销或停止访问。Paddle 确认已安排取消后，musuw 即可立即完成已封禁账户及账单关联记录的最终删除，不必等待当前计费周期结束；如果 Paddle 确认全部关联订阅已终止或权威返回不存在，则无需取消。在任何待处理期间，已封禁的身份及 Paddle 客户/订阅关联只为完成取消和注销而保留，不会作为活动账户展示。账户注销不会自动退款已完成的付款。Paddle 是订单的商户记录方，可能依据适用法律及其服务条款在法定或允许期限内保留发票、交易记录、税务、会计、反欺诈、拒付和争议记录。musuw 仅为履行法律、会计、反欺诈、安全、争议、取消或注销义务保留相应最小记录，并在可行时脱离账户、最小化，不会作为活跃账户数据展示。这些 Paddle 和 musuw 记录按各自留存期限处理；我们不承诺立即从 Paddle 或受限备份中物理消失。"),
          p("安全日志和支持记录仅在实现其目的所合理需要的期限内保留。"),
          p("信息不再需要时，我们会删除、去标识化或安全隔离。无法合理重新关联到您的去标识化信息可继续保留。")
        ]
      },
      {
        heading: "9. 您的权利",
        blocks: [
          p("根据您所在地区，您可能享有知情、查阅、复制、更正、删除、限制或拒绝处理、获取可携带副本、撤回同意，以及申诉或向监管机构投诉等权利。"),
          p("在适用情形下，您可要求说明自动化决策的处理情况，拒绝仅由自动化决策对您产生重大影响，并要求人工复核。"),
          p("加利福尼亚居民还可能享有知情、删除、更正、在适用时限制敏感信息使用、选择退出出售或共享，以及不受差别待遇的权利。musuw 不出售个人信息，也不为跨场景行为广告共享个人信息。"),
          p(`如需注销账户，请向 ${LEGAL_OPERATOR.supportEmail} 发送主题为“Privacy request”或“Account deletion”的邮件，或使用已公布的客服渠道。您可通过产品控件删除单篇文档或知识库。我们可能进行适度身份核验，仅在法律允许时拒绝或限制请求。授权代理人须提供有效授权。`),
          p("获授权的运营人员通过受限内部功能执行账户注销；用户设置中不提供自助注销入口。"),
          p("我们将在适用法律规定期限内答复。若请求被拒绝，可回复邮件并以“隐私申诉”为主题提出申诉，也可向所在地个人信息保护、数据保护或消费者保护机构投诉。")
        ]
      },
      {
        heading: "10. 安全措施",
        blocks: [
          p("我们采取旨在保护个人信息的技术和组织措施，包括范围化访问、服务凭据服务器端处理、传输加密、日志、精确证据链接和在支持范围内的数据生命周期控制。"),
          p("任何系统都无法保证绝对安全。请为 Google 账户和邮箱启用多因素认证并维护有效的恢复渠道、保护设备，并及时报告疑似未授权访问。"),
          link("查看安全概览", "/security")
        ]
      },
      {
        heading: "11. Cookie 与类似技术",
        blocks: [
          p("Cloudflare 提供不使用 Cookie 的页面访问及性能统计，并按上文说明处理边缘请求和安全元数据。我们不使用广告 Cookie 或跨站行为追踪；为语言、身份认证、安全、结账返回状态和统计选择使用必要浏览器存储。可选 GA4 启用时，仅在同意后使用统计 Cookie。外部身份和结账服务商可依据其告知使用必要技术。"),
          link("查看 Cookie 说明", "/cookies")
        ]
      },
      {
        heading: "12. 未成年人",
        blocks: [
          p("musuw 账户使用者必须年满 16 周岁。本服务不面向儿童，我们不会明知而收集其个人信息；如您认为儿童提交了个人信息，请联系我们调查、停用相关账户并在法律要求时删除。")
        ]
      },
      {
        heading: "13. 政策变更与联系",
        blocks: [
          p("产品、服务商或法律义务发生变化时，我们可能更新本政策，并公布新的生效日期。重大变化将在法律要求时另行通知。"),
          contact("联系隐私团队")
        ]
      }
    ]
  },
  "/refund-policy": {
    path: "/refund-policy",
    eyebrow: "购买",
    title: "退款政策",
    summary: "法定撤回权和强制性消费者权利优先适用；在这些权利及 Paddle 当前《退款政策》之外，musuw 不提供自愿退款，已完成交易均为最终交易且不予退款。",
    updated: billingPolicyUpdated,
    sections: [
      {
        heading: "1. 已验证的付费订单",
        blocks: [
          note("本政策适用于 musuw 已通过有效签名通知确认的 Paddle 完成交易。仅返回浏览器结账页面不能证明已形成付费订单。"),
          p("Paddle 收据和 musuw 账单页会显示用于支持与退款审核的交易标识和当前账单状态。")
        ]
      },
      {
        heading: "2. 法定撤回权",
        blocks: [
          p("Paddle 当前《退款政策》说明，中国、韩国和巴西的买家，在数字内容或服务交付后，可对符合条件的交易行使无条件取消权，但须在交易发生后 7 日内提出。"),
          p("该政策还说明，欧盟、欧洲经济区、瑞士和英国的符合条件买家，就单次购买或首次订阅付款享有 14 日撤回期；免费试用结束后会开始新的撤回期，英国年度订阅续费还适用该政策列明的额外权利。"),
          p("截至本政策生效日，Paddle 还列明了土耳其和以色列（14 日）、加拿大（7 日）以及新加坡（5 日）符合条件买家的地区性撤回期。这些示例不是完整清单，不替代 Paddle 当前政策或更高的当地法律保护。"),
          p("对于符合条件的数字内容，只有买家明确同意在撤回期内开始使用，并确认因此丧失撤回权后，该权利才可能失效。具体资格和期限以 Paddle 当前《退款政策》及更高的不可放弃当地法律保护为准。"),
          link("查看 Paddle 退款政策", PADDLE_LINKS.refundPolicy)
        ]
      },
      {
        heading: "3. 不提供自愿退款",
        blocks: [
          p("我们不提供自愿或常规退款。除适用法律要求或 Paddle 当前《退款政策》允许外，已完成交易均为最终交易且不予退款。"),
          p("Paddle 可酌情批准退款，也可拒绝涉及欺诈、退款滥用或其他操纵行为的申请。强制性消费者权利不受影响。"),
          link("查看 Paddle 退款政策", PADDLE_LINKS.refundPolicy)
        ]
      },
      {
        heading: "4. 如何申请",
        blocks: [
          list(
            "使用付款收据中的退款或买家支持链接。",
            "使用适用付款服务商的客户或交易门户。",
            `发送邮件至 ${LEGAL_OPERATOR.supportEmail}，提供账户邮箱、交易标识、购买日期和简短说明。`
          ),
          p("Paddle 和 musuw 会使用收据及交易信息核验申请。请勿发送完整银行卡号、密码、政府证件号码或其他不必要的敏感信息。"),
          contact("申请退款")
        ]
      },
      {
        heading: "5. 谁处理退款",
        blocks: [
          p("Paddle 会在可能时将符合条件的退款退回原付款方式。请使用 Paddle 收据、客户门户或买家支持流程。"),
          p("我们会与商户记录方 Paddle 配合处理适用政策要求或批准的退款。交易核验、支付网络处理时间、汇率换算和服务商买家条款可能影响退款到账方式。"),
          link("Paddle 买家支持（paddle.net）", PADDLE_LINKS.buyerSupport)
        ]
      },
      {
        heading: "6. 时间与访问权",
        blocks: [
          p("Paddle 当前退款政策说明，符合条件的退款会在可能时原路处理，并在批准后 14 日内处理；银行或支付网络可能需要额外时间显示入账，以当前 Paddle 政策为准。"),
          p("全额退款完成后，相应付费权益可能立即终止。申请删除前，请先导出您有权保留的材料。")
        ]
      },
      {
        heading: "7. 缺陷、描述不符与法定权利",
        blocks: [
          p("若 musuw 存在重大缺陷、与描述不符或未以法律要求的合理注意提供，请通过上述支持渠道联系我们。适用法律要求的救济仍然有效。"),
          p("本政策不排除或限制强制性消费者权利、法定撤回权或付款服务商提供的买家保护。不同规则并存时，以不可放弃的最高保护为准。")
        ]
      },
      {
        heading: "8. 取消与退款不同",
        blocks: [
          p("取消订阅会停止未来续费，但不会自动退还已经完成的扣款。退款须根据本政策另行申请。"),
          link("查看订阅与取消政策", "/subscription-policy")
        ]
      }
    ]
  },
  "/subscription-policy": {
    path: "/subscription-policy",
    eyebrow: "账单",
    title: "订阅与取消政策",
    summary: "本政策说明自动续费、计费周期、取消方式、套餐变更，以及循环订阅和单次购买之间的明确区别。",
    updated: accountLifecycleUpdated,
    sections: [
      {
        heading: "1. 您购买的内容",
        blocks: [
          p("结账前，musuw 会显示报价属于循环订阅还是单次购买，并显示套餐、价格、币种、计费周期和所含功能。"),
          p("单次购买不会自动续费；循环订阅会按所选月度或年度周期自动续费，直至取消。")
        ]
      },
      {
        heading: "2. 扣款与税费",
        blocks: [
          p("循环套餐会由商户记录方在每个新计费周期开始时向留存付款方式扣款。适用税费和支持的本地币种金额会在结账时计算或披露。"),
          p("扣款失败时，付款服务商可能重试并通知您。合理通知后仍未付款的，访问权可能受到限制。")
        ]
      },
      {
        heading: "3. 如何取消",
        blocks: [
          list(
            "打开收据中的管理订阅链接。",
            "使用该订单对应的 Paddle 客户门户。",
            "生产账户账单功能可用时，使用产品内账单入口。",
            `使用账户邮箱联系 ${LEGAL_OPERATOR.supportEmail} 并提供交易标识。`
          ),
          p("Paddle 会记录并确认取消。如适用法律要求，在续费前通过上述列明渠道提出的请求，不因确认延迟而失效；请保留请求证据并在发生延迟时联系我们。取消会停止未来续费，并在当前计费周期结束时生效，受强制性法律约束。"),
          link("Paddle 买家支持（paddle.net）", PADDLE_LINKS.buyerSupport),
          contact("请求取消")
        ]
      },
      {
        heading: "4. 取消后的效果",
        blocks: [
          p("取消会停止未来自动续费。除退款或强制性法律另有规定外，付费访问权持续至当前计费周期结束，之后不再产生订阅扣款。"),
          p("删除应用、不使用服务或移除支付应用不会取消订阅。获接受的账户注销会安排可取消订阅在周期结束时停止后续自动续费、立即终止 musuw 访问，且不会自动退款已完成的付款。")
        ]
      },
      {
        heading: "5. 套餐和价格变更",
        blocks: [
          p("升级可能立即生效，并在确认前披露按比例计算的扣款或抵扣；降级通常在下次续费时生效，除非页面另有说明。"),
          p("若价格发生变化，Paddle 或 musuw 会通知您，并在法律要求时先取得同意再按新价格扣款。您可在新价格生效前取消。")
        ]
      },
      {
        heading: "6. 续费提醒与收据",
        blocks: [
          p("商户记录方会为每笔真实付款发送收据。对中国消费者，适用的平台价格规则要求在每次自动续费扣款前告知扣款时间、金额、取消途径及价格变化。对于其他法律要求的地区和订阅周期，Paddle 或 musuw 会在续费前提前发送续费提醒。没有此类强制规则时，并非每种周期都必然收到单独提醒；请保持账户和收据邮箱有效，您可在续费前随时通过上述方式取消。")
        ]
      },
      {
        heading: "7. 退款与强制性权利",
        blocks: [
          p("取消与退款不同。取消阻止未来续费。musuw 不提供自愿或常规退款；已完成交易均为最终交易且不予退款，但适用法律要求或 Paddle 当前《退款政策》批准的情形除外。"),
          link("查看退款政策", "/refund-policy"),
          p("本政策不限制任何强制性消费者权利。")
        ]
      }
    ]
  },
  "/acceptable-use": {
    path: "/acceptable-use",
    eyebrow: "信任",
    title: "可接受使用政策",
    summary: "本政策通过明确禁止的内容、行为、自动化使用和安全滥用，保护 musuw 用户、基础设施与第三方权利。",
    updated,
    sections: [
      {
        heading: "1. 基本规则",
        blocks: [p("请合法、负责地使用 musuw，并仅处理您获授权访问的内容和系统。您对本人内容、提示词、配置的集成及输出用途负责。")]
      },
      {
        heading: "2. 违法与有害活动",
        blocks: [
          p("不得利用 musuw 协助违法、暴力、剥削、人口贩运、恐怖主义、规避制裁、受管制武器或意图造成人身和重大财产损害的指示。"),
          p("不得威胁、骚扰、跟踪、歧视、剥削或公开他人隐私，也不得制作或传播未经同意的私密内容。")
        ]
      },
      {
        heading: "3. 权利与隐私",
        blocks: [
          p("不得上传或处理您无权使用的材料，不得侵犯知识产权、隐私权、公开权、保密义务、合同权利、数据库权利或其他权利。"),
          p("网页导入仅用于对您拥有或获授权使用的内容建立私人知识索引，不是流媒体下载或内容再分发服务。"),
          p("支持的社媒链接导入使用与来源平台无关联的第三方数据 API。您仍须遵守来源平台条款，并确保有权获取和处理相应公开帖子或媒体。"),
          p("视频上传仅用于对您拥有或获授权使用的内容进行私人知识分析；musuw 不是面向公众的视频托管、流媒体播放、下载或内容再分发服务。"),
          p("不得以欺骗方式收集凭据、敏感信息或个人信息，也不得将 musuw 用于非法监控或身份识别。")
        ]
      },
      {
        heading: "4. 安全与平台滥用",
        blocks: [
          list(
            "禁止恶意软件、勒索软件、破坏性代码、凭据窃取、网络钓鱼或欺诈。",
            "禁止未经授权的漏洞扫描、渗透测试、访问、拦截或干扰。",
            "禁止绕过身份验证、工作空间隔离、额度、付款控制、速率限制或安全机制。",
            "禁止严重降低服务性能或违反已发布限制的抓取和自动化流量。",
            "除不可放弃的法律明确允许范围外，禁止逆向工程。"
          )
        ]
      },
      {
        heading: "5. 欺骗与重大影响决定",
        blocks: [
          p("不得冒充他人、伪造来源、将 AI 输出虚假表示为已核验事实，也不得用于垃圾信息、诈骗、虚假互动或支付滥用。"),
          p("除非独立满足合格人工复核、告知、公平、解释和申诉等要求，不得将 musuw 作为就业、信贷、住房、教育、保险、医疗、法律权利或基本服务决定的唯一依据。")
        ]
      },
      {
        heading: "6. 敏感和受监管用途",
        blocks: [p("musuw 是通用知识工具，不是受监管的专业服务。不得利用其非法提供医疗、法律、财务、信贷、博彩或其他受监管服务，也不得规避许可和合规义务。")]
      },
      {
        heading: "7. 执行与申诉",
        blocks: [
          p("我们可调查可信举报，并按比例限制内容、集成或账户以防止损害。严重或重复违规可导致暂停或终止；法律要求时可保留和披露信息。"),
          p("适当时会考虑背景、严重性、重复程度、用户意图和可行补救。除会产生风险或违反法律外，我们可提供通知和申诉机会。")
        ]
      },
      {
        heading: "8. 举报滥用",
        blocks: [
          p(`请向 ${LEGAL_OPERATOR.supportEmail} 提交足以定位问题的信息，并避免附带不必要的敏感信息。`),
          contact("举报滥用")
        ]
      }
    ]
  },
  "/cookies": {
    path: "/cookies",
    eyebrow: "隐私",
    title: "Cookie 说明",
    summary: "本说明介绍 musuw 官网和产品使用的浏览器存储，包括必要偏好、可选统计、安全状态与外部结账技术。",
    updated: analyticsNoticeUpdated,
    sections: [
      {
        heading: "1. 当前官网做法",
        blocks: [
          p("Cloudflare 通过浏览器信标提供不使用 Cookie 的页面访问及性能统计，并为交付和保护网站处理边缘请求与安全元数据，提供仅用于语言选择的国家或地区代码。"),
          p("官网不设置广告 Cookie，也不进行跨站行为追踪。所选语言存储在必要的 musuw_locale Cookie 中，最长保留一年；我们不存储精确位置。"),
          p("启用可选的 Google Analytics 4（GA4）时，仅在您同意统计后于公开官网页面运行。在您同意前或拒绝后，我们不加载 Google 统计脚本；网站未配置测量 ID 时，不运行 GA4 统计。拒绝统计不影响使用网站。"),
          p("同意后，GA4 可设置 _ga Cookie 以区分浏览器与会话，采集页面访问及基础会话事件。页面地址仅包含允许统计的公开路径，并移除查询参数和片段；来源地址仅保留来源站点的协议与域名。我们不发送 musuw 账户标识、邮箱、知识内容或对话。广告功能和 Google signals 均关闭。"),
          link("Google 隐私政策", "https://policies.google.com/privacy"),
          link("Cloudflare RUM 信标说明", "https://developers.cloudflare.com/speed/observatory/rum-beacon/")
        ]
      },
      {
        heading: "2. 必要存储",
        blocks: [
          p("musuw 可能使用为保持登录、保护会话、记住语言或无障碍偏好、保留结账返回状态、防止滥用及提供所请求功能而必需的 Cookie、本地存储或类似浏览器功能。"),
          p("您的统计选择保存在本地存储 musuw_analytics_consent_v1 中，直至您更改选择或清除站点数据。该偏好不标识您的 musuw 账户；若浏览器无法保存本地存储，选择仅适用于当前标签页。"),
          p("必要存储有时无法通过同意控件关闭，因为关闭后账户或安全功能可能无法使用。您可通过浏览器设置清除。")
        ]
      },
      {
        heading: "3. 付款服务商技术",
        blocks: [p("打开 Paddle 结账时，Paddle 可能依据其说明使用必要 Cookie 或类似技术，以完成反欺诈、付款处理、税费确定、本地化和买家支持。")]
      },
      {
        heading: "4. 管理浏览器存储",
        blocks: [
          p("可选统计启用时，您可随时打开页脚“统计偏好”调整统计选择。撤回同意会停止统计并清除本站可访问的 _ga Cookie；如果已加载 Google 脚本，页面会刷新一次。撤回不会删除已发送给 Google 的数据；如需行使数据权利，请联系我们。"),
          p("多数浏览器允许查看、阻止或删除 Cookie 和站点数据。阻止必要存储可能影响登录、结账、偏好保存或其他请求的功能。"),
          p("浏览器的“请勿追踪”信号尚无统一法律标准。无论该信号如何，公开官网都不用于跨站行为广告。")
        ]
      },
      {
        heading: "5. 变更",
        blocks: [p("浏览器存储的类别、用途或服务商发生重大变化时，我们会更新本说明。页面顶部日期标识当前版本。")]
      },
      {
        heading: "6. 联系方式",
        blocks: [contact("联系隐私支持")]
      }
    ]
  },
  "/security": {
    path: "/security",
    eyebrow: "信任",
    title: "安全概览",
    summary: "musuw 围绕范围化知识访问、证据保留、精确引用、服务器端凭据和可见数据生命周期控制进行设计。",
    updated,
    sections: [
      {
        heading: "1. 安全方法",
        blocks: [
          p("我们根据服务和知识内容敏感程度采取分层技术和组织措施。安全是持续风险管理过程，不能保证事件永远不会发生。"),
          p("托管产品通过范围化的边缘和服务器边界以 HTTPS 提供，应用发布使用不可变镜像版本。本页面说明当前产品控制，不声称尚未完成的外部认证或独立保证。")
        ]
      },
      {
        heading: "2. 账户与检索范围",
        blocks: [
          p("知识检索限定在已认证的个人账户，以及本次对话获授权的主题、来源和版本范围。访问控制在服务边界执行，而非仅依赖界面是否可见。"),
          p("请妥善保管个人账户，并仅授予所连接服务必要的最小权限。")
        ]
      },
      {
        heading: "3. 凭据与传输",
        blocks: [
          p("服务凭据和模型服务商密钥在服务器端处理，不应暴露于浏览器。生产流量通过 HTTPS 提供，敏感密钥与公开前端代码分离。"),
          p("付款凭据在商户记录方的结账页输入，musuw 不接收或存储完整银行卡号。")
        ]
      },
      {
        heading: "4. 证据与资料完整性",
        blocks: [
          p("musuw 保留原始资料和版本引用，使答案能够解析当时使用的证据。上传资料可被解析为 Wiki 页面及其中的图谱视图，答案仍能返回精确证据，也不会重写历史资料。"),
          p("这些控制提高可审计性，但不能替代用户对重要 AI 输出的审查。")
        ]
      },
      {
        heading: "5. 数据生命周期",
        blocks: [
          p(`您可通过产品控件删除单篇文档和知识库；数据类型提供导出操作时可直接使用。如需完整注销账户，请联系 ${LEGAL_OPERATOR.supportEmail} 或已公布的客服渠道。获授权的运营人员通过受限内部功能提交注销；法定留存、反欺诈、争议记录、安全日志和备份轮换可能按隐私政策说明延迟彻底移除。`),
          link("查看隐私政策", "/privacy")
        ]
      },
      {
        heading: "6. 运营与事件响应",
        blocks: [
          p("我们根据需要使用日志、依赖审查、访问限制、变更验证、备份和事件流程，检测、调查、遏制并恢复安全事件。"),
          p("若事件可能对受影响人员造成重大风险，我们会依法通知并提供可采取的保护措施。")
        ]
      },
      {
        heading: "7. 您的责任",
        blocks: [
          list(
            "为 Google 账户和邮箱启用多因素认证，并维护有效的恢复渠道。",
            "及时更新设备、浏览器和集成。",
            "使用满足需要的最小知识和集成范围。",
            "依赖重要输出前审查内容和证据。",
            "及时报告疑似未授权访问。"
          )
        ]
      },
      {
        heading: "8. 负责任披露",
        blocks: [
          p(`请向 ${LEGAL_OPERATOR.supportEmail} 发送疑似漏洞，邮件主题为“Security report”，并提供可复现细节。请勿访问、修改或保留不属于您的数据。`),
          p("目前我们不运营公开漏洞赏金计划。任何确认、资格或奖励均须另行书面约定。善意研究仍须遵守法律和可接受使用政策。"),
          contact("报告安全问题")
        ]
      }
    ]
  },
  "/contact": {
    path: "/contact",
    eyebrow: "支持",
    title: "联系 musuw",
    summary: "您可以联系 musuw 团队获取产品帮助、账单和取消支持、提交隐私权利请求、安全报告或支付审核问题。",
    updated,
    sections: [
      {
        heading: "运营主体",
        blocks: [
          p(LEGAL_OPERATOR.chineseName),
          p(LEGAL_OPERATOR.englishName),
          p("musuw 是本网站使用的产品名称。")
        ]
      },
      {
        heading: "客户支持",
        blocks: [
          p(`请发送邮件至 ${LEGAL_OPERATOR.supportEmail} 或致电 ${LEGAL_OPERATOR.supportPhone}，并提供必要的产品、账户和交易背景；请勿发送密码或完整银行卡号。`),
          contact("发送支持邮件"),
          phone(`致电 ${LEGAL_OPERATOR.supportPhone}`)
        ]
      },
      {
        heading: "账单、退款与取消",
        blocks: [
          p("为更快处理交易问题，请使用 Paddle 收据或客户门户中的订单管理链接，也可提供账户邮箱和交易标识联系我们。请勿发送完整银行卡号或密码。"),
          link("退款政策", "/refund-policy"),
          link("订阅与取消政策", "/subscription-policy"),
          link("Paddle 买家支持（paddle.net）", PADDLE_LINKS.buyerSupport)
        ]
      },
      {
        heading: "隐私与安全",
        blocks: [
          p("行使信息权利时请使用邮件主题“Privacy request”；报告疑似漏洞或未授权访问时请使用“Security report”，并仅提供调查所需信息。"),
          link("隐私政策", "/privacy"),
          link("安全概览", "/security")
        ]
      },
      {
        heading: "支付与审核咨询",
        blocks: [
          p("Paddle、税务、域名审核或企业身份问题，请附上相关商店、案件或交易标识。我们不会在官网公开私密审核文件。"),
          contact("联系运营方")
        ]
      }
    ]
  }
};

function normalizeLocale(locale) {
  return locale === "zh-CN" ? "zh-CN" : "en";
}

function normalizePath(pathname) {
  if (!pathname || pathname === "/") return "/";
  const path = pathname.split("?")[0].split("#")[0];
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

export function getPublicDocument(locale, pathname) {
  const documents = normalizeLocale(locale) === "zh-CN" ? chineseDocuments : englishDocuments;
  return documents[normalizePath(pathname)] ?? null;
}

export function getPublicDocumentMeta(locale, pathname) {
  const document = getPublicDocument(locale, pathname);
  if (!document) return null;
  return {
    title: `${document.title} | musuw`,
    description: document.summary
  };
}
