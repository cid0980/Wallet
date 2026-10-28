import type { FirebaseError } from 'firebase/app';
import {
	collection,
	doc,
	getDoc,
	onSnapshot,
	query,
	serverTimestamp,
	setDoc,
	Timestamp,
	where,
	type DocumentData,
	type QueryDocumentSnapshot,
	type Unsubscribe
} from 'firebase/firestore';

import {
	ACCESS_PROBE_COLLECTION,
	ACCESS_PROBE_DOCUMENT,
	describeAccessProbe
} from '$lib/firebase/access-probe';
import { resolveAccountEmail } from '$lib/firebase/account';
import { getFirebaseClient } from '$lib/firebase/client';
import type { VaultMember, VaultSetupInput, VaultSummary, VaultTotals } from '$lib/types/vault';
import { defaultSpendingTags } from '$lib/types/vault';
import { isValidPaise } from '$lib/utils/money';

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

function asDate(value: unknown): Date | null {
	return value instanceof Timestamp ? value.toDate() : null;
}

function toPaise(value: unknown): number {
	return isValidPaise(value) ? value : 0;
}

function toTagList(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return [...defaultSpendingTags];
	}

	const tags = value
		.filter((entry): entry is string => typeof entry === 'string')
		.map((tag) => tag.trim())
		.filter(Boolean);

	return tags.length ? tags : [...defaultSpendingTags];
}

function toVaultTotals(value: unknown): VaultTotals {
	const totals = value as Partial<VaultTotals> | undefined;
	const partnerA = totals?.a as Partial<VaultTotals['a']> | undefined;
	const partnerB = totals?.b as Partial<VaultTotals['b']> | undefined;

	return {
		earned: toPaise(totals?.earned),
		spent: toPaise(totals?.spent),
		a: {
			received: toPaise(partnerA?.received),
			spent: toPaise(partnerA?.spent)
		},
		b: {
			received: toPaise(partnerB?.received),
			spent: toPaise(partnerB?.spent)
		}
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
		totals: toVaultTotals(data.totals),
		tags: toTagList(data.tags),
		lastMutationId: typeof data.lastMutationId === 'string' ? data.lastMutationId : null,
		createdAt: asDate(data.createdAt),
		updatedAt: asDate(data.updatedAt),
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

/** Creates a vault with zero paise totals. */
export async function createInitialVault(input: VaultSetupInput): Promise<string> {
	const { auth, db } = getFirebaseClient();
	// Resolved from the token as well as the record, matching the sign-in guard.
	const signedInEmail = await resolveAccountEmail(auth.currentUser);
	const name = cleanText(input.name);
	const members = {
		a: cleanMember(input.members.a),
		b: cleanMember(input.members.b)
	};

	if (!signedInEmail) {
		throw new Error('Your account did not provide an email address. Please sign in again.');
	}

	if (!name) {
		throw new Error('Enter a vault name.');
	}

	if (!members.a.name || !members.b.name || !members.a.email || !members.b.email) {
		throw new Error('Enter a name and email for both partners.');
	}

	if (members.a.email.toLocaleLowerCase() === members.b.email.toLocaleLowerCase()) {
		throw new Error('Partner A and Partner B must use different emails.');
	}

	const ownPartner = [members.a, members.b].find(
		(member) => member.email.toLocaleLowerCase() === signedInEmail.toLocaleLowerCase()
	);

	if (!ownPartner) {
		throw new Error('Your signed-in email must be entered as Partner A or Partner B.');
	}

	// Firebase account emails are commonly returned in lower case, and the
	// security rules compare request.auth.token.email character for character.
	// A partner address typed with a capital letter would therefore never match:
	// that partner would be denied, and their membership query would find no
	// vault and offer to create a second one. Store both addresses lower-cased,
	// then restore the signed-in member's exact Auth casing.
	members.a.email = members.a.email.toLocaleLowerCase();
	members.b.email = members.b.email.toLocaleLowerCase();
	ownPartner.email = signedInEmail;

	const vaultRef = doc(collection(db, 'vaults'));

	await setDoc(vaultRef, {
		name,
		createdAt: serverTimestamp(),
		members,
		totals: initialTotals(),
		tags: [...defaultSpendingTags]
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

export interface AccessProbe {
	/** True when an allowed read reached the server. */
	readAllowed: boolean;
	code: string | null;
	detail: string;
}

/**
 * Reads a document that never exists. A missing document returns normally when
 * the rules allow the read, so the result separates "the published rules (or
 * the token claims) deny this account" from "reads work; the vault
 * simply does not exist yet".
 */
export async function probeVaultReadAccess(): Promise<AccessProbe> {
	const { db } = getFirebaseClient();

	try {
		await getDoc(doc(db, ACCESS_PROBE_COLLECTION, ACCESS_PROBE_DOCUMENT));
		return {
			readAllowed: true,
			code: null,
			detail: 'Rules allow this account to read /vaults. Nothing is denying the lookup.'
		};
	} catch (error) {
		const code = (error as Partial<FirebaseError>)?.code ?? 'unknown';
		return { readAllowed: false, code, detail: describeAccessProbe(code) };
	}
}

export function vaultErrorMessage(error: unknown): string {
	const code = (error as Partial<FirebaseError>)?.code;

	switch (code) {
		case 'permission-denied':
			return 'Firestore refused the vault lookup because the published security rules do not match this app. Open Firestore → Rules, paste the current firestore.rules from the repository, and publish it. Sign-in itself is already working.';
		case 'unavailable':
			return 'Firestore is unavailable right now. Check your connection and try again.';
		case 'failed-precondition':
			return 'Offline storage could not be initialized in this browser.';
		default:
			return error instanceof Error ? error.message : 'Something went wrong while accessing the vault.';
	}
}
