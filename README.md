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
- `src/studio/` — the recording studio at `/studio` (see below); `audio/` is the
  transport, drum synthesis, mic capture and mixdown, `analysis/` the DSP,
  `lyrics/` the Spanish prosody engine, `components/` the UI

## Estudio — AI-assisted recording at `/studio`

A self-contained, browser-only recording studio built around the singer's own
voice. No backend, no API keys, no uploads: every millisecond of audio stays in
the tab. Its module (`src/studio/`) is written and commented in Spanish, because
its whole subject is Spanish prosody — *sinalefa*, *sílaba tónica*,
*semicorchea* — and its UI is Spanish too.

The loop it supports, in the order the tabs run:

1. **Ritmo** — beatbox the groove with your mouth. Spectral-flux onset detection
   finds every hit; a harmonic-comb autocorrelation over the onset envelope
   reads the tempo out of your own timing; each hit is sorted into kick / snare
   / hi-hat by where its energy sits, with the snare–hat boundary found by
   2-means on a brightness feature (so it adapts to *your* mouth rather than a
   fixed threshold); the hits are quantised, folded over the loop so repeated
   passes reinforce each other, and rotated so the kick lands on beat 1. The
   result drops straight into an editable step sequencer with synthesised drums
   and a tuned 808.
2. **Letra** — a lyric pad that measures each line in Spanish: syllabification
   with diphthong/hiatus rules, *sinalefa* between words, stress position
   (aguda/llana/esdrújula), and a rhyme scheme (A/B/C…) derived from the tonic
   tail. A rhyme finder searches consonante / asonante / near rhymes over a
   built-in bank plus your own vocabulary. Pick a flow template and the line's
   syllables are laid onto the 16th-note grid — then "Ensayar con el beat"
   plays guide blips on those steps so you can hear the flow before recording.
3. **Grabar** — takes recorded over the beat through an AudioWorklet, anchored
   to bar 1 on the audio clock and compensated for output latency. Each take is
   analysed against the grid: pocket %, whether you push or drag (in ms), timing
   spread, syllables per bar, an offbeat ratio, a per-16th "flow fingerprint",
   and plain-language advice. Pitch analysis (YIN + Krumhansl key profiles)
   reports your note range, key, and how far off pitch you sing.
4. **Mezcla** — offline render of beat plus takes to a downloadable WAV.

Everything is DSP written from scratch (`src/studio/analysis/`): FFT, onset
detection, tempo, pitch, key. There are no audio dependencies.

Verified end-to-end against a synthetic beatbox fed through a fake microphone:
tempo recovered to within 0.4 BPM and the kick/snare/hi-hat pattern
reconstructed exactly. A steady, unsyncopated pulse train is genuinely
tempo-ambiguous (a 3:2 reading is as valid as the true one) — the panel reports
low confidence when that happens, and you can type the BPM instead.

**Takes live in memory only.** Tempo, pattern and lyrics persist to
`localStorage`; recorded audio does not. Export the WAV before closing the tab.

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
