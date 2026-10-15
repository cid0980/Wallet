---
name: state-and-motion-polish
description: Complete the default, hover, pressed, focus, disabled, loading, error and success states without decorative animation.
---

# States and motion

For every button, chip, input and action link: verify rest/hover/pressed/keyboard-focus/disabled states. Async actions must say “Saving…” or similar and finish in success/error feedback. Loading lists should use `SkeletonList` and a human-readable announcement; empty states must point to the next useful action. Keep pressed/hover responses fast; reserve animation for transitions that explain state (sheet open, toast, progress change).

Prefer short transform/opacity animation and respect `prefers-reduced-motion: reduce`; no motion-only state indication. On touch devices, hover must not be required for any action. Verify long text and poor/offline connection states as well as the happy path.

Reference (similar polish guidance, not an exact-name package): https://github.com/pbakaus/impeccable/blob/main/.opencode/skills/impeccable/reference/polish.md.
