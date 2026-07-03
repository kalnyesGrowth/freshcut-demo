# Instant Estimate Widget - Build Notes

## Files
- `instant-estimate.html` - Full wizard UI (vanilla JS, no dependencies beyond Google Maps)
- `pricing.config.json` - Alex-editable pricing config (all values marked `_confirm: true`)
- `supabase/functions/upload-estimate-photo/index.ts` - Edge function source (deployed v2)
- `supabase/functions/analyze-estimate/index.ts` - Edge function source (deployed v2)

## Supabase Edge Functions (deployed, source in repo)
- `upload-estimate-photo` (v2) - Issues signed upload URLs for private `estimate-photos` bucket. Rate-limited (20 req/min/IP). Validates file type (JPG/PNG/WebP), size (8MB max), and session photo count (6 max).
- `analyze-estimate` (v2) - Downloads photos from storage, sends to Claude claude-sonnet-4-6 with service-specific prompts, returns structured JSON analysis. Rate-limited (5 req/min/IP). Gracefully degrades to manual input if API key is missing or Claude errors.

## Architecture

```
User -> instant-estimate.html (vanilla JS)
  Step 1: Service selection (6 cards)
  Step 2: Address (Google Places Autocomplete, service area check)
         Falls back to plain text input if Maps unavailable
  Step 3: Measurement (3 variants):
    - Mowing/Mulch: Google Maps polygon draw on satellite tiles
      Falls back to manual sqft input with helper text
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
  Payload includes: service, address, estimate, photos, AI analysis,
                    area_unverified flag, maps_fallback flag
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

## Analytics Events
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

## Google Maps API Key

**Key location:** `GOOGLE_MAPS_KEY` const in the config block (~line 515 of instant-estimate.html).
One-line edit to rotate. The key is referrer-restricted to `fresh-cut-landscape.com` in Google Cloud Console.

Client-side exposure of a referrer-restricted Maps JS key is correct by design. This is how Google Maps JS API works. Do not "fix" this by moving it server-side.

Required APIs enabled: Maps JavaScript API, Places API. Drawing and Geometry libraries loaded via the `libraries=` param.

## Maps Fallback (never dead-ends)

Five layers of defense ensure the wizard is always completable:

1. **`gm_authFailure`** - Google's auth failure callback, fires when the API key is invalid/expired
2. **Script `onerror`** - Fires when the Maps JS fails to load (network error, blocked CDN)
3. **6-second load timeout** - If Maps hasn't loaded 6 seconds after page load, activates fallback
4. **Step 3 render-time check** - Verifies `window.google.maps` exists before building the map
5. **`initMapView()` guard** - Checks `MAPS_FAILED` and `google.maps.Map` before creating the map

When fallback activates:
- Map container, Clear/Undo buttons, and live sqft readout are hidden
- Manual sqft input appears with context-aware helper text:
  - Mowing: "A typical quarter-acre lawn is about 7,000-9,000 sq ft of grass"
  - Mulch: "A typical front-yard bed is 100-300 sq ft. Measure length x width..."
- `state.mapsFallback = true` flag included in lead payload so Alex knows

Step 2 autocomplete fallback:
- Address input always works as plain text (listener extracted from `initAutocomplete`)
- When Maps unavailable, shows notice: "Address suggestions unavailable. Type your full address..."
- Service area check skipped, `state.areaUnverified = true` in lead payload

## Spanish i18n
Active. `ENABLE_SPANISH = true`. Sticky toggle button in bottom-right. Full translations for all wizard text.

## Security
- Private storage bucket (signed URLs only)
- Rate limiting on both edge functions (in-memory, resets on cold start)
- Honeypot field on contact step
- No JWT required (public wizard) but abuse protected via rate limits
- File type and size validation on both client and server
- CORS tightened to `fresh-cut-landscape.com` + localhost variants (deployed v2, 2026-07-03)

## Fixed Issues (2026-07-03)

| Issue | Root Cause | Fix |
|---|---|---|
| Maps shows "Oops! Something went wrong" error on Step 3 | `gm_authFailure` handler committed but not deployed (CDN cache). Invalid placeholder key caused auth error, not network error, so `onerror` didn't fire. | Added 5-layer fallback defense. Wired real API key. Dynamic script loading from config const. |
| Step 2 Next button permanently disabled without Maps | Address input listener was inside `initAutocomplete()`, which only runs when Maps loads | Extracted basic text input listener to always run. Works without Maps. |
| `showMapFallback()` not idempotent, stacked event listeners | No guard against multiple calls. `addEventListener` called each time. | Added `state.mapsFallback` guard, `_listenerAttached` flag, try/catch wrapper. |
| Edge functions only in production, not in repo | Deployed via MCP, source not committed | Pulled source into `supabase/functions/`, committed, repo is source of truth. |
| CORS wide open (`*`) on edge functions | Initial deploy used wildcard | Tightened to domain allowlist, redeployed as v2. |

## TODO / Setup Required (Launch Gate)

| Priority | Item | Notes |
|---|---|---|
| **1 DONE** | ~~Add Google Maps API key~~ | Wired: `AIzaSyAJxP99ZEnFEjbU_W54NPhFHHOhnL3Xlms`. Restrict to `fresh-cut-landscape.com` in Google Cloud Console. |
| **2** | Create Supabase storage bucket | Create private bucket named `estimate-photos`. No public access. Edge functions use service role key. |
| **3** | Set ANTHROPIC_API_KEY | Add to Supabase project secrets: `supabase secrets set ANTHROPIC_API_KEY=sk-ant-...` |
| **4 LAUNCH GATE** | Alex confirms pricing | Every value in pricing.config.json is marked `_confirm: true`. Especially mowing base ($60) and mulch per yard ($95). |
| **5** | Verify Calendly URL | Current: `https://calendly.com/freshcutlandscaping`. Confirm with Alex or update `CALENDLY_URL` const. |
