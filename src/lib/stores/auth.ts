import type { FirebaseError } from 'firebase/app';
import {
	createUserWithEmailAndPassword,
	onAuthStateChanged,
	reload,
	sendEmailVerification,
	sendPasswordResetEmail,
	signInWithEmailAndPassword,
	signOut,
	type Auth,
	type Unsubscribe,
	type User
} from 'firebase/auth';
import { get, writable } from 'svelte/store';

import { emailFromClaims, formatInspection, inspectAccount } from '$lib/firebase/account';
import {
	PendingWritesTimeoutError,
	getFirebaseClient,
	terminateAndClearFirestoreCache,
	waitForPendingWritesWithTimeout
} from '$lib/firebase/client';

export type AuthStatus =
	| 'loading'
	| 'signed-out'
	| 'signed-in'
	| 'signing-in'
	| 'needs-verification'
	| 'error';

export interface AuthState {
	status: AuthStatus;
	user: User | null;
	/** The account email, which is also the vault member identifier. */
	email: string | null;
	error: string | null;
	/** Reassuring next-step copy (reset link sent, local data removed…), shown as a status, not an error. */
	notice: string | null;
	/** What the token carried, shown when a session cannot be used. */
	diagnostic: string | null;
}

export const authState = writable<AuthState>({
	status: 'loading',
	user: null,
	email: null,
	error: null,
	notice: null,
	diagnostic: null
});

/**
 * "Sign out and clear local data" ends in a page reload (the terminated
 * Firestore instance cannot be reused). The outcome is parked in
 * sessionStorage so the sign-in screen after the reload can say what
 * happened instead of leaving the user guessing.
 */
const LOCAL_DATA_NOTICE_KEY = 'vault:local-data-notice';
const PAGE_LOADED_AT = Date.now();

function parkLocalDataNotice(message: string): void {
	try {
		sessionStorage.setItem(LOCAL_DATA_NOTICE_KEY, JSON.stringify({ message, at: Date.now() }));
	} catch {
		// Storage may be unavailable (private mode); the reload still happens.
	}
}

function takeLocalDataNotice(): string | null {
	try {
		const raw = sessionStorage.getItem(LOCAL_DATA_NOTICE_KEY);
		if (!raw) {
			return null;
		}

		const parked = JSON.parse(raw) as { message?: unknown; at?: unknown };

		// Only a later page load may consume the notice. The sign-out that
		// precedes the reload also fires the auth listener in *this* page,
		// and it must not eat the message before the reload happens.
		if (typeof parked.at !== 'number' || parked.at >= PAGE_LOADED_AT) {
			return null;
		}

		sessionStorage.removeItem(LOCAL_DATA_NOTICE_KEY);
		return typeof parked.message === 'string' ? parked.message : null;
	} catch {
		return null;
	}
}

let authUnsubscribe: Unsubscribe | undefined;
let authStarted = false;
let authSequence = 0;

function authErrorMessage(error: unknown): string {
	const code = (error as Partial<FirebaseError>)?.code;

	switch (code) {
		case 'auth/invalid-credential':
		case 'auth/wrong-password':
		case 'auth/user-not-found':
			return 'That email and password do not match an account. Check them, or create the account first.';
		case 'auth/invalid-email':
			return 'That email address is not valid.';
		case 'auth/email-already-in-use':
			return 'An account already exists for that email. Use Sign in instead.';
		case 'auth/weak-password':
			return 'Choose a password with at least 8 characters.';
		case 'auth/too-many-requests':
			return 'Too many attempts. Wait a few minutes and try again.';
		case 'auth/network-request-failed':
			return 'Sign-in needs an internet connection.';
		case 'auth/operation-not-allowed':
			return 'Email/password sign-in is not enabled in Firebase Console → Authentication → Sign-in method.';
		case 'auth/invalid-api-key':
			return 'The Firebase web configuration is not valid for this deployment.';
		default:
			return error instanceof Error ? error.message : 'Sign-in could not be completed.';
	}
}

/** One funnel for every outcome, so no path can leave the app half signed in. */
async function applyUser(user: User | null, notice: string | null): Promise<void> {
	const sequence = ++authSequence;

	if (!user) {
		if (sequence === authSequence) {
			authState.set({
				status: 'signed-out',
				user: null,
				email: null,
				error: notice,
				notice: takeLocalDataNotice(),
				diagnostic: null
			});
		}
		return;
	}

	// Email/password accounts always carry an email on the record and in the
	// token. Read the token too, because the rules compare that claim.
	let tokenEmail: string | null = null;

	try {
		const token = await user.getIdTokenResult();
		tokenEmail = emailFromClaims(token.claims as Record<string, unknown> | undefined);
	} catch {
		tokenEmail = null;
	}

	if (sequence !== authSequence) {
		return;
	}

	const email = (user.email ?? '').trim() || tokenEmail;

	if (!email) {
		const inspection = await inspectAccount(user);
		authState.set({
			status: 'error',
			user: null,
			email: null,
			error:
				'This account has no email address, so Vault cannot match it to the shared vault. Delete it in Firebase Console → Authentication → Users and create it again with an email and password.',
			notice: null,
			diagnostic: formatInspection(inspection)
		});

		try {
			await signOutFromAuth();
		} catch {
			// Best effort: the notice above is already on screen.
		}
		return;
	}

	// The Firestore rules require email_verified == true: membership is an
	// email address, and verification is what proves this account owns that
	// inbox. Hold unverified accounts on the verification screen — signed in,
	// so resend and "I've verified" actions work — instead of letting every
	// vault read fail with a rules error.
	if (!user.emailVerified) {
		authState.set({
			status: 'needs-verification',
			user,
			email,
			error: null,
			notice: notice ?? `Confirm ${email} to open your vault. If a verification link is already in that inbox, open it — otherwise resend one below — then tap “I’ve verified”.`,
			diagnostic: null
		});
		return;
	}

	authState.set({ status: 'signed-in', user, email, error: null, notice: null, diagnostic: null });
}

async function signOutFromAuth(): Promise<void> {
	const { auth } = getFirebaseClient();
	await signOut(auth);
}

export async function startAuthObserver(): Promise<void> {
	if (authStarted) {
		return;
	}

	authStarted = true;
	authState.set({ status: 'loading', user: null, email: null, error: null, notice: null, diagnostic: null });

	try {
		const { auth, authPersistenceReady } = getFirebaseClient();
		await authPersistenceReady;

		authUnsubscribe = onAuthStateChanged(
			auth,
			(user) => {
				void applyUser(user, null);
			},
			(error) => {
				authState.set({
					status: 'error',
					user: null,
					email: null,
					error: authErrorMessage(error),
					notice: null,
					diagnostic: null
				});
			}
		);
	} catch (error) {
		authStarted = false;
		authState.set({
			status: 'error',
			user: null,
			email: null,
			error: authErrorMessage(error),
			notice: null,
			diagnostic: null
		});
	}
}

async function runCredentialFlow(
	flow: (auth: Auth) => Promise<{ user: User }>,
	afterSignIn?: (user: User) => Promise<string | null>
): Promise<void> {
	authState.update((state) => ({ ...state, status: 'signing-in', error: null, notice: null, diagnostic: null }));

	try {
		const { auth } = getFirebaseClient();
		const credential = await flow(auth);
		const notice = afterSignIn ? await afterSignIn(credential.user) : null;
		await applyUser(credential.user, notice);
	} catch (error) {
		console.info('[vault:auth] credential flow failed', (error as Partial<FirebaseError>)?.code);
		authState.update((state) => ({
			...state,
			status: 'signed-out',
			notice: null,
			error: authErrorMessage(error)
		}));
	}
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
	const address = email.trim();
	await runCredentialFlow((auth) => signInWithEmailAndPassword(auth, address, password));
}

export async function createAccountWithEmail(email: string, password: string): Promise<void> {
	const address = email.trim();
	await runCredentialFlow(
		(auth) => createUserWithEmailAndPassword(auth, address, password),
		// A brand-new password account is unverified, and the rules require a
		// verified email. Send the link immediately so the verification screen
		// is a single tap away from done. A send failure (rate limit, network)
		// must not strand the account: the screen offers Resend.
		async (user) => {
			try {
				await sendEmailVerification(user);
				return `Account created. We sent a verification link to ${address} — open it, then tap “I’ve verified”.`;
			} catch (error) {
				console.info('[vault:auth] verification email failed', (error as Partial<FirebaseError>)?.code);
				return 'Account created, but the verification email could not be sent just now. Use Resend below.';
			}
		}
	);
}

/** Resends the verification email for the account held on the verification screen. */
export async function resendVerificationEmail(): Promise<void> {
	const { user, email } = get(authState);
	if (!user) {
		return;
	}

	if (user.emailVerified) {
		await applyUser(user, null);
		return;
	}

	try {
		await sendEmailVerification(user);
		authState.update((state) => ({
			...state,
			error: null,
			notice: `Verification link sent again to ${email ?? user.email ?? 'your inbox'}. Check spam if it does not arrive in a minute.`
		}));
	} catch (error) {
		authState.update((state) => ({ ...state, notice: null, error: authErrorMessage(error) }));
	}
}

/**
 * Re-reads the account after the user clicks the email link. Verification
 * happens outside the app, so nothing fires here on its own: reload the
 * user record, then force a fresh ID token so the `email_verified` claim
 * the Firestore rules read is updated before any vault query runs.
 */
export async function checkEmailVerified(): Promise<void> {
	const { user } = get(authState);
	if (!user) {
		return;
	}

	authState.update((state) => ({ ...state, error: null, notice: 'Checking…', }));

	try {
		await reload(user);
	} catch (error) {
		// A failed refresh must not sign anyone out; the session is still valid.
		authState.update((state) => ({ ...state, notice: null, error: authErrorMessage(error) }));
		return;
	}

	if (!user.emailVerified) {
		authState.update((state) => ({
			...state,
			notice: null,
			error: 'That link has not been used yet. Open the newest verification email and tap its link, then check again.'
		}));
		return;
	}

	try {
		await user.getIdToken(true);
	} catch {
		// The next natural token refresh also carries the claim; proceed and
		// let the vault lookup surface any real problem.
	}

	await applyUser(user, null);
}

/**
 * Sends a password-reset link. The response copy is deliberately identical
 * whether or not an account exists for the address, so the form cannot be
 * used to probe which emails have accounts.
 */
export async function sendVaultPasswordReset(email: string): Promise<void> {
	const address = email.trim();
	const generic = `If an account exists for ${address}, a password-reset link is on its way. Check your inbox (and spam).`;

	authState.update((state) => ({ ...state, status: 'signing-in', error: null, notice: null }));

	try {
		const { auth } = getFirebaseClient();
		await sendPasswordResetEmail(auth, address);
		authState.update((state) => ({ ...state, status: 'signed-out', notice: generic }));
	} catch (error) {
		const code = (error as Partial<FirebaseError>)?.code;
		if (code === 'auth/user-not-found' || code === 'auth/invalid-credential') {
			authState.update((state) => ({ ...state, status: 'signed-out', notice: generic }));
			return;
		}
		authState.update((state) => ({
			...state,
			status: 'signed-out',
			error: authErrorMessage(error)
		}));
	}
}

export type SignOutMode = 'keep' | 'clear';

/**
 * Signs out. In `keep` mode the offline Firestore cache stays in this
 * browser (fast, offline-friendly, and disclosed in Settings). In `clear`
 * mode the cache is erased after sign-out — the right choice on a shared
 * device — but only once every queued write is safely on the server:
 * clearing persistence would otherwise delete unsent records. When writes
 * cannot sync in time, nothing is signed out or erased and the caller
 * explains why. Erasing requires terminating Firestore, so a successful
 * (or attempted) clear finishes with a page reload.
 */
export async function signOutOfVault(mode: SignOutMode = 'keep'): Promise<void> {
	if (mode === 'keep') {
		await signOutFromAuth();
		return;
	}

	const { auth, db } = getFirebaseClient();
	await waitForPendingWritesWithTimeout(db);
	await signOut(auth);

	try {
		await terminateAndClearFirestoreCache(db);
		parkLocalDataNotice('Signed out. The offline copy of your vault was removed from this browser.');
	} catch (error) {
		console.info('[vault:auth] local data clear failed', (error as Partial<FirebaseError>)?.code);
		parkLocalDataNotice(
			'Signed out. The offline copy could not be removed — close any other Vault tabs, sign in again, and use “Sign out and clear local data”, or clear this site’s data in your browser settings.'
		);
	}

	window.location.reload();
}

export { PendingWritesTimeoutError };

export function stopAuthObserver(): void {
	authUnsubscribe?.();
	authUnsubscribe = undefined;
	authStarted = false;
}
