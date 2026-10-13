// Vault is intentionally a client-rendered static SPA. Firebase Auth and
// Firestore run only in the browser, so server-side rendering must stay off.
export const ssr = false;

// Generate an installable static app shell for the PWA precache while Vercel
// still routes deep links to the client-side SPA fallback.
export const prerender = true;
