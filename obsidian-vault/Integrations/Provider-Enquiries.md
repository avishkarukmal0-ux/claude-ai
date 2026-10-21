# Draft provider integration enquiries — DO NOT SEND

Back to [[Home]] · [[POS-Compatibility-Matrix]] · [[Sales-Ingestion-Design]]

> ⚠️ **Drafts only.** Do not send without the owner's review and sign-off, and correct contact/company
> details. They describe Vendora honestly and ask for access — they do not assume it. Vendora has **no**
> provider approval or commercial agreement yet.

## Shared description (reuse in each)
> Vendora is a phone-first PWA for independent UK convenience shops. We are **not** a till or payment
> processor — shops keep their existing checkout. We want to **receive completed, item-level sales** (product
> + quantity) so a shop's stock reduces automatically, without a second scan or a daily manual upload. A small
> group of London shops has agreed to pilot. We seek **read-only** access and the minimum permissions needed.

### Standard questions (ask each provider)
1. Is there a supported way for a third-party app to receive a merchant's **completed item-level sales**
   (per-line product identifier/barcode, quantity, unit, timestamp), with the merchant's consent?
2. Real-time **webhooks** vs **scheduled retrieval** — which is documented, and how are notifications verified?
3. **Returns/refunds**: how are item returns represented separately from monetary refunds?
4. **Access/approval**: self-serve developer signup, or a partner programme / accreditation? What are the steps
   and timelines? Is **read-only** scope available?
5. Is there a **sandbox / test merchant** for integration testing before any live shop?
6. **Fees** for API/partner access (separate from the merchant's card-processing fees)?
7. **Data/security** terms: data processing agreement, PII handling, token lifecycle (expiry/revocation).

## Per-provider drafts

**Square** — "We'd use the Orders API with `order.created`/`order.updated` webhooks and RetrieveOrder for line
items, read-only. Can you confirm order read scope needs no special partner approval, the sandbox, and how you
recommend handling line items that aren't yet present immediately after a payment event?"

**Shopify POS** — "Our shops run Shopify POS. We'd register an app with `read_orders` and subscribe to
`orders/create`/`refunds/create`. For many shops, is a reviewed public app required, or is a custom app per
shop acceptable for a pilot? Confirm POS sales arrive as Orders with line items, and the webhook HMAC scheme."

**Lightspeed Retail (X-Series)** — "We'd read closed sales with line items via the X-Series Sales API
(OAuth2). Please confirm access requirements, whether API access is paid/tiered, rate limits, and partner-
programme terms, plus sandbox availability."

**Zettle (PayPal)** — "We'd read merchant Purchases (item level) via your OAuth2 API, as the single sales
source (not Inventory events). For one Vendora app serving many pilot shops, what partner approval is needed,
and is there a sandbox? We will not take card data."

**SumUp** — "Our stock feature needs **item-level** sale lines (product + quantity). The Transactions/Receipts
APIs we found expose payment-level data (amount/VAT/tip). Is there a documented way to receive per-line product
data for a sale? If not, can a merchant export item-level sales as a file? We will not enable stock deductions
from payment totals alone."

**Epos Now** — "Pilot shops would create an API Device in their Back Office and share credentials so we can
read their Transactions (item level), read-only. Please confirm this is the right route, the status of
webhooks (we understand they're in beta), any paid tier, and a sandbox."

**PayPoint One** — "We couldn't find a public developer API for PayPoint One / Mini + Connect. Is there a
partner-accreditation route for a third party to receive a retailer's **item-level sales** (with the
retailer's consent), read-only? What are the criteria, fees and timelines, and is item-level sales data
available at all?"

**ShopMate (Retail Data Partnership)** — "We understand ShopMate pushes daily price/product/promotion data and
point-of-sale purchases to approved partners under a data-sharing agreement. Could Vendora become such a
partner to receive a retailer's **item-level completed sales** (read-only, with consent)? Please share the feed
format, access steps, fees and data terms."

**EDGEPoS (Henderson Technology)** — "We understand EDGEPoS has a partner API powering integrations such as
Snappy Shopper. Could Vendora integrate to receive a retailer's **item-level completed sales** (read-only, with
consent)? Please share the integration-agreement process, available endpoints/fields for sales line items,
sandbox and fees."
