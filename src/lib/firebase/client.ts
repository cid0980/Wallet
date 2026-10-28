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
	setPersistence,
	type Auth
} from 'firebase/auth';
import {
	clearIndexedDbPersistence,
	getFirestore,
	initializeFirestore,
	persistentLocalCache,
	persistentMultipleTabManager,
	terminate,
	waitForPendingWrites,
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

/** Deep link to this project's Authentication users table. */
export function authUsersConsoleUrl(): string | null {
	const projectId = firebaseProjectId();
	return projectId
		? `https://console.firebase.google.com/project/${projectId}/authentication/users`
		: null;
}

/** Deep link to this project's Authentication settings, where the email
 *  enumeration protection switch lives (Settings → User actions). */
export function authSettingsConsoleUrl(): string | null {
	const projectId = firebaseProjectId();
	return projectId
		? `https://console.firebase.google.com/project/${projectId}/authentication/settings`
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
		authPersistenceReady: setPersistence(auth, browserLocalPersistence)
	};

	return firebaseClient;
}

/** Raised when unsent offline writes did not reach the server in time. */
export class PendingWritesTimeoutError extends Error {
	constructor() {
		super('Some changes have not synced yet, so local data was kept. Reconnect, wait for “Synced”, then try again.');
		this.name = 'PendingWritesTimeoutError';
	}
}

/**
 * Waits for queued writes to be acknowledged, but never forever: offline,
 * `waitForPendingWrites` simply never resolves, and the caller must not
 * erase the only copy of unsent records.
 */
export async function waitForPendingWritesWithTimeout(db: Firestore, timeoutMs = 8000): Promise<void> {
	let timer: ReturnType<typeof setTimeout> | undefined;

	try {
		await Promise.race([
			waitForPendingWrites(db),
			new Promise<never>((_resolve, reject) => {
				timer = setTimeout(() => reject(new PendingWritesTimeoutError()), timeoutMs);
			})
		]);
	} finally {
		clearTimeout(timer);
	}
}

/**
 * Removes this browser's Firestore cache: terminate the running instance,
 * then clear its IndexedDB persistence (the only order Firebase allows).
 *
 * The cache is *not* encrypted by Vault, so this is the privacy-critical
 * path for shared devices. It can fail with `failed-precondition` while
 * another tab still holds the multi-tab cache open; callers should say so.
 * After termination the instance is unusable, so callers reload the page.
 */
export async function terminateAndClearFirestoreCache(db: Firestore): Promise<void> {
	await terminate(db);
	await clearIndexedDbPersistence(db);
	firebaseClient = undefined;
}
