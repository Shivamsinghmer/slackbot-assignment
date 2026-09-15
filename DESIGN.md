# Design

## Theme

Single light theme. The operator works in office daylight beside Slack and a terminal; a dark ops
console would be the category reflex, and this screen is read, not stared into.

## Color

**Strategy: restrained, with a hard rule — chroma is reserved for delivery state.**

The shell, the rails, the forms and the primary action are achromatic. The only saturated colour in
the interface reports what happened to a message. This is the inverse of the SaaS default (brand
colour everywhere, status colour competing with it) and it is what lets a single failed row register
instantly in peripheral vision.

Neutrals are tinted a few thousandths toward blue (hue 250) — cool, not the saturated warm-cream
default.

```css
--bg:        oklch(0.982 0.003 250);  /* app ground */
--surface:   oklch(1    0      0  );  /* data surface — pure white, crisp under dense type */
--rail:      oklch(0.968 0.004 250);  /* left rail, topbar */
--line:      oklch(0.918 0.005 250);  /* hairlines — the primary separator */
--line-soft: oklch(0.950 0.004 250);  /* row dividers */
--ink:       oklch(0.215 0.014 250);  /* body, headings, primary buttons */
--ink-muted: oklch(0.455 0.012 250);  /* secondary text — 7.1:1 on surface */
--ink-faint: oklch(0.522 0.012 250);  /* labels, meta — clears 4.5:1 on every surface it sits on, incl. the selected rail row */
```

`--ink-faint` is the floor. Nothing lighter carries text. The usual failure — elegant light-grey
body copy — is what makes these interfaces unreadable at a glance, which is the one thing this
screen cannot afford.

Every lightness above was **solved**, not chosen: each is the lightest value that still clears 4.5:1
against the darkest background it actually sits on (the rail for neutrals, its own 0.03-chroma tint
for each state colour). Measured in-browser, not estimated.

### State palette

```css
--sent:      oklch(0.520 0.130 150);  /* green  */
--pending:   oklch(0.540 0.120 75 );  /* amber  */
--limited:   oklch(0.545 0.140 55 );  /* orange — rate limited, distinct from pending */
--failed:    oklch(0.535 0.190 25 );  /* red    */
--focus:     oklch(0.540 0.150 250);  /* blue — focus rings and current selection ONLY */
```

Blue appears only as focus and selection, never as a status, so a focus ring can never be mistaken
for a delivery state. Each state also has a `-bg` tint at L 0.96 / C 0.03 of the same hue.

**Colour-blind safety:** sent/limited/failed occupy the exact hues deuteranopia collapses, so every
state additionally carries a distinct glyph (● filled circle, ◐ half circle, ▲ triangle, ■ square)
and its text label. Colour is the third signal, not the first.

## Typography

Two families on a genuine contrast axis — a UI sans and a mono for machine data.

```css
--font-ui:   'Inter var', Inter, system-ui, -apple-system, 'Segoe UI', sans-serif;
--font-mono: 'JetBrains Mono', ui-monospace, 'SF Mono', 'Cascadia Mono', Menlo, monospace;
```

Mono is not decoration here: it carries client ids, webhook URLs, timestamps, currency and ROAS —
values that are compared vertically down a column. `font-variant-numeric: tabular-nums` everywhere a
number appears.

Fixed rem scale, ratio ≈1.15. No fluid clamp sizing; this is product UI at consistent DPI.

```
11px  meta / column headers     (0.02em tracking, uppercase only in table headers)
12px  labels, secondary data
13px  body, table cells         ← workhorse
15px  section headings
19px  page title
```

## Layout

App shell, two columns, no page scroll on the shell itself — the log scrolls independently so the
control bar and client rail stay fixed while a dispatch runs.

```
┌──────────────────────────────────────────────────────────┐
│ topbar  mark · mode · queue meter ·············· [Run]   │  56px, --rail
├───────────────────┬──────────────────────────────────────┤
│ clients rail      │  delivery log                        │
│ 340px, --rail     │  --surface, scrolls independently    │
│                   │                                      │
│ · client list     │  dense table, 13px, hairline rows    │
│ · settings for    │                                      │
│   selected client │                                      │
└───────────────────┴──────────────────────────────────────┘
```

Below 900px the rail collapses above the log and the whole page scrolls normally. The table gets its
own `overflow-x: auto` container; the page body never scrolls sideways.

**No cards.** Regions are defined by 1px hairlines and a background shift between `--rail` and
`--surface`. Nothing has a shadow or a radius above 6px. This is the deliberate break from the
anti-reference.

## Components

Every interactive element ships default, hover, focus-visible, active, disabled states. Buttons also
carry loading.

- **Primary button** — `--ink` fill, white label, 6px radius. The only filled button on screen.
- **Status pill** — glyph + label + state colour on a 0.03-chroma tint. Used in the log and as a dot
  in the client rail.
- **Toggle** — 36×20, `--ink` when on (not the accent — on/off is not a delivery state).
- **Queue meter** — inline segmented bar in the topbar showing waiting / active / done. Replaces the
  banned stat-tile row; it is glanceable and occupies chrome, not content.
- **Mode banner** — states Live or Mock outright in the topbar. Load-bearing: mock messages must
  never be mistakable for delivered ones.
- **Table** — sticky header, hairline row dividers, no zebra striping, hover row tint at 0.4% ink.
- **Empty state** — teaches the dispatch action rather than saying "no data".
- **Skeleton rows** — for first load, not a centred spinner.

## Motion

150–220ms, `cubic-bezier(0.22, 1, 0.36, 1)` (ease-out-quart). Motion conveys state change only.

- A log row whose status changes gets a 600ms background fade in its new state tint — enough to
  catch the eye during a live dispatch, not enough to distract while reading.
- The pending glyph pulses at 2s; rate-limited pulses faster to read as "actively waiting".
- Queue meter segments transition width, not opacity.
- No page-load choreography. The screen loads into a task.

Under `prefers-reduced-motion: reduce`: pulses stop, the row fade becomes an instant tint, all
transitions collapse to 0.01ms. Nothing depends on animation to be legible.

## Z-index scale

```css
--z-base: 0; --z-sticky: 10; --z-topbar: 20; --z-tooltip: 40;
```
