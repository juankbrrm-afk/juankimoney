# MONÉA — Shopify theme

The MONÉA design (cinematic hero, magazine-style menu, editorial shop/product
pages, cart drawer, search) rebuilt as a real Shopify Online Store 2.0 theme —
Liquid + vanilla JS/CSS, no build step required. This runs natively on
Shopify so apps like Zendrop (products, fulfillment) and the Claude MCP
connector work the way they do in a standard Shopify store.

## What's here

- `layout/theme.liquid` — base HTML shell, loads fonts/CSS/JS, mounts the
  menu/search/cart drawers on every page.
- `sections/hero.liquid` + `sections/collection-reveal.liquid` — the
  two-phase homepage intro (cinematic hero, then the black gallery panel that
  rises and parts to reveal the collection). Fully theme-editor configurable
  (image/video, headline, gallery images).
- `sections/featured-collection.liquid` — reused for both "Featured
  Collection" and "Best Sellers" on the homepage (see `templates/index.json`).
- `sections/main-product.liquid` — product page: gallery, variant/size
  swatches wired to real Shopify variants, size guide modal, accordion,
  "Complete the Look" (pulled from the product's first collection).
- `sections/main-collection.liquid` — shop grid with category pills across
  your real collections, paginated.
- `snippets/cart-drawer.liquid` + cart logic in `assets/theme.js` — slide-in
  cart using Shopify's AJAX Cart API (`/cart/add.js`, `/cart/change.js`,
  `/cart.js`); no page reloads.
- `snippets/search-drawer.liquid` — full-screen search using Shopify's
  predictive search endpoint.
- `sections/about-content.liquid`, `sections/contact-content.liquid` —
  assign these via `templates/page.about.json` / `templates/page.contact.json`
  to your About/Contact pages in Shopify admin.
- Journal → Shopify's native **Blog** feature (`templates/blog.json` /
  `templates/article.json`), so you write real posts in Shopify admin instead
  of hardcoded content.
- Wishlist uses `localStorage` (client-side only, no backend needed).

Validated with Shopify's official `@shopify/theme-check-node` linter — no
errors (the `paginate` "unknown object" warnings on `main-collection.liquid`
are a known checker limitation with `{% paginate %}` scope detection, not a
real bug — that's the documented, correct Shopify pattern).

## Deploying

You need a Shopify store first (see the main chat thread for the
StoreBuild AI setup steps). Once you have `your-store.myshopify.com`:

**Option A — no CLI, easiest:**
Zip the contents of this folder (not the folder itself — `layout/`,
`sections/`, etc. should be at the zip root) → Shopify Admin →
`Online Store` → `Themes` → `Add theme` → `Upload zip file`.

**Option B — Shopify CLI (better for iterating):**
```bash
npm install -g @shopify/cli
cd shopify-theme
shopify theme dev --store your-store.myshopify.com   # live preview
shopify theme push --store your-store.myshopify.com  # publish
```

## After deploying

1. In Shopify Admin, set the About/Contact pages to use the `page.about` /
   `page.contact` templates (Pages → [page] → Theme template, right sidebar).
2. Upload real photography through each section's theme-editor settings
   (image pickers) — everything currently renders as an empty cream block
   until images are set.
3. Install the **Zendrop** app, import products — they'll show up
   automatically in `main-collection.liquid` / `featured-collection.liquid`
   via Shopify's native collections, no code changes needed.
4. Add Zendrop's MCP connector in Claude's connector settings to do product
   research, angle generation, and import products to Shopify directly from
   chat (as shown in the workflow video).

## Known scope limits (v1)

- Customer account pages (login/orders/addresses) use Shopify's default —
  not yet reskinned to match the brand.
- Checkout is Shopify's native checkout (by design — Shopify owns payments).
- No automated tests; validated with `theme-check` + manual review only
  (couldn't spin up a live Shopify store to click-test in this session).
