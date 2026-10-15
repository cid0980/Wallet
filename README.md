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
7. Nothing else is needed in Firebase for sign-in: email/password accounts work on any domain without an authorized-domain entry.

## Firebase Console requirements

- Enable **Authentication → Sign-in method → Email/Password**.
- Create Firestore in **Production mode** (`asia-south1` is the low-latency region near Hosūr).
- Publish the current `firestore.rules` from this repository (Firestore Database → Rules).
- No Google sign-in, no authorized domains, and no email enumeration setting is involved.
