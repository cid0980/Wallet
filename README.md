# Vault

A private shared money tracker for two partners who work on client projects together. Vault is a static, mobile-first PWA with Google sign-in, a two-person Firestore Vault, integer-paise accounting, an audit history, and offline-capable browser caching.

## Delivery status

- ✅ Step 1 — static SvelteKit SPA, Vercel static-host configuration, Firebase Emulator configuration
- ✅ Step 2 — Google redirect sign-in, persistent Firestore cache, member discovery, first-run Vault creation
- ✅ Step 3 — integer-paise money utilities, typed documents, atomic payment/expense batches and aggregate increments
- ✅ Step 4 — dashboard, clients, payments, expenses, immutable history, settings, and mobile navigation
- ✅ Step 5 — full Firestore rules plus emulator-backed rule tests
- ✅ Step 6 — installable PWA manifest, service worker, offline app shell, and update prompt
- ✅ Step 7 — GitHub Actions verification and Vercel prebuilt-production deployment workflow
- ⏳ Production activation — requires the account owner to configure Vercel secrets/environment values and authorize the final Vercel domain in Firebase Auth

## Technology baseline

- Node.js `24.12.0` or newer within Node 24
- SvelteKit `2.70.3`, Svelte 5, TypeScript, and `@sveltejs/adapter-static`
- Firebase JS SDK `13.0.0`: Authentication and Cloud Firestore only
- `@vite-pwa/sveltekit` for the PWA app shell and update prompt
- Vercel static hosting only; no Vercel Functions
- GitHub Actions for verification and Vercel deployment

Vault does **not** use Firebase Hosting, Cloud Functions, Cloud Storage, Firebase Analytics, a server database, or any paid Firebase product.

## Repository safety

The repository must never contain:

- `.env.local`
- GitHub personal-access tokens
- Vercel tokens
- Firebase service-account JSON or private keys
- SSH deploy keys
- Firebase emulator data, logs, `node_modules`, or build output

The public Firebase web configuration belongs only in ignored `.env.local` locally and in Vercel Production environment variables for deployment.

## Local development

```bash
nvm install
nvm use
npm ci
npm run dev
```

Before any commit or deployment, run:

```bash
npm run verify
```

`npm run verify` performs all three checks:

1. `npm run check` — Svelte and TypeScript diagnostics
2. `npm run test:rules` — Firestore Emulator security-rule tests
3. `npm run build` — static production build plus PWA service-worker generation

### Java requirement

The current Firebase CLI requires **Java 21 or newer** for the local Firestore Emulator Suite.

```bash
npm run emulators
```

starts only local Authentication and Firestore emulators using the non-production project ID `vault-local`. It does not modify production Firebase data.

## Data model and money safety

All money is stored as a non-negative integer count of **paise**. For example, `₹1,250.50` is stored as `125050`. Vault never uses floating-point arithmetic for balances.

### Firestore hierarchy

```text
/vaults/{vaultId}
  /clients/{clientId}
  /payments/{paymentId}
  /expenses/{expenseId}
  /mutations/{mutationId}
```

- The root Vault document holds aggregate totals.
- Payments and expenses are linked to active clients where appropriate.
- Each payment or expense change atomically writes the changed record, an immutable mutation/audit document, and aggregate totals.
- Security rules use Firestore `getAfter()` and `existsAfter()` checks so a record, its mutation, and the totals cannot be written separately.
- Clients are archived rather than deleted so historical money records remain meaningful.

## Firestore rules

`firestore.rules` is now the full application rule set. It replaces the earlier bootstrap policy and permits:

- Valid Google-authenticated members to read their own Vault data
- Both members to create and edit clients
- Both members to create, edit, and delete payments or expenses only through valid atomic batches
- Read-only immutable history mutations

It still denies:

- Non-member access
- Non-Google authentication providers
- Direct aggregate-total manipulation
- Standalone money-record writes
- Mutation edits/deletes
- Client deletion
- Vault deletion and direct settings edits

Run the included tests with:

```bash
npm run test:rules
```

The test suite covers initial Vault creation, member/non-member boundaries, client access, valid payment batches, aggregate manipulation attempts, malformed deltas, payment edits/deletes, and immutable history.

## PWA and offline behavior

Vault provides:

- `manifest.webmanifest`
- Android maskable and standard app icons
- A generated service worker that precaches the installable static application shell
- An in-app update prompt
- Firestore persistent multi-tab IndexedDB cache for Vault data

The service worker deliberately does **not** cache Firestore API responses. Firestore itself manages encrypted browser-local data caching and synchronization. Use Vault only on devices you trust, and sign out on shared devices.

## Vercel deployment through GitHub Actions

The workflow is at:

```text
.github/workflows/deploy-vercel.yml
```

On a `main` push it always verifies the application. Production deployment is safely skipped until all three GitHub repository secrets exist:

```text
VERCEL_TOKEN
VERCEL_ORG_ID
VERCEL_PROJECT_ID
```

The workflow follows Vercel's prebuilt-deployment sequence:

1. `vercel pull --environment=production`
2. `vercel build --prod`
3. `vercel deploy --prebuilt --prod`

### One-time phone-friendly production setup

Complete these in a browser directly in Vercel and GitHub. Do not paste the values into chat or commit them.

1. In **Vercel**, create or link a project for `cid0980/Wallet` using the **Other** framework preset. The committed `vercel.json` builds `build/` and sends SPA deep links to `200.html`.
2. In **Vercel → Project Settings → Environment Variables**, add these exact Production variables using the values from your local Firebase web configuration:

   ```text
   VITE_FIREBASE_API_KEY
   VITE_FIREBASE_AUTH_DOMAIN
   VITE_FIREBASE_PROJECT_ID
   VITE_FIREBASE_APP_ID
   VITE_FIREBASE_MESSAGING_SENDER_ID
   ```

3. In **Vercel → Account/Team Settings**, create a deployment token. Keep it private.
4. In **Vercel → Project Settings → General**, copy the Project ID. Copy the Team/Account ID from your Vercel settings.
5. In **GitHub → cid0980/Wallet → Settings → Secrets and variables → Actions**, create these three repository secrets directly:

   ```text
   VERCEL_TOKEN
   VERCEL_ORG_ID
   VERCEL_PROJECT_ID
   ```

6. Run the **Verify and deploy Vault** workflow from GitHub Actions, or push to `main` after the secrets are configured.
7. After Vercel shows the final `*.vercel.app` domain, open **Firebase Console → Authentication → Settings → Authorized domains** and add that domain. Firebase Google sign-in will then work on the production site.

## Firebase Console requirements

- Enable **Google** in Authentication → Sign-in method.
- Create Firestore in **Production mode**. For partners near Hosūr, `asia-south1` (Mumbai) is the expected low-latency regional choice.
- Add `localhost` for local development.
- Add the final Vercel domain after the first production deployment.
- Copy the complete current `firestore.rules` file into Firestore Database → Rules and publish it before recording payments or expenses in production.

## Troubleshooting Google sign-in

`VITE_FIREBASE_AUTH_DOMAIN` must be the **Firebase auth domain**, not the deployed website URL. Firebase sends the browser to `https://<VITE_FIREBASE_AUTH_DOMAIN>/__/auth/handler`, so a value like `https://your-app.vercel.app/` produces an unusable `https://https://your-app.vercel.app//__/auth/handler` and "Continue with Google" never reaches Google. `normalizeAuthDomain()` in `src/lib/firebase/client.ts` now repairs a pasted deployment URL, but the Vercel Production environment value should still be corrected to `your-project.firebaseapp.com`.

Checklist when Google sign-in fails:

1. Vercel → Project Settings → Environment Variables → `VITE_FIREBASE_AUTH_DOMAIN` is `your-project.firebaseapp.com` (no `https://`, no trailing slash). Redeploy after changing it, because Vite inlines these values at build time.
2. Firebase Console → Authentication → Settings → Authorized domains contains every host the app runs on: `localhost`, `<project>.firebaseapp.com`, and the final `*.vercel.app` domain.
3. Firebase Console → Authentication → Sign-in method → Google is enabled.
4. The browser is not blocking storage or third-party cookies for the site.
5. Check the GitHub Actions run for the deployed commit — the site is only updated when `verify` passes and the Vercel secrets are configured.

### "Google returns to the sign-in page with no error"

That symptom means the redirect completed but this site was not allowed to read the sign-in result, usually because the browser blocks cross-site storage (Safari, Firefox, or Chrome with third-party cookies blocked). Vault now signs in with a Google pop-up first, which does not depend on that cross-site read, and falls back to the redirect flow only in environments that cannot show a pop-up. If the redirect fallback returns with no session, the sign-in screen now says so explicitly and names the exact origin that must be authorized instead of looping silently.

### "Blank page after sign-in"

The page previously had no fallback branch, so an unexpected combination of auth, session, and data states rendered an empty screen with no explanation. Rendering is now total: every combination shows either the workspace or a card that names the current state, and the workspace sits inside a Svelte error boundary so a render failure shows a reload button instead of a blank page. A session without an email address, which used to blank the screen, is rejected at the auth boundary.

`npm run test:render` renders the real `+page.svelte` against every session/vault/data combination and fails if any of them is empty or missing its expected content. It runs inside `npm run verify`.

### "The app stops after sign-in and the Firebase Users table shows no email"

The Google sign-in returned no email claim, so Firebase created a user whose identifier is empty and Vault had nothing to look a shared vault up with. Vault signs with the account email twice over: it finds the shared vault by it, and the Firestore rules compare it against `request.auth.token.email`.

Vault now requests the `email` scope explicitly on the Google provider. The SDK's `GoogleAuthProvider` requests only `profile` by default, and without an explicit `email` scope Google can return an ID token with no email claim. Vault also resolves the email from three sources in order (user record, linked provider entry, ID token claims) and shows what each source returned under *What Vault received from Google* when a session cannot be used.

If a session still has no email, the sign-in screen names the account and the missing claim. Check:

- Firebase Console → Authentication → Settings → **User actions** → *Email enumeration protection*. Users there report it can strip the email from the returned account; disabling it restores it.
- Firebase Console → Authentication → **Sign-in method** → Google enabled.
- The Google account itself. Some work, school, or admin-restricted accounts do not share an email; a personal Google account always does.

The unusable session is signed out on the device as soon as it is detected, so it cannot block later attempts.

### "Vault access was denied" despite publishing the rules

The vault-access error card now runs its own access check and shows the token claims Google sent, so the cause is visible without dev tools:

- **Read test: allowed** yet the lookup still fails → the two membership queries are being refused while plain reads work. Report the screen.
- **Read test: permission-denied** → either the rules were pasted but not published, or the token fails one of the conditions `signedInWithVerifiedGoogleEmail()` tests: `email` is a string, `email_verified == true`, and `firebase.sign_in_provider == 'google.com'`. The card prints all three.
- **token email_verified: missing/not-boolean** or **sign_in_provider: missing** → the rules cannot be satisfied by that token shape.

### A cached bundle can hide a fix

The service worker now updates itself (`registerType: 'autoUpdate'`): a new deployment takes over on the next load and checks again every 30 minutes, so an old cached bundle cannot present a fixed bug as still broken. Before that, the sign-in screen kept showing pre-fix error text until the update prompt was tapped. When checking a deployment, also confirm the page is the production domain, not a preview URL.

### Publish the current Firestore rules before recording money

The Step 1 bootstrap policy in git history only covers vault creation and discovery. Its catch-all (`match /vaults/{vaultId}/{document=**} { allow read, write: if false; }`) denies every client, payment, expense, and history read, so a created vault would open straight into "We could not load your records." Copy the repository's current `firestore.rules` (the 500+ line policy tested by `npm run test:rules`) into Firestore Database → Rules and publish it.

Run `npm run test:unit` for the auth-domain, sign-in-strategy, and account-email regression tests, `npm run test:render` for the render harness, and `npm run verify` before pushing.
