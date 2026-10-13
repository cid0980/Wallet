import type { FirebaseError } from 'firebase/app';
import {
	collection,
	doc,
	increment,
	onSnapshot,
	orderBy,
	query,
	serverTimestamp,
	setDoc,
	Timestamp,
	updateDoc,
	writeBatch,
	type DocumentData,
	type QueryDocumentSnapshot,
	type Unsubscribe
} from 'firebase/firestore';

import { getFirebaseClient } from '$lib/firebase/client';
import type {
	ClientInput,
	ClientRecord,
	ExpenseInput,
	ExpenseRecord,
	MutationDelta,
	MutationKind,
	PartnerKey,
	PaymentInput,
	PaymentRecord,
	VaultDataSnapshot,
	VaultMutation,
	VaultSummary,
	VaultTotals
} from '$lib/types/vault';
import { expenseCategories } from '$lib/types/vault';
import { formatPaise, isValidPaise } from '$lib/utils/money';
import { isDateKey } from '$lib/utils/dates';

const MAX_TEXT_LENGTH = 1_000;
const MAX_NAME_LENGTH = 120;
const MAX_CONTACT_LENGTH = 320;

function asString(value: unknown, fallback = ''): string {
	return typeof value === 'string' ? value : fallback;
}

function asBoolean(value: unknown, fallback = false): boolean {
	return typeof value === 'boolean' ? value : fallback;
}

function asPaise(value: unknown): number {
	return isValidPaise(value) ? value : 0;
}

function asDate(value: unknown): Date | null {
	return value instanceof Timestamp ? value.toDate() : null;
}

function asPartner(value: unknown): PartnerKey {
	return value === 'b' ? 'b' : 'a';
}

function asExpenseCategory(value: unknown): ExpenseRecord['category'] {
	return expenseCategories.includes(value as ExpenseRecord['category'])
		? (value as ExpenseRecord['category'])
		: 'Other';
}

function cleanText(value: string, maximum: number): string {
	return value.trim().replace(/\s+/g, ' ').slice(0, maximum);
}

function assertText(value: string, label: string, maximum = MAX_TEXT_LENGTH, required = false): string {
	const clean = cleanText(value, maximum);

	if (required && !clean) {
		throw new Error(`Enter ${label}.`);
	}

	return clean;
}

function assertDate(value: string): string {
	if (!isDateKey(value)) {
		throw new Error('Choose a valid date.');
	}

	return value;
}

function assertPartner(value: PartnerKey): PartnerKey {
	if (value !== 'a' && value !== 'b') {
		throw new Error('Choose which partner received or paid this amount.');
	}

	return value;
}

function assertPositivePaise(value: number): number {
	if (!isValidPaise(value) || value <= 0) {
		throw new Error('Enter an amount greater than ₹0.');
	}

	return value;
}

function assertActorEmail(actorEmail: string): string {
	const email = actorEmail.trim();

	if (!email) {
		throw new Error('Your Google account did not provide an email address.');
	}

	return email;
}

function emptyDelta(): MutationDelta {
	return {
		earned: 0,
		spent: 0,
		aReceived: 0,
		bReceived: 0,
		aSpent: 0,
		bSpent: 0
	};
}

function paymentDelta(before: PaymentRecord | null, after: PaymentInput | null): MutationDelta {
	const delta = emptyDelta();
	const previousAmount = before?.amountPaise ?? 0;
	const nextAmount = after?.amountPaise ?? 0;
	const previousPartner = before?.partner;
	const nextPartner = after?.partner;

	delta.earned = nextAmount - previousAmount;
	delta.aReceived = (nextPartner === 'a' ? nextAmount : 0) - (previousPartner === 'a' ? previousAmount : 0);
	delta.bReceived = (nextPartner === 'b' ? nextAmount : 0) - (previousPartner === 'b' ? previousAmount : 0);
	return delta;
}

function expenseDelta(before: ExpenseRecord | null, after: ExpenseInput | null): MutationDelta {
	const delta = emptyDelta();
	const previousAmount = before?.amountPaise ?? 0;
	const nextAmount = after?.amountPaise ?? 0;
	const previousPartner = before?.partner;
	const nextPartner = after?.partner;

	delta.spent = nextAmount - previousAmount;
	delta.aSpent = (nextPartner === 'a' ? nextAmount : 0) - (previousPartner === 'a' ? previousAmount : 0);
	delta.bSpent = (nextPartner === 'b' ? nextAmount : 0) - (previousPartner === 'b' ? previousAmount : 0);
	return delta;
}

function cleanPaymentInput(input: PaymentInput): PaymentInput {
	const clientId = cleanText(input.clientId, 160);
	const clientName = assertText(input.clientName, 'a client', MAX_NAME_LENGTH, true);

	if (!clientId) {
		throw new Error('Choose a client for this payment.');
	}

	return {
		clientId,
		clientName,
		amountPaise: assertPositivePaise(input.amountPaise),
		partner: assertPartner(input.partner),
		occurredOn: assertDate(input.occurredOn),
		note: assertText(input.note, 'a note')
	};
}

function cleanExpenseInput(input: ExpenseInput): ExpenseInput {
	const category = expenseCategories.includes(input.category) ? input.category : 'Other';
	const clientId = input.clientId ? cleanText(input.clientId, 160) : null;
	const clientName = input.clientName ? cleanText(input.clientName, MAX_NAME_LENGTH) : null;

	return {
		clientId: clientId || null,
		clientName: clientId && clientName ? clientName : null,
		amountPaise: assertPositivePaise(input.amountPaise),
		partner: assertPartner(input.partner),
		category,
		occurredOn: assertDate(input.occurredOn),
		note: assertText(input.note, 'a note')
	};
}

function ensureVaultTotals(vault: VaultSummary): VaultTotals {
	const totals = vault.totals;
	const values = [
		totals.earned,
		totals.spent,
		totals.a.received,
		totals.a.spent,
		totals.b.received,
		totals.b.spent
	];

	if (!values.every(isValidPaise)) {
		throw new Error('Vault totals are invalid. Refresh the app before recording money.');
	}

	return totals;
}

function mutationSummary(kind: MutationKind, amountPaise: number, clientName: string | null, category?: string): string {
	const amount = formatPaise(amountPaise);
	const subject = clientName ? ` · ${clientName}` : category ? ` · ${category}` : '';

	switch (kind) {
		case 'payment-create':
			return `Payment added · ${amount}${subject}`;
		case 'payment-update':
			return `Payment updated · ${amount}${subject}`;
		case 'payment-delete':
			return `Payment removed · ${amount}${subject}`;
		case 'expense-create':
			return `Expense added · ${amount}${subject}`;
		case 'expense-update':
			return `Expense updated · ${amount}${subject}`;
		case 'expense-delete':
			return `Expense removed · ${amount}${subject}`;
	}
}

function updateVaultTotals(
	batch: ReturnType<typeof writeBatch>,
	vaultId: string,
	mutationId: string,
	delta: MutationDelta
): void {
	const { db } = getFirebaseClient();
	const vaultRef = doc(db, 'vaults', vaultId);

	batch.update(vaultRef, {
		'totals.earned': increment(delta.earned),
		'totals.spent': increment(delta.spent),
		'totals.a.received': increment(delta.aReceived),
		'totals.b.received': increment(delta.bReceived),
		'totals.a.spent': increment(delta.aSpent),
		'totals.b.spent': increment(delta.bSpent),
		updatedAt: serverTimestamp(),
		lastMutationId: mutationId
	});
}

function setMutation(
	batch: ReturnType<typeof writeBatch>,
	vaultId: string,
	mutationId: string,
	kind: MutationKind,
	recordType: 'payment' | 'expense',
	recordId: string,
	delta: MutationDelta,
	actorEmail: string,
	summary: string
): void {
	const { db } = getFirebaseClient();
	const mutationRef = doc(db, 'vaults', vaultId, 'mutations', mutationId);

	batch.set(mutationRef, {
		id: mutationId,
		kind,
		recordType,
		recordId,
		delta,
		actorEmail,
		summary,
		createdAt: serverTimestamp()
	});
}

function newMutationId(vaultId: string): string {
	const { db } = getFirebaseClient();
	return doc(collection(db, 'vaults', vaultId, 'mutations')).id;
}

export function toClientRecord(snapshot: QueryDocumentSnapshot<DocumentData>): ClientRecord {
	const data = snapshot.data();
	return {
		id: snapshot.id,
		name: asString(data.name, 'Untitled client'),
		contact: asString(data.contact),
		notes: asString(data.notes),
		isArchived: asBoolean(data.isArchived),
		createdAt: asDate(data.createdAt),
		updatedAt: asDate(data.updatedAt),
		createdBy: asString(data.createdBy),
		updatedBy: asString(data.updatedBy)
	};
}

export function toPaymentRecord(snapshot: QueryDocumentSnapshot<DocumentData>): PaymentRecord {
	const data = snapshot.data();
	return {
		id: snapshot.id,
		clientId: asString(data.clientId),
		clientName: asString(data.clientName, 'Unknown client'),
		amountPaise: asPaise(data.amountPaise),
		partner: asPartner(data.partner),
		occurredOn: asString(data.occurredOn),
		note: asString(data.note),
		createdAt: asDate(data.createdAt),
		updatedAt: asDate(data.updatedAt),
		createdBy: asString(data.createdBy),
		updatedBy: asString(data.updatedBy),
		lastMutationId: asString(data.lastMutationId)
	};
}

export function toExpenseRecord(snapshot: QueryDocumentSnapshot<DocumentData>): ExpenseRecord {
	const data = snapshot.data();
	return {
		id: snapshot.id,
		clientId: typeof data.clientId === 'string' ? data.clientId : null,
		clientName: typeof data.clientName === 'string' ? data.clientName : null,
		amountPaise: asPaise(data.amountPaise),
		partner: asPartner(data.partner),
		category: asExpenseCategory(data.category),
		occurredOn: asString(data.occurredOn),
		note: asString(data.note),
		createdAt: asDate(data.createdAt),
		updatedAt: asDate(data.updatedAt),
		createdBy: asString(data.createdBy),
		updatedBy: asString(data.updatedBy),
		lastMutationId: asString(data.lastMutationId)
	};
}

function toMutationDelta(value: unknown): MutationDelta {
	const delta = value as Partial<MutationDelta> | undefined;
	return {
		earned: typeof delta?.earned === 'number' ? delta.earned : 0,
		spent: typeof delta?.spent === 'number' ? delta.spent : 0,
		aReceived: typeof delta?.aReceived === 'number' ? delta.aReceived : 0,
		bReceived: typeof delta?.bReceived === 'number' ? delta.bReceived : 0,
		aSpent: typeof delta?.aSpent === 'number' ? delta.aSpent : 0,
		bSpent: typeof delta?.bSpent === 'number' ? delta.bSpent : 0
	};
}

export function toVaultMutation(snapshot: QueryDocumentSnapshot<DocumentData>): VaultMutation {
	const data = snapshot.data();
	const kind = asString(data.kind) as MutationKind;
	return {
		id: snapshot.id,
		kind,
		recordType: data.recordType === 'expense' ? 'expense' : 'payment',
		recordId: asString(data.recordId),
		delta: toMutationDelta(data.delta),
		actorEmail: asString(data.actorEmail),
		summary: asString(data.summary, 'Vault updated'),
		createdAt: asDate(data.createdAt)
	};
}

export function subscribeToVaultData(
	vaultId: string,
	onData: (snapshot: VaultDataSnapshot) => void,
	onError: (error: unknown) => void
): Unsubscribe {
	const { db } = getFirebaseClient();
	const clientMap = new Map<string, ClientRecord>();
	const paymentMap = new Map<string, PaymentRecord>();
	const expenseMap = new Map<string, ExpenseRecord>();
	const mutationMap = new Map<string, VaultMutation>();
	const cacheStates = new Map<string, boolean>();
	const pendingStates = new Map<string, boolean>();

	const emit = () => {
		if (clientMap.size === -1) {
			return;
		}

		onData({
			clients: [...clientMap.values()],
			payments: [...paymentMap.values()],
			expenses: [...expenseMap.values()],
			mutations: [...mutationMap.values()],
			fromCache: [...cacheStates.values()].every(Boolean),
			pendingWrites: [...pendingStates.values()].some(Boolean)
		});
	};

	const attach = <T>(
		key: string,
		queryRef: ReturnType<typeof query>,
		target: Map<string, T>,
		parse: (snapshot: QueryDocumentSnapshot<DocumentData>) => T
	): Unsubscribe =>
		onSnapshot(
			queryRef,
			(snapshot) => {
				target.clear();
				for (const documentSnapshot of snapshot.docs) {
					target.set(documentSnapshot.id, parse(documentSnapshot as QueryDocumentSnapshot<DocumentData>));
				}
				cacheStates.set(key, snapshot.metadata.fromCache);
				pendingStates.set(key, snapshot.metadata.hasPendingWrites);
				emit();
			},
			onError
		);

	const unsubscribers = [
		attach(
			'clients',
			query(collection(db, 'vaults', vaultId, 'clients'), orderBy('updatedAt', 'desc')),
			clientMap,
			toClientRecord
		),
		attach(
			'payments',
			query(collection(db, 'vaults', vaultId, 'payments'), orderBy('occurredOn', 'desc')),
			paymentMap,
			toPaymentRecord
		),
		attach(
			'expenses',
			query(collection(db, 'vaults', vaultId, 'expenses'), orderBy('occurredOn', 'desc')),
			expenseMap,
			toExpenseRecord
		),
		attach(
			'mutations',
			query(collection(db, 'vaults', vaultId, 'mutations'), orderBy('createdAt', 'desc')),
			mutationMap,
			toVaultMutation
		)
	];

	return () => {
		for (const unsubscribe of unsubscribers) {
			unsubscribe();
		}
	};
}

export async function createClient(vaultId: string, input: ClientInput, actorEmail: string): Promise<void> {
	const { db } = getFirebaseClient();
	const name = assertText(input.name, 'a client name', MAX_NAME_LENGTH, true);
	const actor = assertActorEmail(actorEmail);
	const clientRef = doc(collection(db, 'vaults', vaultId, 'clients'));

	await setDoc(clientRef, {
		name,
		contact: assertText(input.contact, 'a contact', MAX_CONTACT_LENGTH),
		notes: assertText(input.notes, 'notes'),
		isArchived: false,
		createdAt: serverTimestamp(),
		updatedAt: serverTimestamp(),
		createdBy: actor,
		updatedBy: actor
	});
}

export async function updateClient(
	vaultId: string,
	client: ClientRecord,
	input: ClientInput,
	actorEmail: string
): Promise<void> {
	const { db } = getFirebaseClient();
	const name = assertText(input.name, 'a client name', MAX_NAME_LENGTH, true);

	await updateDoc(doc(db, 'vaults', vaultId, 'clients', client.id), {
		name,
		contact: assertText(input.contact, 'a contact', MAX_CONTACT_LENGTH),
		notes: assertText(input.notes, 'notes'),
		updatedAt: serverTimestamp(),
		updatedBy: assertActorEmail(actorEmail)
	});
}

export async function setClientArchived(
	vaultId: string,
	client: ClientRecord,
	isArchived: boolean,
	actorEmail: string
): Promise<void> {
	const { db } = getFirebaseClient();
	await updateDoc(doc(db, 'vaults', vaultId, 'clients', client.id), {
		isArchived,
		updatedAt: serverTimestamp(),
		updatedBy: assertActorEmail(actorEmail)
	});
}

export async function createPayment(vault: VaultSummary, input: PaymentInput, actorEmail: string): Promise<void> {
	ensureVaultTotals(vault);
	const { db } = getFirebaseClient();
	const clean = cleanPaymentInput(input);
	const actor = assertActorEmail(actorEmail);
	const paymentRef = doc(collection(db, 'vaults', vault.id, 'payments'));
	const mutationId = newMutationId(vault.id);
	const delta = paymentDelta(null, clean);
	const batch = writeBatch(db);

	batch.set(paymentRef, {
		...clean,
		createdAt: serverTimestamp(),
		updatedAt: serverTimestamp(),
		createdBy: actor,
		updatedBy: actor,
		lastMutationId: mutationId
	});
	setMutation(
		batch,
		vault.id,
		mutationId,
		'payment-create',
		'payment',
		paymentRef.id,
		delta,
		actor,
		mutationSummary('payment-create', clean.amountPaise, clean.clientName)
	);
	updateVaultTotals(batch, vault.id, mutationId, delta);
	await batch.commit();
}

export async function updatePayment(
	vault: VaultSummary,
	payment: PaymentRecord,
	input: PaymentInput,
	actorEmail: string
): Promise<void> {
	ensureVaultTotals(vault);
	const { db } = getFirebaseClient();
	const clean = cleanPaymentInput(input);
	const actor = assertActorEmail(actorEmail);
	const mutationId = newMutationId(vault.id);
	const delta = paymentDelta(payment, clean);
	const batch = writeBatch(db);
	const paymentRef = doc(db, 'vaults', vault.id, 'payments', payment.id);

	batch.update(paymentRef, {
		...clean,
		updatedAt: serverTimestamp(),
		updatedBy: actor,
		lastMutationId: mutationId
	});
	setMutation(
		batch,
		vault.id,
		mutationId,
		'payment-update',
		'payment',
		payment.id,
		delta,
		actor,
		mutationSummary('payment-update', clean.amountPaise, clean.clientName)
	);
	updateVaultTotals(batch, vault.id, mutationId, delta);
	await batch.commit();
}

export async function deletePayment(vault: VaultSummary, payment: PaymentRecord, actorEmail: string): Promise<void> {
	ensureVaultTotals(vault);
	const { db } = getFirebaseClient();
	const actor = assertActorEmail(actorEmail);
	const mutationId = newMutationId(vault.id);
	const delta = paymentDelta(payment, null);
	const batch = writeBatch(db);

	batch.delete(doc(db, 'vaults', vault.id, 'payments', payment.id));
	setMutation(
		batch,
		vault.id,
		mutationId,
		'payment-delete',
		'payment',
		payment.id,
		delta,
		actor,
		mutationSummary('payment-delete', payment.amountPaise, payment.clientName)
	);
	updateVaultTotals(batch, vault.id, mutationId, delta);
	await batch.commit();
}

export async function createExpense(vault: VaultSummary, input: ExpenseInput, actorEmail: string): Promise<void> {
	ensureVaultTotals(vault);
	const { db } = getFirebaseClient();
	const clean = cleanExpenseInput(input);
	const actor = assertActorEmail(actorEmail);
	const expenseRef = doc(collection(db, 'vaults', vault.id, 'expenses'));
	const mutationId = newMutationId(vault.id);
	const delta = expenseDelta(null, clean);
	const batch = writeBatch(db);

	batch.set(expenseRef, {
		...clean,
		createdAt: serverTimestamp(),
		updatedAt: serverTimestamp(),
		createdBy: actor,
		updatedBy: actor,
		lastMutationId: mutationId
	});
	setMutation(
		batch,
		vault.id,
		mutationId,
		'expense-create',
		'expense',
		expenseRef.id,
		delta,
		actor,
		mutationSummary('expense-create', clean.amountPaise, clean.clientName, clean.category)
	);
	updateVaultTotals(batch, vault.id, mutationId, delta);
	await batch.commit();
}

export async function updateExpense(
	vault: VaultSummary,
	expense: ExpenseRecord,
	input: ExpenseInput,
	actorEmail: string
): Promise<void> {
	ensureVaultTotals(vault);
	const { db } = getFirebaseClient();
	const clean = cleanExpenseInput(input);
	const actor = assertActorEmail(actorEmail);
	const mutationId = newMutationId(vault.id);
	const delta = expenseDelta(expense, clean);
	const batch = writeBatch(db);
	const expenseRef = doc(db, 'vaults', vault.id, 'expenses', expense.id);

	batch.update(expenseRef, {
		...clean,
		updatedAt: serverTimestamp(),
		updatedBy: actor,
		lastMutationId: mutationId
	});
	setMutation(
		batch,
		vault.id,
		mutationId,
		'expense-update',
		'expense',
		expense.id,
		delta,
		actor,
		mutationSummary('expense-update', clean.amountPaise, clean.clientName, clean.category)
	);
	updateVaultTotals(batch, vault.id, mutationId, delta);
	await batch.commit();
}

export async function deleteExpense(vault: VaultSummary, expense: ExpenseRecord, actorEmail: string): Promise<void> {
	ensureVaultTotals(vault);
	const { db } = getFirebaseClient();
	const actor = assertActorEmail(actorEmail);
	const mutationId = newMutationId(vault.id);
	const delta = expenseDelta(expense, null);
	const batch = writeBatch(db);

	batch.delete(doc(db, 'vaults', vault.id, 'expenses', expense.id));
	setMutation(
		batch,
		vault.id,
		mutationId,
		'expense-delete',
		'expense',
		expense.id,
		delta,
		actor,
		mutationSummary('expense-delete', expense.amountPaise, expense.clientName, expense.category)
	);
	updateVaultTotals(batch, vault.id, mutationId, delta);
	await batch.commit();
}

export function vaultDataErrorMessage(error: unknown): string {
	const code = (error as Partial<FirebaseError>)?.code;

	switch (code) {
		case 'permission-denied':
			return 'Vault could not save that change. Deploy the full Firestore rules after this update.';
		case 'unavailable':
			return 'Vault is offline. Your change will save when a connection is available.';
		case 'failed-precondition':
			return 'This action needs a newer Vault version. Refresh and try again.';
		case 'not-found':
			return 'That item no longer exists. Refresh and try again.';
		default:
			return error instanceof Error ? error.message : 'Vault could not save that change.';
	}
}
