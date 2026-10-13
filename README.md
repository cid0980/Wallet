# Vault

A private, shared money tracker for two partners who work on client projects together.

## Current status

- ✅ Step 1 — static SvelteKit SPA, Vercel static-host configuration, Firebase emulator configuration
- ✅ Step 2 — Google redirect sign-in, persistent Firestore cache, membership lookup, and first-run shared-vault creation
- ⏳ Step 3 — typed money data layer: paise conversion, write batches, increments, payment/expense edits and deletes
- ⏳ Step 4 — dashboard, clients, payments, expenses, history, settings, and bottom navigation
- ⏳ Step 5 — full emulator-tested Firestore rules
- ⏳ Step 6 — PWA manifest, service worker, installation, and update prompt
- ⏳ Step 7 — private GitHub repository, Vercel GitHub Actions deployment, and production verification

## Technology baseline

- Node.js `24.12.0` or newer within Node 24
- SvelteKit `2.70.3` with Svelte 5 and TypeScript
- `@sveltejs/adapter-static`
- Client-only SPA (`ssr = false`) with `index.html` fallback
- Firebase JS SDK: Auth and Firestore only
- Vercel static hosting only; no Vercel Functions

## Local setup

1. Install Node using the committed version file:

   ```bash
   nvm install
   nvm use
   node --version
   ```

   The expected Node version is at least `v24.12.0` and below Node 25.

2. Install the exact locked dependencies:

   ```bash
   npm ci
   ```

3. Run the app:

   ```bash
   npm run dev
   ```

4. Verify before committing:

   ```bash
   npm run verify
   ```

   `npm run verify` runs type checking and creates the static production output in `build/`.

## Firebase configuration

Vault uses Firebase only for Google Authentication, Cloud Firestore, Firestore Security Rules, and the local Emulator Suite. It does **not** use Firebase Hosting, Cloud Functions, Cloud Storage, or any paid Firebase product.

The active Firebase project is `valet-07`. Its public web configuration belongs in ignored `.env.local`; do not commit that file.

Do not put service-account JSON, private keys, Vercel tokens, or GitHub tokens in this repository.

### Required Firebase Console settings

1. **Authentication → Sign-in method:** enable **Google**.
2. **Authentication → Settings → Authorized domains:** add `localhost` for local development. Add the final Vercel production domain during Step 7.
3. **Firestore Database:** create the default database in **Production mode**. For partners based near Hosūr, `asia-south1` (Mumbai) is the expected low-latency regional choice.

### Bootstrap rules deployment

The committed Firestore rules are a deliberately narrow bootstrap policy. They permit only verified Google users to create a structurally valid zero-balance vault containing their own email, and let only the two stored members read that vault. Payments, expenses, updates, deletes, and every subcollection remain denied until Step 5.

Before testing first-run creation against production Firebase, authenticate locally and deploy those bootstrap rules:

```bash
npx firebase-tools@15.33.0 login
npm run firestore:rules:deploy
```

## Local Firebase emulators

After dependencies are installed, start only Authentication and Firestore emulators with:

```bash
npm run emulators
```

This uses the local-only project ID `vault-local` and opens the Emulator UI on port 4000. No production Firebase data is touched by that command.

**Java 21 or newer is required.** During Step 2 verification, current `firebase-tools@15.33.0` rejected Java 11 and successfully started the Firestore Emulator with Java 21. Install a JDK/JRE 21+ before running emulator commands locally.

## Offline-data safety

Vault initializes Firestore with a persistent multi-tab IndexedDB cache. This makes live listeners and future batched writes available offline and lets them synchronize later. It also means cached Vault information can remain on the device after the browser closes. Only sign in on devices you trust, and use sign out when necessary.

## Vercel static deployment boundary

`vercel.json` deliberately selects Vercel's **Other** framework preset and serves the static `build/` directory. Its catch-all rewrite routes deep links to `index.html`, allowing SvelteKit's client router to handle them.

GitHub Actions deployment, Vercel project linking, Vercel secrets, and Firebase Auth production-domain setup are deferred to Step 7 after the app works locally.
