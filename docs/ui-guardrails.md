# Vault UI guardrails

These apply to every new screen and interaction. Five project-local agent skills live in `.agents/skills/` and are loaded via `AGENTS.md` (locally authored adaptations, not the original same-name packages). Vault is a Svelte app, so its internal primitives—not React/shadcn components—are the component library. Do not add an external UI kit or make an operating-system picker the default interaction.

## 1. Component architecture

Use the shared pieces in `src/lib/components/ui/` instead of creating one-off lookalikes:

- `Icon` and `icon-names` — one typed, inline SVG set.
- `ChipGroup` — keyboard-accessible single or multiple choice, with the same chip styling across forms.
- `Sheet` — native modal focus containment, Escape, backdrop, focus restoration and shared header. Keep submissions inside the sheet; pass `busy` during saves.
- `EmptyState`, `Progress`, `SkeletonList`, `Toast` — the same no-data, meter, load and feedback patterns everywhere.

Use `src/app.css` design tokens and existing `btn`, `field`, `row`, `section` and `notice` classes. Extract a new primitive only when a repeated pattern has a genuinely shared responsibility.

## 2. WCAG and keyboard paths

Every page has a `<main>` landmark and the workspace has a skip link. Give navigation a name; use visible headings in order. Label buttons that show only an icon. Announce progress in plain words as well as a visual fill; announcements for errors must use `role="alert"`, normal confirmations `role="status"`. A radio group must support arrow keys, Home and End; multiple choices use pressed buttons. Preserve visible focus rings; never rely on color alone. Test without a pointer and at narrow widths.

## 3. Layout with a purpose

Avoid repeating equally weighted cards or a generic three-column grid for everything. The home screen deliberately puts balance first, one high-frequency payment action next, smaller actions below, project progress afterward, and a compact partner comparison last. Information should be grouped by task, not by component count.

## 4. Usability review before merging

Walk through all ten Nielsen heuristics, particularly: visible sync/offline status; familiar rupee/date language; an obvious way to cancel; validation before financial writes; keeping form choices consistent (e.g. changing a payment client clears an incompatible project); recognition over recall; actionable errors; and explicit confirmation before destructive actions. Try first-run, empty, populated, loading, error and offline states.

## 5. States and motion

Every interactive control needs keyboard focus, hover, pressed and disabled treatment. Every async path needs an understandable pending state and a success or failure outcome. Use shape-matched skeletons where a list is loading; keep transient motion short and remove it under `prefers-reduced-motion: reduce`. Never show an indefinite decorative animation as the only loading explanation.

Run `npm run check`, `npm run test:unit`, `npm run test:render`, `npm run test:interaction`, `npm run test:rules`, and `NODE_OPTIONS=--max-old-space-size=700 npm run build` before publishing. The render harness asserts some landmark and state markup as well as visible content.
