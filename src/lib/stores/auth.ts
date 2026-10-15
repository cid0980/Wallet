import type { FirebaseError } from 'firebase/app';
import {
	createUserWithEmailAndPassword,
	onAuthStateChanged,
	signInWithEmailAndPassword,
	signOut,
	type Auth,
	type Unsubscribe,
	type User
} from 'firebase/auth';
import { writable } from 'svelte/store';

import { emailFromClaims, formatInspection, inspectAccount } from '$lib/firebase/account';
import { getFirebaseClient } from '$lib/firebase/client';

export type AuthStatus = 'loading' | 'signed-out' | 'signed-in' | 'signing-in' | 'error';

export interface AuthState {
	status: AuthStatus;
	user: User | null;
	/** The account email, which is also the vault member identifier. */
	email: string | null;
	error: string | null;
	/** What the token carried, shown when a session cannot be used. */
	diagnostic: string | null;
}

export const authState = writable<AuthState>({
	status: 'loading',
	user: null,
	email: null,
	error: null,
	diagnostic: null
});

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
			authState.set({ status: 'signed-out', user: null, email: null, error: notice, diagnostic: null });
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
			diagnostic: formatInspection(inspection)
		});

		try {
			await signOutFromAuth();
		} catch {
			// Best effort: the notice above is already on screen.
		}
		return;
	}

	authState.set({ status: 'signed-in', user, email, error: null, diagnostic: null });
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
	authState.set({ status: 'loading', user: null, email: null, error: null, diagnostic: null });

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
			diagnostic: null
		});
	}
}

async function runCredentialFlow(
	flow: (auth: Auth) => Promise<{ user: User }>
): Promise<void> {
	authState.update((state) => ({ ...state, status: 'signing-in', error: null, diagnostic: null }));

	try {
		const { auth } = getFirebaseClient();
		const credential = await flow(auth);
		await applyUser(credential.user, null);
	} catch (error) {
		console.info('[vault:auth] credential flow failed', (error as Partial<FirebaseError>)?.code);
		authState.update((state) => ({
			...state,
			status: 'signed-out',
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
	await runCredentialFlow((auth) => createUserWithEmailAndPassword(auth, address, password));
}

export async function signOutOfVault(): Promise<void> {
	await signOutFromAuth();
}

export function stopAuthObserver(): void {
	authUnsubscribe?.();
	authUnsubscribe = undefined;
	authStarted = false;
}
