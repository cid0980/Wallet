import type { FirebaseError } from 'firebase/app';
import {
	getRedirectResult,
	onAuthStateChanged,
	signInWithPopup,
	signInWithRedirect,
	signOut,
	type Auth,
	type Unsubscribe,
	type User
} from 'firebase/auth';
import { writable } from 'svelte/store';

import { getFirebaseClient } from '$lib/firebase/client';
import {
	firebaseErrorCode,
	hasUsableAccountEmail,
	shouldFallBackToRedirect
} from '$lib/firebase/sign-in-strategy';

export type AuthStatus = 'loading' | 'signed-out' | 'signed-in' | 'signing-in' | 'error';

export interface AuthState {
	status: AuthStatus;
	user: User | null;
	error: string | null;
}

export const authState = writable<AuthState>({
	status: 'loading',
	user: null,
	error: null
});

/**
 * If the browser never actually leaves the page for Google (blocked redirect,
 * unreachable auth handler, flaky network) the button would otherwise stay on
 * "Opening Google…" forever, with no way to retry.
 */
const REDIRECT_WATCHDOG_MS = 12_000;

/**
 * Written just before a full-page redirect and read when the page comes back.
 * Without it, a redirect that returns with no session and no error is
 * indistinguishable from a plain first page load — the silent loop this marker
 * exists to break.
 */
const REDIRECT_MARKER_KEY = 'vault.auth.pending-redirect';
const REDIRECT_MARKER_MAX_AGE_MS = 10 * 60_000;

let authUnsubscribe: Unsubscribe | undefined;
let authStarted = false;
let redirectWatchdog: ReturnType<typeof setTimeout> | undefined;
let pageShowHandler: (() => void) | undefined;
let lastRedirectError: string | null = null;

function authErrorMessage(error: unknown): string {
	const code = firebaseErrorCode(error);

	switch (code) {
		case 'auth/unauthorized-domain':
			return 'This site is not authorized in Firebase Authentication. Add this exact origin in Firebase Console → Authentication → Settings → Authorized domains, then try again.';
		case 'auth/operation-not-allowed':
			return 'Google sign-in is not enabled for this Firebase project.';
		case 'auth/invalid-api-key':
			return 'The Firebase web configuration is not valid. Check the VITE_FIREBASE_* values used for this deployment.';
		case 'auth/account-exists-with-different-credential':
			return 'This Google email is already linked to a different sign-in method.';
		case 'auth/network-request-failed':
			return 'Google sign-in needs an internet connection.';
		case 'auth/popup-blocked':
			return 'The browser blocked the Google pop-up. Allow pop-ups for this site and try again.';
		case 'auth/cancelled-popup-request':
		case 'auth/popup-closed-by-user':
			return 'Google sign-in was closed before it finished. Try again.';
		case 'auth/web-storage-unsupported':
			return 'This browser blocks the local storage Google sign-in needs. Leave private browsing or allow site data, then try again.';
		case 'auth/internal-error':
			return 'Google sign-in could not start. VITE_FIREBASE_AUTH_DOMAIN must be the Firebase auth domain, for example "your-project.firebaseapp.com".';
		default:
			return error instanceof Error ? error.message : 'Google sign-in could not be completed.';
	}
}

function redirectReturnMessage(): string {
	const origin = typeof window === 'undefined' ? 'this site' : window.location.origin;
	return `Google returned without completing the sign-in. Add ${origin} in Firebase Console → Authentication → Settings → Authorized domains, allow site data for this browser, and try again.`;
}

function markPendingRedirect(): void {
	try {
		window.localStorage.setItem(REDIRECT_MARKER_KEY, String(Date.now()));
	} catch {
		// Storage can be unavailable; the marker is a diagnostic aid only.
	}
}

function clearPendingRedirect(): void {
	try {
		window.localStorage.removeItem(REDIRECT_MARKER_KEY);
	} catch {
		// Ignore: nothing to clean up when storage is blocked.
	}
}

function hasFreshPendingRedirect(): boolean {
	try {
		const raw = window.localStorage.getItem(REDIRECT_MARKER_KEY);

		if (!raw) {
			return false;
		}

		const startedAt = Number(raw);

		if (!Number.isFinite(startedAt) || Date.now() - startedAt > REDIRECT_MARKER_MAX_AGE_MS) {
			clearPendingRedirect();
			return false;
		}

		return true;
	} catch {
		return false;
	}
}

function clearRedirectWatchdog(): void {
	if (redirectWatchdog !== undefined) {
		clearTimeout(redirectWatchdog);
		redirectWatchdog = undefined;
	}
}

/** Frees a UI that is stuck on "Opening Google…" without touching the session. */
function releaseStuckRedirect(message: string | null): void {
	clearRedirectWatchdog();
	authState.update((state) =>
		state.status === 'signing-in' ? { ...state, status: 'signed-out', error: message } : state
	);
}

function watchStuckRedirect(): void {
	clearRedirectWatchdog();
	redirectWatchdog = setTimeout(() => {
		redirectWatchdog = undefined;

		if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
			// The browser is already on its way to Google; leave the pending state alone.
			return;
		}

		releaseStuckRedirect('Google sign-in did not open. Check your connection and try again.');
	}, REDIRECT_WATCHDOG_MS);
}

/**
 * Collects the result of a redirect sign-in that this page load may not have
 * observed yet. Returns the message to display when Google came back without a
 * session, instead of leaving the user on a silent loop.
 */
async function completePendingRedirect(auth: Auth): Promise<string | null> {
	const wasPending = hasFreshPendingRedirect();

	let credential: Awaited<ReturnType<typeof getRedirectResult>> = null;

	try {
		credential = await getRedirectResult(auth);
	} catch (error) {
		clearPendingRedirect();
		console.info('[vault:auth] redirect sign-in failed', firebaseErrorCode(error));
		return authErrorMessage(error);
	}

	if (credential?.user || auth.currentUser) {
		clearPendingRedirect();
		return null;
	}

	if (wasPending) {
		clearPendingRedirect();
		console.info('[vault:auth] redirect returned without a session', {
			origin: window.location.origin,
			authDomain: auth.config.authDomain
		});
		return redirectReturnMessage();
	}

	return null;
}

export async function startAuthObserver(): Promise<void> {
	if (authStarted) {
		return;
	}

	authStarted = true;
	authState.set({ status: 'loading', user: null, error: null });

	try {
		const { auth, authPersistenceReady } = getFirebaseClient();
		await authPersistenceReady;

		let redirectError = await completePendingRedirect(auth);
		lastRedirectError = redirectError;

		authUnsubscribe = onAuthStateChanged(
			auth,
			(user) => {
				clearRedirectWatchdog();

				// Every Vault screen needs the account email: it selects the shared
				// vault and it is what the security rules compare against. A session
				// without an email must be an explicit error, never a silent blank
				// screen somewhere further down the render tree.
				const missingEmail = Boolean(user) && !hasUsableAccountEmail(user);

				if (missingEmail) {
					console.info('[vault:auth] signed-in account without an email address', {
						uid: user?.uid,
						provider: user?.providerData?.[0]?.providerId
					});
				}

				authState.set({
					status: missingEmail ? 'error' : user ? 'signed-in' : 'signed-out',
					user: missingEmail ? null : user,
					error: missingEmail
						? 'Your Google account did not provide an email address. Sign in with a Google account that has an email, or tap Sign out and choose another account.'
						: user
							? null
							: redirectError
				});
				redirectError = null;
			},
			(error) => {
				clearRedirectWatchdog();
				authState.set({
					status: 'error',
					user: null,
					error: authErrorMessage(error)
				});
			}
		);

		// Safari and Chrome can restore this page from the back/forward cache
		// instead of reloading it, so a redirect sign-in must be collected again
		// when the user comes back from Google. Without this the page can stay on
		// "Opening Google…" with a disabled button forever.
		if (typeof window !== 'undefined' && pageShowHandler === undefined) {
			pageShowHandler = () => {
				void (async () => {
					const { auth: currentAuth } = getFirebaseClient();
					const restoredError = await completePendingRedirect(currentAuth);

					if (currentAuth.currentUser) {
						return;
					}

					releaseStuckRedirect(
						restoredError ?? lastRedirectError ?? 'Google sign-in was not completed. Try again.'
					);
				})();
			};

			window.addEventListener('pageshow', pageShowHandler);
		}
	} catch (error) {
		authStarted = false;
		clearRedirectWatchdog();
		authState.set({
			status: 'error',
			user: null,
			error: authErrorMessage(error)
		});
	}
}

async function signInWithRedirectFallback(): Promise<void> {
	const { auth, googleProvider } = getFirebaseClient();

	try {
		markPendingRedirect();
		watchStuckRedirect();
		await signInWithRedirect(auth, googleProvider);
	} catch (error) {
		clearRedirectWatchdog();
		clearPendingRedirect();
		authState.update((state) => ({
			...state,
			status: 'signed-out',
			error: authErrorMessage(error)
		}));
	}
}

/**
 * Signs in with a Google pop-up.
 *
 * The pop-up is the reliable path: the result travels back through the pop-up
 * window itself, so sign-in does not depend on the browser letting this site
 * read storage belonging to <project>.firebaseapp.com. Safari, Firefox, and
 * Chrome with third-party cookies blocked refuse that cross-site read, and the
 * full-page redirect then returns with no user and no error. Environments that
 * cannot show a pop-up fall back to the redirect flow automatically.
 */
export async function signInWithGoogle(): Promise<void> {
	const { auth, googleProvider } = getFirebaseClient();
	authState.update((state) => ({ ...state, status: 'signing-in', error: null }));

	try {
		const credential = await signInWithPopup(auth, googleProvider);
		clearPendingRedirect();
		authState.set({ status: 'signed-in', user: credential.user, error: null });
		return;
	} catch (error) {
		const code = firebaseErrorCode(error);

		if (!shouldFallBackToRedirect(error)) {
			console.info('[vault:auth] pop-up sign-in failed', code);
			authState.update((state) => ({
				...state,
				status: 'signed-out',
				error: authErrorMessage(error)
			}));
			return;
		}

		console.info('[vault:auth] pop-up unavailable, using redirect instead', code);
		await signInWithRedirectFallback();
	}
}

export async function signOutOfVault(): Promise<void> {
	const { auth } = getFirebaseClient();
	clearPendingRedirect();
	await signOut(auth);
}

export function stopAuthObserver(): void {
	authUnsubscribe?.();
	authUnsubscribe = undefined;
	authStarted = false;
	clearRedirectWatchdog();

	if (pageShowHandler && typeof window !== 'undefined') {
		window.removeEventListener('pageshow', pageShowHandler);
		pageShowHandler = undefined;
	}
}

export { firebaseErrorCode };
export type { FirebaseError };
