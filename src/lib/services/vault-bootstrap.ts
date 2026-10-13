import type { FirebaseError } from 'firebase/app';
import {
	collection,
	doc,
	onSnapshot,
	query,
	serverTimestamp,
	setDoc,
	where,
	type DocumentData,
	type QueryDocumentSnapshot,
	type Unsubscribe
} from 'firebase/firestore';

import { getFirebaseClient } from '$lib/firebase/client';
import type { VaultMember, VaultSetupInput, VaultSummary, VaultTotals } from '$lib/types/vault';

export interface VaultMembershipResult {
	vaults: VaultSummary[];
	fromCache: boolean;
}

function cleanText(value: string): string {
	return value.trim();
}

function cleanMember(member: VaultMember): VaultMember {
	return {
		name: cleanText(member.name),
		email: cleanText(member.email)
	};
}

function toVaultMember(value: unknown): VaultMember {
	const member = value as Partial<VaultMember> | undefined;

	return {
		name: typeof member?.name === 'string' ? member.name : 'Unknown partner',
		email: typeof member?.email === 'string' ? member.email : ''
	};
}

function toVaultSummary(snapshot: QueryDocumentSnapshot<DocumentData>): VaultSummary {
	const data = snapshot.data();
	const members = data.members as { a?: unknown; b?: unknown } | undefined;

	return {
		id: snapshot.id,
		name: typeof data.name === 'string' ? data.name : 'Untitled vault',
		members: {
			a: toVaultMember(members?.a),
			b: toVaultMember(members?.b)
		},
		fromCache: snapshot.metadata.fromCache,
		pendingWrites: snapshot.metadata.hasPendingWrites
	};
}

function initialTotals(): VaultTotals {
	return {
		earned: 0,
		spent: 0,
		a: {
			received: 0,
			spent: 0
		},
		b: {
			received: 0,
			spent: 0
		}
	};
}

/**
 * Creates a vault with zero paise totals. Payments and expenses are deliberately
 * not handled here; their batched write data layer is implemented in Step 3.
 */
export async function createInitialVault(input: VaultSetupInput): Promise<string> {
	const { auth, db } = getFirebaseClient();
	const signedInEmail = auth.currentUser?.email?.trim();
	const name = cleanText(input.name);
	const members = {
		a: cleanMember(input.members.a),
		b: cleanMember(input.members.b)
	};

	if (!signedInEmail) {
		throw new Error('Your Google account did not provide an email address. Please choose another account.');
	}

	if (!name) {
		throw new Error('Enter a vault name.');
	}

	if (!members.a.name || !members.b.name || !members.a.email || !members.b.email) {
		throw new Error('Enter a name and Google email for both partners.');
	}

	if (members.a.email.toLocaleLowerCase() === members.b.email.toLocaleLowerCase()) {
		throw new Error('Partner A and Partner B must use different Google emails.');
	}

	if (signedInEmail !== members.a.email && signedInEmail !== members.b.email) {
		throw new Error('Your signed-in Google email must be entered as Partner A or Partner B.');
	}

	const vaultRef = doc(collection(db, 'vaults'));

	await setDoc(vaultRef, {
		name,
		createdAt: serverTimestamp(),
		members,
		totals: initialTotals()
	});

	return vaultRef.id;
}

/**
 * Fires from Firestore's local persistent cache first when available, then
 * automatically reconciles with the server. Two constrained queries preserve
 * the member-only security rule and avoid a broad vault collection query.
 */
export function subscribeToVaultMembership(
	email: string,
	onResult: (result: VaultMembershipResult) => void,
	onError: (error: unknown) => void
): Unsubscribe {
	const { db } = getFirebaseClient();
	const vaults = collection(db, 'vaults');
	const aVaults = new Map<string, VaultSummary>();
	const bVaults = new Map<string, VaultSummary>();
	let aFromCache = true;
	let bFromCache = true;

	const emit = () => {
		const merged = new Map<string, VaultSummary>([...aVaults, ...bVaults]);
		onResult({
			vaults: [...merged.values()],
			fromCache: aFromCache && bFromCache
		});
	};

	const unsubscribeA = onSnapshot(
		query(vaults, where('members.a.email', '==', email)),
		(snapshot) => {
			aVaults.clear();
			for (const documentSnapshot of snapshot.docs) {
				aVaults.set(documentSnapshot.id, toVaultSummary(documentSnapshot));
			}
			aFromCache = snapshot.metadata.fromCache;
			emit();
		},
		onError
	);

	const unsubscribeB = onSnapshot(
		query(vaults, where('members.b.email', '==', email)),
		(snapshot) => {
			bVaults.clear();
			for (const documentSnapshot of snapshot.docs) {
				bVaults.set(documentSnapshot.id, toVaultSummary(documentSnapshot));
			}
			bFromCache = snapshot.metadata.fromCache;
			emit();
		},
		onError
	);

	return () => {
		unsubscribeA();
		unsubscribeB();
	};
}

export function vaultErrorMessage(error: unknown): string {
	const code = (error as Partial<FirebaseError>)?.code;

	switch (code) {
		case 'permission-denied':
			return 'Vault access was denied. Deploy the bootstrap Firestore rules before testing setup.';
		case 'unavailable':
			return 'Firestore is unavailable right now. Check your connection and try again.';
		case 'failed-precondition':
			return 'Offline storage could not be initialized in this browser.';
		default:
			return error instanceof Error ? error.message : 'Something went wrong while accessing the vault.';
	}
}
