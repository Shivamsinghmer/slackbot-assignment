# Product

## Register

product

## Users

Internal operations engineers at an ad-attribution company. They open this on a second monitor,
in office daylight, with Slack and a worker terminal already on screen. They are responsible for a
daily 09:00 dispatch that fans out client reports to hundreds of Slack channels through a
rate-limited queue.

The job to be done: **trigger a dispatch and know, within about two seconds of glancing over,
whether every client received their report — and if one did not, why.**

Secondary job: configure a client's webhook URL and switch their reports on or off.

## Product Purpose

Queue and deliver daily attribution reports to client Slack channels at a strict one message per
second, absorbing rate limits without losing a message. The interface exists to make an
otherwise-invisible background process observable: what is queued, what landed, what was throttled,
what failed and why.

Success looks like an operator trusting the screen enough not to go read the worker logs.

## Brand Personality

Precise, calm, legible. An instrument rather than a dashboard.

It reads at a glance under time pressure, never dramatises a failure, and treats the operator as an
expert who does not need reassurance or celebration. Voice is plain and factual — "4 queued, 1 rate
limited", not "Success! Your reports are on their way!". Nothing congratulates the user.

## Anti-references

- **The generic SaaS dashboard.** Rounded white cards floating on light grey, a purple or indigo
  brand accent sprayed across unrelated elements, a row of stat tiles across the top, everything
  weighted equally. This is the single thing to avoid; the previous iteration of this UI was exactly
  it.
- Consumer-app friendliness: illustrations, emoji, playful copy, celebratory toasts.
- Enterprise admin chrome: heavy borders, cramped grey tables, no hierarchy.
- Terminal cosplay: neon-on-black, monospace everything, legibility sacrificed for style.

## Design Principles

1. **Colour means state, nothing else.** The interface is achromatic apart from delivery status.
   Primary actions are ink, not brand-coloured. When something is green, amber or red on this screen,
   it is reporting a fact about a message — never decoration, never branding. This is what makes a
   failure impossible to miss.
2. **The log is the product.** Configuration is necessary but secondary. Screen real estate,
   density and hierarchy all resolve in favour of the delivery record.
3. **Never let the UI contradict the backend.** Delivery mode, queue depth and per-row target are
   stated outright, not implied by a control's position. A message that went to the mock endpoint
   must never look like one that reached Slack.
4. **Panels, not cards.** Regions are separated by hairlines and background shifts, not by elevation
   and rounded corners. Nothing floats.
5. **Density is respect.** These users read tables for a living. Show the attempt count, the error
   text, the timestamp — do not hide operational detail behind a disclosure to look tidy.

## Accessibility & Inclusion

WCAG 2.2 AA.

- Body text ≥4.5:1; large text ≥3:1. Verified, not assumed.
- **Status is never conveyed by colour alone** — every delivery state carries a distinct glyph and a
  text label alongside its colour. This is load-bearing here: the four states (sent, pending, rate
  limited, failed) map onto exactly the hues that red-green colour blindness confuses.
- Visible focus indicators on every interactive element, distinct from status colour.
- Full keyboard operation, including client selection and the dispatch action.
- The table polls every 2s; row updates must not animate in a way that disrupts reading. All motion
  has a `prefers-reduced-motion` alternative.
