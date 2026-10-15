import { browser } from '$app/environment';
import {
	getApp,
	getApps,
	initializeApp,
	type FirebaseApp,
	type FirebaseOptions
} from 'firebase/app';
import {
	browserLocalPersistence,
	getAuth,
	GoogleAuthProvider,
	setPersistence,
	type Auth
} from 'firebase/auth';
import {
	getFirestore,
	initializeFirestore,
	persistentLocalCache,
	persistentMultipleTabManager,
	type Firestore
} from 'firebase/firestore';

import { normalizeAuthDomain } from '$lib/firebase/auth-domain';

const firebaseEnvKeys = [
	'VITE_FIREBASE_API_KEY',
	'VITE_FIREBASE_AUTH_DOMAIN',
	'VITE_FIREBASE_PROJECT_ID',
	'VITE_FIREBASE_APP_ID',
	'VITE_FIREBASE_MESSAGING_SENDER_ID'
] as const;

type FirebaseEnvKey = (typeof firebaseEnvKeys)[number];

export interface FirebaseClient {
	app: FirebaseApp;
	auth: Auth;
	db: Firestore;
	googleProvider: GoogleAuthProvider;
	authPersistenceReady: Promise<void>;
}

let firebaseClient: FirebaseClient | undefined;

function requiredEnv(key: FirebaseEnvKey): string {
	const value = import.meta.env[key];

	if (!value) {
		throw new Error(`Missing required Firebase configuration: ${key}`);
	}

	return value;
}

/**
 * The configured project id, or null when the app is running without Firebase
 * configuration (for example inside the render harness).
 */
export function firebaseProjectId(): string | null {
	try {
		return requiredEnv('VITE_FIREBASE_PROJECT_ID');
	} catch {
		return null;
	}
}

/** Deep link straight to this project's Firestore rules editor. */
export function firestoreRulesConsoleUrl(): string | null {
	const projectId = firebaseProjectId();
	return projectId
		? `https://console.firebase.google.com/project/${projectId}/firestore/rules`
		: null;
}

/** The published rule set this app is built for. */
export const FIRESTORE_RULES_FILE_URL =
	'https://raw.githubusercontent.com/cid0980/Wallet/main/firestore.rules';

function firebaseOptions(): FirebaseOptions {
	const projectId = requiredEnv('VITE_FIREBASE_PROJECT_ID');

	return {
		apiKey: requiredEnv('VITE_FIREBASE_API_KEY'),
		authDomain: normalizeAuthDomain(requiredEnv('VITE_FIREBASE_AUTH_DOMAIN'), projectId),
		projectId,
		appId: requiredEnv('VITE_FIREBASE_APP_ID'),
		messagingSenderId: requiredEnv('VITE_FIREBASE_MESSAGING_SENDER_ID')
	};
}

/**
 * Creates the only Firebase client used by the browser app.
 *
 * Firestore persistence must be configured before any call to getFirestore().
 * The duplicate-initialization fallback only covers Vite hot-module replacement;
 * every normal Vault startup uses the persistent multi-tab IndexedDB cache.
 */
export function getFirebaseClient(): FirebaseClient {
	if (!browser) {
		throw new Error('Firebase is available only in the browser.');
	}

	if (firebaseClient) {
		return firebaseClient;
	}

	const app = getApps().length > 0 ? getApp() : initializeApp(firebaseOptions());
	const auth = getAuth(app);
	const googleProvider = new GoogleAuthProvider();
	// The SDK's GoogleAuthProvider requests only the "profile" scope by default.
	// Without an explicit "email" scope Google may return an ID token with no
	// email claim, which creates a Firebase user whose identifier is empty and
	// leaves Vault nothing to find a shared vault with. Both scopes are
	// non-sensitive and need no extra Google verification.
	googleProvider.addScope('email');
	googleProvider.addScope('profile');
	googleProvider.setCustomParameters({ prompt: 'select_account' });

	let db: Firestore;

	try {
		db = initializeFirestore(app, {
			localCache: persistentLocalCache({
				tabManager: persistentMultipleTabManager()
			})
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : '';

		if (!message.includes('already been initialized')) {
			throw error;
		}

		// Vite can retain the existing Firestore instance during hot replacement.
		db = getFirestore(app);
	}

	firebaseClient = {
		app,
		auth,
		db,
		googleProvider,
		authPersistenceReady: setPersistence(auth, browserLocalPersistence)
	};

	return firebaseClient;
}
