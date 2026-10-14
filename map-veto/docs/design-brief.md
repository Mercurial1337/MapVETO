# MapVETO UI design brief

Prepared 14 October 2026 for the designer. This records what exists today so new layouts can reuse it. No new visual design has been implemented: layout changes wait for approved designs (handoff delivery step 4).

## What engineering needs back

- Editable Figma files with reusable components and tokens for colour, spacing, typography, borders and states.
- Review frames at 1440 × 900, 768 × 1024, 390 × 844, plus a 360 px width check. These are review sizes; layouts must adapt and scroll naturally.
- Content maximum width, sidebar width, card sizes, gutters, input/button heights and stacking order per breakpoint. Main controls at least 44 × 44 px.
- States: hover, keyboard focus, disabled, submitting, empty, error, long team names, completed matches, and limited-space behaviour.
- Brand: event/site logo as SVG, brand colours, and licensed font files only if a custom font is essential. The system font is preferred for performance.
- New map images only if needed: WebP or AVIF sized for their rendered cards, with intended display dimensions. Existing images can be reused.
- No animated backgrounds, gradients, glass effects, decorative video, heavy shadows or new icon/font libraries.

## Screens

1. Event dashboard and cards: actions, filters, long event names.
2. Matches dashboard: table/list, status filters, copy-link dialog.
3. Sheet import: workbook connection, day selection, preview with checkboxes, selection summary, confirmation, conflicts (including "Approve new password"), stale-preview notice and per-ID results.
4. Team match page: check-in, coin toss, Team A/B choice, timer and maps, side selection, timeout request.
5. Staff match page: Head Admin/Referee controls, timeline, action log, open-timeout notice, Timeouts tab with Acknowledge and Resolve.
6. Team password screen: entry, show password, incorrect password, attempt limit, checking, and "access expired or password changed".

Screens 3, 5 and 6 have new interim states built from existing components; please include them.

## Current system

| Area | Today |
| --- | --- |
| Colour tokens (`src/app/globals.css`) | background `#111114`, foreground `#ededed`, panel `#18181b`, border `#36363e`/`#52525b`, accent `#a1a1aa`; team A `#ef4444`, team B `#3b82f6`, attack `#ef4444`, defense `#06b6d4`, success `#22c55e`, warning `#eab308`. Match header labels use `#00FFFF` (Team A) and `#CCFF00` (Team B). |
| Typography | Arial/Helvetica system stack, Consolas for mono. Events may load a custom font from their branding settings on the match page. |
| Components | `btn-primary`, `btn-secondary`, `btn-danger`, `match-panel`, `match-input`, `badge-attack`/`badge-defense`, tab buttons (`role=tab`); radius 4 px; no shadows or gradients. |
| Icons | `lucide-react` (already installed) in 7 files. |
| Layout | Tailwind 4 defaults (`sm` 640, `md` 768, `lg` 1024, `xl` 1280). Match page content max 1600 px; staff tools sit in a 340 px column beside the maps from 1280 px and stack below them under that. Admin sidebar is 256 px: fixed beside content from `md`, a slide-in drawer below it. |
| Map cards | 16:9; 96 / 120 / 160 / 180 / 200 px wide by breakpoint. Sources are 1000 × 563 WebP (about 1.3 MB for 12 maps) resized by `next/image`. |
| Branding files | `CLASH26 PLATFORM HEADER.png` (200 × 64), `429px-VALORANT_EMEA_Clash_allmode.png` (429 × 600), `clash-favicon.png`, `coin/side-a.png`, `coin/side-b.png`. No SVG logo in the repository. |
| Unused assets | `public/coin/coin-flip-a.gif` and `-b.gif` (about 4.5 MB each) are not referenced by the app. |

Status is not communicated by colour alone in new work: every coloured state also has text ("Not acknowledged", "Password missing", "Changed since review").

## Performance baseline

Client JavaScript per route, production build, summed unique chunks (gzip). "Before" is commit `fc35608`; "after" includes the password, import-review and acknowledgment work. Builds used different inlined environment values, so differences under about 0.5 KB are noise.

| Route | Before | After |
| --- | --- | --- |
| `/match/[id]` | 251.5 KB | 253.2 KB |
| `/admin/events/[id]/sheet` | 238.3 KB | 240.5 KB |
| `/admin/matches` | 243.7 KB | 244.5 KB |
| `/admin/events` | 239.5 KB | 240.3 KB |
| `/admin` | 239.2 KB | 240.0 KB |

When comparing a new design, use the same devices and network conditions before and after, and record JS payload, image bytes, loading (LCP) and interaction responsiveness (INP). Investigate any regression before accepting the design.
