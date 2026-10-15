---
name: shadcn-ui-master
description: Reuse and extend Vault's internal Svelte component system rather than inventing one-off components.
---

# Component architecture for Vault

This is **not** the React shadcn/ui package. Vault is Svelte 5 and previously rejected an external UI library. Apply the shadcn skill's principle of owning, reusing, and composing components to the local source instead.

1. Inventory `src/lib/components/ui/` and `src/app.css` before adding a control. Prefer `ChipGroup`, `Sheet`, `EmptyState`, `Progress`, `Toast`, `SkeletonList`, `Icon`, and the existing `btn`, `field`, `row`, `section`, `notice` styles.
2. Compose those pieces in `src/lib/components/app/`. Extract a new primitive only if semantics or behavior are genuinely shared. Keep Firebase/domain writes in services, not primitives.
3. Use semantic color and spacing tokens from `src/app.css`, typed props, and a single icon set. Do not create a different chooser or modal for each screen.
4. Preserve the same interaction and appearance on both users' devices. No `<select>` as the default choice control; no new React/Radix or external UI dependency.
5. Verify new primitives across empty, loading, disabled, error, success, and long-label cases.

Background: the official shadcn agent skill's “reuse existing components first; compose, don't reinvent” principle, https://github.com/shadcn-ui/ui/tree/main/skills/shadcn. The original skill's CLI/React instructions do **not** apply to this Svelte app.
