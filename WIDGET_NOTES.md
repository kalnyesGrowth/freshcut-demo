# Instant Estimate Widget - Build Notes

## Files Created
- `instant-estimate.html` - Full wizard UI (vanilla JS, no dependencies beyond Google Maps)
- `pricing.config.json` - Alex-editable pricing config (all values marked `_confirm: true`)

## Supabase Edge Functions Deployed
- `upload-estimate-photo` - Issues signed upload URLs for private `estimate-photos` bucket. Rate-limited (20 req/min/IP). Validates file type (JPG/PNG/WebP), size (8MB max), and session photo count (6 max).
- `analyze-estimate` - Downloads photos from storage, sends to Claude claude-sonnet-4-6 with service-specific prompts, returns structured JSON analysis. Rate-limited (5 req/min/IP). Gracefully degrades to manual input if API key is missing or Claude errors.

## Architecture

```
User -> instant-estimate.html (vanilla JS)
  Step 1: Service selection (6 cards)
  Step 2: Address (Google Places Autocomplete, service area check)
  Step 3: Measurement (3 variants):
    - Mowing/Mulch: Google Maps polygon draw on satellite tiles
    - Gutter: Stories + guards questions
    - Tree/Cleanup/Storm: Photo upload + condition + tree-specific Qs
  Step 4: Contact info (name, phone required)
  Step 5: Result (instant price | range | review-only)

Photo flow:
  Browser -> upload-estimate-photo (get signed URL)
  Browser -> Supabase Storage (PUT signed URL)
  Browser -> analyze-estimate (sends photo paths)
  analyze-estimate -> downloads from storage -> Claude API -> JSON response

Lead delivery:
  Browser -> capture-lead (existing function, no changes)
  Payload includes: service, address, estimate, photos, AI analysis
```

## Result Modes
- **Instant price**: Mowing (per-visit), mulch (total), gutter (flat rate). Single number.
- **Range**: Leaf cleanup (tier-based), tree trim (size-based with hazard surcharges). Low-high range.
- **Review-only**: Storm cleanup (always), XL trees, near power lines, low AI confidence.

## Pricing Engine
Reads from `pricing.config.json` at page load. Hardcoded fallback values if fetch fails. All math runs client-side. Every price field is marked `_confirm: true` for Alex to verify before launch.

Key formulas:
- Mowing: `max(min_price, min_price + ceil((sqft - 5000) / 1000) * $6)`. Biweekly = 1.25x. Overgrown = 1.5x.
- Mulch: `(sqft * depth_inches / 324) * $95/yard`. Minimum $250.
- Gutter: 1-story $140, 2-story $220, +$40 for guards.
- Tree: Size-based range. Removal = 1.8x trim. Each hazard +15%. XL or powerlines = review-only.
- Leaf cleanup: Light/average/heavy tiers with low-high ranges.
- Storm: Always review-only.

## Deep Links from index.html
- Hero: Primary CTA now links to `instant-estimate.html`
- 3 service spotlights: Link to `instant-estimate.html?service=mulch|tree_trim|gutter`
- Mobile sticky bar: Added "Instant Estimate" button (most prominent)
- URL param `?service=X` auto-selects service and skips to step 2

## Analytics Events Added
| Event | Trigger |
|---|---|
| `est_step_N` | Each wizard step entered |
| `est_result_instant` | Instant price shown |
| `est_result_range` | Range shown |
| `est_result_review` | Review-only shown |
| `est_lead_submitted` | Lead locked in |
| `est_calendly` | Calendly link on result page |
| `est_sms_fallback` | SMS fallback link on result page |
| `hero_instant_estimate` | Hero CTA to wizard |
| `spotlight_estimate_*` | Spotlight CTA to wizard |
| `sticky_instant_estimate` | Mobile sticky bar |

## TODO / Setup Required

| Priority | Item | Notes |
|---|---|---|
| **1** | Add Google Maps API key | Replace `YOUR_GOOGLE_MAPS_API_KEY` in instant-estimate.html. Restrict to `fresh-cut-landscape.com`. Enable: Maps JS API, Places API, Drawing Library, Geometry Library. |
| **2** | Create Supabase storage bucket | Create private bucket named `estimate-photos`. No public access. Edge functions use service role key. |
| **3** | Set ANTHROPIC_API_KEY | Add to Supabase project secrets for the `analyze-estimate` function. |
| **4** | Alex confirms pricing | Every value in pricing.config.json is marked `_confirm: true`. Especially mowing base ($60) and mulch per yard ($95). |
| **5** | Calendly URL | Verify `https://calendly.com/freshcutlandscaping` is correct or update in both files. |

## Spanish i18n
Dormant. Set `ENABLE_SPANISH = true` in instant-estimate.html to activate the sticky toggle. Full translations included for all wizard text. Only activates the UI toggle, not auto-detect.

## Security
- Private storage bucket (signed URLs only)
- Rate limiting on both edge functions (in-memory, resets on cold start)
- Honeypot field on contact step
- No JWT required (public wizard) but abuse protected via rate limits
- File type and size validation on both client and server
- CORS headers set to `*` (tighten to domain after launch)
