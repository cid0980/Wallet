# Local UX preview harness

`npm run dev:demo` boots the **real** Vault UI with an in-memory data layer, so the
whole app can be clicked through without Firebase credentials, a Firebase project,
or the emulator suite.

```
npm run dev:demo   # http://localhost:5173
```

## What it is

- `demo/DemoApp.svelte` renders `src/lib/components/app/VaultWorkspace.svelte` — the
  same component the shipped app renders once a vault is loaded.
- `demo/mock-services.ts` is aliased over `$lib/services/vault-data` by
  `demo/vite.config.ts`, so every read/write call the workspace makes hits
  `demo/mock-state.ts` instead of Firestore.
- Seeded with two partners ("Studio North"), 3 clients (one archived), 4 projects,
  4 payments, 4 expenses, and history entries, so every screen has content.
- Money stays in integer paise, and totals are rebuilt from the records after every
  change, matching how the Firestore batches maintain `vaults/{id}.totals`.

## What it deliberately does not do

- No auth: you are always partner A (`arun@studionorth.in`).
- No Firestore rules, no persistence, no PWA/service worker (`registerType` and
  offline caching are real-app only).
- No multi-tab or offline simulation. Reloading resets state (there is a **Reset**
  chip in the corner).

Nothing in `src/` is modified, and `npm run verify` / `npm run build` are untouched:
the harness has its own Vite config and root.
