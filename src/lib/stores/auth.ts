import type { FirebaseError } from 'firebase/app';
import {
	getRedirectResult,
	onAuthStateChanged,
	signInWithRedirect,
	signOut,
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

let authUnsubscribe: Unsubscribe | undefined;
let authStarted = false;

function authErrorMessage(error: unknown): string {
	const code = (error as Partial<FirebaseError>)?.code;

	switch (code) {
		case 'auth/unauthorized-domain':
			return 'This site is not authorized in Firebase Authentication. Add its domain in Firebase Console → Authentication → Settings.';
		case 'auth/operation-not-allowed':
			return 'Google sign-in is not enabled for this Firebase project.';
		case 'auth/account-exists-with-different-credential':
			return 'This Google email is already linked to a different sign-in method.';
		case 'auth/network-request-failed':
			return 'Google sign-in needs an internet connection.';
		default:
			return error instanceof Error ? error.message : 'Google sign-in could not be completed.';
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

		let redirectError: string | null = null;
		try {
			await getRedirectResult(auth);
		} catch (error) {
			redirectError = authErrorMessage(error);
		}

		authUnsubscribe = onAuthStateChanged(
			auth,
			(user) => {
				authState.set({
					status: user ? 'signed-in' : 'signed-out',
					user,
					error: redirectError
				});
				redirectError = null;
			},
			(error) => {
				authState.set({
					status: 'error',
					user: null,
					error: authErrorMessage(error)
				});
			}
		);
	} catch (error) {
		authStarted = false;
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
		await signInWithRedirect(auth, googleProvider);
	} catch (error) {
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
}
