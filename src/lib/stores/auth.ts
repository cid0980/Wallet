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

import {
	describeAccount,
	formatInspection,
	inspectAccount,
	resolveAccount
} from '$lib/firebase/account';
import { getFirebaseClient } from '$lib/firebase/client';
import { firebaseErrorCode, shouldFallBackToRedirect } from '$lib/firebase/sign-in-strategy';

export type AuthStatus = 'loading' | 'signed-out' | 'signed-in' | 'signing-in' | 'error';

export interface AuthState {
	status: AuthStatus;
	user: User | null;
	/**
	 * The account email Vault signs with. Resolved from the user record, the
	 * linked provider entry, or the ID token claims, and null when the provider
	 * shared none anywhere.
	 */
	email: string | null;
	error: string | null;
	/** What each email source returned, shown when a session cannot be used. */
	diagnostic: string | null;
}

export const authState = writable<AuthState>({
	status: 'loading',
	user: null,
	email: null,
	error: null,
	diagnostic: null
});

/**
 * A rejected session leaves a notice behind for the sign-in screen. The
 * sign-out that follows fires the auth listener, so the notice has to outlive
 * that one state change without being wiped by it.
 */
let pendingNotice: string | null = null;
let pendingDiagnostic: string | null = null;

/**
 * If the browser never actually leaves the page for Google (blocked redirect,
 * unreachable auth handler, flaky network) the button would otherwise stay on
 * "Opening Google…" forever, with no way to retry.
 */
const REDIRECT_WATCHDOG_MS = 12_000;

/**
 * Written just before a full-page redirect and read when the page comes back.
 * Without it, a redirect that returns with no session and no error is
 * indistinguishable from a plain first page load.
 */
const REDIRECT_MARKER_KEY = 'vault.auth.pending-redirect';
const REDIRECT_MARKER_MAX_AGE_MS = 10 * 60_000;

const NO_EMAIL_MESSAGE =
	'Google did not share an email address for this account, and Vault needs it to find your shared vault. Try Continue with Google again so the email scope is requested. If it repeats, check Firebase Console → Authentication → Settings → User actions → Email enumeration protection, and make sure Google sign-in is the provider you use.';

/**
 * The account is identifiable, but its ID token carries no email claim, so the
 * published rules (which require request.auth.token.email) deny every read.
 * This happens to accounts created while the app did not request the email
 * scope. Deleting the account in the console and signing in again creates a
 * clean record; the token is force-refreshed once before this is shown.
 */
const NO_TOKEN_EMAIL_MESSAGE =
	'Google returned your email, but Firebase did not put it in this account: the account record and its sign-in token both have no email, and the published rules require one. Turn off Firebase Console → Authentication → Settings → User actions → Email enumeration protection, delete this account in Authentication → Users, then sign in again.';

let authUnsubscribe: Unsubscribe | undefined;
let authStarted = false;
let redirectWatchdog: ReturnType<typeof setTimeout> | undefined;
let pageShowHandler: (() => void) | undefined;
let lastRedirectError: string | null = null;

/**
 * Every auth outcome goes through here, so the pop-up path, the redirect path,
 * and the session listener can never disagree about who is signed in.
 */
let authSequence = 0;

async function applyUser(user: User | null, redirectError: string | null): Promise<void> {
	const sequence = ++authSequence;

	if (!user) {
		if (sequence === authSequence) {
			authState.set({
				status: 'signed-out',
				user: null,
				email: null,
				error: redirectError ?? pendingNotice,
				diagnostic: redirectError ? null : pendingDiagnostic
			});
		}
		return;
	}

	const { email, tokenEmail } = await resolveAccount(user);

	if (sequence !== authSequence) {
		// A newer auth event superseded this one.
		return;
	}

	if (!email || !tokenEmail) {
		const inspection = await inspectAccount(user);
		const diagnostic = formatInspection(inspection);
		const message = email && !tokenEmail ? NO_TOKEN_EMAIL_MESSAGE : NO_EMAIL_MESSAGE;
		console.info('[vault:auth] signed-in account has no usable email address', {
			account: describeAccount(user),
			identifiedBy: email ? 'record or provider, but the token carries no email claim' : 'nothing',
			inspection
		});

		pendingNotice = message;
		pendingDiagnostic = diagnostic;
		authState.set({
			status: 'error',
			user: null,
			email: null,
			error: message,
			diagnostic
		});

		// Clear the unusable session from this device so the next attempt starts
		// clean instead of restoring the same account on every load.
		try {
			await signOutFromAuth();
		} catch {
			// Signing out is best effort; the notice above is already on screen.
		}
		return;
	}

	pendingNotice = null;
	pendingDiagnostic = null;
	authState.set({ status: 'signed-in', user, email, error: null, diagnostic: null });
}

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
	authState.set({ status: 'loading', user: null, email: null, error: null, diagnostic: null });

	try {
		const { auth, authPersistenceReady } = getFirebaseClient();
		await authPersistenceReady;

		let redirectError = await completePendingRedirect(auth);
		lastRedirectError = redirectError;

		authUnsubscribe = onAuthStateChanged(
			auth,
			(user) => {
				clearRedirectWatchdog();
				void applyUser(user, redirectError);
				redirectError = null;
			},
			(error) => {
				clearRedirectWatchdog();
				authState.set({
					status: 'error',
					user: null,
					email: null,
					error: authErrorMessage(error),
					diagnostic: null
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
						await applyUser(currentAuth.currentUser, restoredError);
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
			email: null,
			error: authErrorMessage(error),
			diagnostic: null
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
	pendingNotice = null;
	pendingDiagnostic = null;
	authState.update((state) => ({ ...state, status: 'signing-in', error: null, diagnostic: null }));

	try {
		const credential = await signInWithPopup(auth, googleProvider);
		clearPendingRedirect();
		// Routed through the same guard as every other outcome: the pop-up path
		// used to accept a user with no email and leave the app stuck.
		await applyUser(credential.user, null);
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

async function signOutFromAuth(): Promise<void> {
	const { auth } = getFirebaseClient();
	await signOut(auth);
}

export async function signOutOfVault(): Promise<void> {
	clearPendingRedirect();
	await signOutFromAuth();
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
