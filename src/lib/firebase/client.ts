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
