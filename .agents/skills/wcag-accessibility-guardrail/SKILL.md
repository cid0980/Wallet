---
name: wcag-accessibility-guardrail
description: Check semantics, accessible names, focus, keyboard routes, touch targets, and announcements on every UI change.
---

# Accessibility guardrail

Before merging a UI change, inspect these paths:

- Page: one main landmark, named nav, skip link, useful heading order, visible labels for forms and icon-only buttons.
- Controls: native buttons, links and form elements; `ChipGroup` single choice uses radio semantics with arrows/Home/End, multi choice uses pressed state. Avoid click-only divs and duplicate ARIA.
- Modal: `Sheet` provides `showModal()` focus containment, Escape and focus restoration; ensure background is inert and closing a busy form does not discard a write.
- States: progress has an accessible name and text; errors are announced as alerts, success as status, loading as busy; color is never the only signal.
- Inspect at 320px, 200% zoom and with keyboard only. Check every interactive touch target near 44x44px and text/indicator contrast; no claim of WCAG certification without manual assistive-technology testing.

Reference: W3C WCAG quick reference https://www.w3.org/WAI/WCAG22/quickref/ and the WAI-ARIA authoring practices https://www.w3.org/WAI/ARIA/apg/.
