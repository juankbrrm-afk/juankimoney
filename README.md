# MONÉA

A cinematic, editorial-first storefront for a quiet-luxury womenswear house —
built as a fashion experience, not an ecommerce template.

## Stack

- React 19 + TypeScript + Vite 6
- Tailwind CSS v4
- GSAP 3 (ScrollTrigger, ScrollToPlugin) for scroll-driven cinematics
- Motion (Framer Motion 12) for overlay/menu/drawer transitions
- React Router 7

## Brand is configuration, not hardcoded copy

Every brand-facing string — name, tagline, nav, philosophy, contact details,
empty/404/newsletter copy — lives in `src/config/site.ts`. Rebranding the
site is a matter of editing that one file; no component references a brand
name directly. The current placeholder brand is **MONÉA**, a temporary name
per the brief (swap for the real brand when ready).

## Structure

- `src/components/Hero.tsx` — Phase 1 cinematic hero (GSAP entrance timeline)
- `src/components/CollectionReveal.tsx` — Phase 2: a pinned, scroll-scrubbed
  sequence where a black panel rises to reveal an editorial gallery, then
  parts to an ivory CTA scene
- `src/components/EditorialImage.tsx` — placeholder for campaign photography.
  Real assets (shot per the brand's art direction — hotels, concrete
  architecture, Mediterranean villas, golden hour) drop into `/public/images`
  and swap in here; nothing else needs to change
- `src/data/products.ts` — mock catalog with editorial (non-salesy) copy
- `src/pages/` — Home, Shop (gradual-reveal collection grid + filters),
  Product (gallery, size guide modal, accordion, "Complete the Look"), About,
  Journal, Contact, 404
- `src/hooks/` — cart, wishlist, and menu/search UI state (React context)

## Scope note

This build covers the brand identity, visual language, and storefront
experience (cinematic hero, collection reveal, shop, product, cart, search,
wishlist). It does not include payment/checkout processing, a CMS, or the
Shopify/Supabase/n8n/AI automation layer described in later phases of the
brief — those are backend/infra integrations that depend on real service
credentials and are out of scope for a static frontend build.

## Development

```bash
npm install
npm run dev      # start dev server
npm run build    # typecheck + production build
npm run lint     # oxlint
```
