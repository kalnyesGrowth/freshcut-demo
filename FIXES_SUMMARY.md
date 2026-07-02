# Fresh-Cut Landscaping - Fixes Summary

## Fix 1: Proof Section Restructure
- Removed "We Just Launched on Google!" confession section entirely
- Replaced with "Recent Work" proof band showing 3 best before/after pairs (Lawn Mowing/Stafford, Mulch/Fredericksburg, Tree Trimming/Spotsylvania) with service name, neighborhood, and timeframe
- Renamed testimonial section from "Why Homeowners Choose Us" / "Why Virginia Families Trust" to "What Homeowners Say" / "Real Feedback from Virginia Families"
- Added FTC TODO comment above testimonial section
- Added Google Reviews embed placeholder (HTML-commented, ready to activate with one uncomment when review count >= 10). Includes rating badge, review card template, and "Leave a Google Review" CTA

## Fix 2: Hero Dual CTA + Trust Chips
- Primary button: "Get My Free Quote, 30 Seconds" smooth-scrolls to #area quote form (no longer tel: link)
- Secondary buttons: "Call or Text Alex" (tel:) and "Text Alex" (sms:)
- Trust chip row updated: "Licensed & Insured", "Free Estimates", "Owner On Every Job", "Fredericksburg . Stafford . Spotsylvania"
- Added "Licensed & Insured for your protection" line to tree trimming spotlight section
- Added "Are you licensed and insured?" FAQ item (both HTML and FAQPage schema)

## Fix 3: Speed Promise + Form Upgrades
- Both form buttons changed to "Get My Free Quote" (killed "Send Message")
- Added "What happens next" steps under both form buttons: Instant text confirmation, Alex calls within 2 hours, Free walkthrough & written quote
- Post-submit success state shows inline Calendly booking link ("Want to skip phone tag? Pick your free walkthrough time now")
- Quote form success: #quote-form-success div with Calendly CTA
- Contact form success: #contact-form-success div with Calendly CTA

## Fix 4: Pricing Anchors
- Landscaping/Mulching spotlight: "Most mulch refreshes in the 540 area run $200-$600 installed" + cost guide link
- Tree Trimming spotlight: "Tree trimming in our area typically runs $150-$400 depending on size" + cost guide link
- Gutter/Junk spotlight: "Gutter cleaning runs $100-$250, junk removal $100-$350 in the 540 area" + cost guide link
- All ranges pulled from blog-landscaping-cost-fredericksburg-va.html price table

## Fix 5: Emergency Storm Banner
- Slim dismissible banner under nav: "Storm damage? Text photos to 540-455-7405. We respond within 24-48 hours."
- sms: link prefilled with "Storm damage - photos attached. Address: "
- Toggled by JS constant `SHOW_STORM_BANNER = true/false` at top of first script block
- Dismissal saved to sessionStorage (fc-storm-dismissed)

## Fix 6: Popup + On-Page Offer
- Replaced image-only popup with HTML modal matching site design tokens
- Headline: "New Customer? Take 10% Off Your First Service"
- Two buttons: "Get My Free Quote" (scrolls to form + closes popup), "Book a Walkthrough" (Calendly link)
- Shows once per session (sessionStorage fc-popup)
- Desktop: 7s delay. Mobile: only shows after 50% scroll AND 5s minimum delay
- Added on-page offer banner above the quote form: "10% Off - New customers get 10% off their first service"

## Fix 7: Local-Trust Plumbing
- "View on Google Maps" link updated from generic maps URL to actual GBP link (g.page/r/CVVOks0d4bZgEBM)
- LocalBusiness schema updated: added `image` field, added Facebook to `sameAs` array
- FAQPage schema: added "Are you licensed and insured?" Q&A, fixed "seasons,for" typo
- Footer additions: "Licensed & Insured" line, payment methods "Cash, Check, Card, Zelle/Venmo", Google Maps link
- Guarantee badge after process step 5: "The Fresh-Cut Guarantee - if you're not happy, we fix it on the spot. Free."
- Owner photo placeholder slot with styled figure, avatar placeholder, and copy "Owner Alex handles every job personally"

## Fix 8: Copy & Measurement Pass

### Typos Fixed
- FAQ schema: "seasons,for a specific" changed to "seasons, so if you want a specific"
- FAQ HTML: same fix applied to the rendered FAQ answer
- FAQ schema + HTML: en dashes in "24-48 hours" standardized to hyphens
- All 4 JSON-LD schema blocks validated (VALID)

### Analytics Events
All tracked via `fcTrack()` function + delegated click listener on `[data-fc-event]` attributes:

| Event Name | Trigger |
|---|---|
| `click_phone` | Any tel: link click |
| `click_sms` | Any sms: link click |
| `click_calendly` | Any Calendly link click |
| `hero_call` | Hero "Call or Text Alex" button |
| `hero_text` | Hero "Text Alex" button |
| `form_submit_quote` | Quote form successful submit |
| `form_submit_contact` | Contact form successful submit |
| `calendly_quote_form` | Post-submit Calendly from quote form |
| `calendly_contact_form` | Post-submit Calendly from contact form |
| `gbp_map_click` | "View on Google Maps" button |
| `storm_band_click` | Storm banner SMS link |
| `popup_shown` | Popup displayed |
| `popup_quote_click` | Popup "Get My Free Quote" button |
| `popup_calendly_click` | Popup "Book a Walkthrough" button |

Events log to console via `[FC Track]` prefix and fire `gtag('event')` if Google Analytics is present.

### OG/Meta
- Existing OG tags are complete and correct (title, description, image, url, site_name)
- Twitter Card tags present and correct

---

## ALEX_CONFIRM / TODO Items (Human Tasks)

| Priority | Item | Where |
|---|---|---|
| **1 (TOP)** | Real photo of Alex + truck | Process section, owner photo slot |
| **2** | Confirm Alex's insurance | Hero trust chips, tree section, FAQ, footer |
| **3** | Confirm testimonials are real clients (FTC) | Sarah M., Robert K., Tanya W. in "What Homeowners Say" |
| **4** | Confirm pricing ranges match current rates | All 3 spotlight pricing anchors |
| **5** | Confirm payment methods | Footer: Cash, Check, Card, Zelle/Venmo |
| **6** | Confirm Facebook URL | JSON-LD sameAs field |
| **7** | Wire KG speed-to-lead auto-reply | Then upgrade "2 hours" to "within minutes" on both forms |
| **8** | Activate Google Reviews embed at 10+ reviews | Uncomment GOOGLE_REVIEWS_EMBED section |
| **9** | Add rating chip to hero at 20+ reviews | Per Part C milestones |

## Files Changed
- `index.html` - All 8 fixes applied
