# Vault agent instructions

Vault is a Svelte 5, TypeScript and Firebase app for two people. Before changing the UI, read all five project-local skills in `.agents/skills/`:

1. `shadcn-ui-master/SKILL.md` (component architecture, adapted to Svelte)
2. `wcag-accessibility-guardrail/SKILL.md`
3. `anti-ai-slop-layout/SKILL.md`
4. `nielsen-heuristics-reviewer/SKILL.md`
5. `state-and-motion-polish/SKILL.md`

These are locally authored project adaptations of the user's requested guardrails, not copies of packages with the same names. Do not install React/shadcn, an external UI library, or native platform-default selectors. Keep one visual UI for both users. If asked for a UI-only edit, do not modify Firestore rules, service/data models, or auth. Run the checks in `docs/ui-guardrails.md` before pushing.
