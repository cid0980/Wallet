import type { FirebaseError } from 'firebase/app';
import {
	getRedirectResult,
	onAuthStateChanged,
	signInWithRedirect,
	signOut,
	type Auth,
	type Unsubscribe,
	type User
} from 'firebase/auth';
import { writable } from 'svelte/store';

import { getFirebaseClient } from '$lib/firebase/client';

export type AuthStatus = 'loading' | 'signed-out' | 'signed-in' | 'redirecting' | 'error';

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

let authUnsubscribe: Unsubscribe | undefined;
let authStarted = false;
let redirectWatchdog: ReturnType<typeof setTimeout> | undefined;
let pageShowHandler: (() => void) | undefined;
let lastRedirectError: string | null = null;

function authErrorMessage(error: unknown): string {
	const code = (error as Partial<FirebaseError>)?.code;

	switch (code) {
		case 'auth/unauthorized-domain':
			return 'This site is not authorized in Firebase Authentication. Add its domain in Firebase Console → Authentication → Settings → Authorized domains.';
		case 'auth/operation-not-allowed':
			return 'Google sign-in is not enabled for this Firebase project.';
		case 'auth/invalid-api-key':
			return 'The Firebase web configuration is not valid. Check the VITE_FIREBASE_* values used for this deployment.';
		case 'auth/account-exists-with-different-credential':
			return 'This Google email is already linked to a different sign-in method.';
		case 'auth/network-request-failed':
			return 'Google sign-in needs an internet connection.';
		case 'auth/popup-blocked':
			return 'The browser blocked the Google window. Allow pop-ups for this site and try again.';
		case 'auth/cancelled-popup-request':
		case 'auth/popup-closed-by-user':
			return 'Google sign-in was closed before it finished. Try again.';
		case 'auth/web-storage-unsupported':
			return 'This browser blocks the local storage Google sign-in needs. Leave private browsing or allow site data, then try again.';
		case 'auth/internal-error':
			return 'Google sign-in could not start. VITE_FIREBASE_AUTH_DOMAIN must be the Firebase auth domain (for example "your-project.firebaseapp.com"), not the deployed website URL.';
		default:
			return error instanceof Error ? error.message : 'Google sign-in could not be completed.';
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
		state.status === 'redirecting' ? { ...state, status: 'signed-out', error: message } : state
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
 * observed yet, and remembers the failure message for the next state change.
 */
async function completePendingRedirect(auth: Auth): Promise<string | null> {
	try {
		await getRedirectResult(auth);
		lastRedirectError = null;
		return null;
	} catch (error) {
		lastRedirectError = authErrorMessage(error);
		return lastRedirectError;
	}
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

		authUnsubscribe = onAuthStateChanged(
			auth,
			(user) => {
				clearRedirectWatchdog();
				authState.set({
					status: user ? 'signed-in' : 'signed-out',
					user,
					error: user ? null : redirectError
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

export async function signInWithGoogle(): Promise<void> {
	try {
		const { auth, googleProvider, authPersistenceReady } = getFirebaseClient();
		await authPersistenceReady;
		authState.update((state) => ({ ...state, status: 'redirecting', error: null }));
		watchStuckRedirect();
		await signInWithRedirect(auth, googleProvider);
	} catch (error) {
		clearRedirectWatchdog();
		authState.update((state) => ({
			...state,
			status: 'signed-out',
			error: authErrorMessage(error)
		}));
	}
}

export async function signOutOfVault(): Promise<void> {
	const { auth } = getFirebaseClient();
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
