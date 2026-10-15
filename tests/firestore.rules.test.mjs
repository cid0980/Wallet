import { after, before, beforeEach, test } from 'node:test';
import { readFileSync } from 'node:fs';

import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import {
	collection,
	deleteDoc,
	doc,
	getDoc,
	getDocs,
	increment,
	query,
	where,
	serverTimestamp,
	setDoc,
	Timestamp,
	updateDoc,
	writeBatch
} from 'firebase/firestore';

const projectId = 'vault-rules-test';
const vaultId = 'vault-main';
const aliceEmail = 'alice@example.com';
const bobEmail = 'bob@example.com';
const eveEmail = 'eve@example.com';

let testEnvironment;

// Members now sign in with email/password, whose tokens are not "verified"
// until a link is clicked and whose provider is 'password'.
function memberDb(email) {
	return testEnvironment.authenticatedContext(`uid-${email}`, {
		email,
		email_verified: false,
		firebase: { sign_in_provider: 'password' }
	}).firestore();
}

// The same account shape, used to prove a non-member is still refused.
function nonMemberDb(email) {
	return testEnvironment.authenticatedContext(`uid-${email}`, {
		email,
		email_verified: false,
		firebase: { sign_in_provider: 'password' }
	}).firestore();
}

function zeroTotals() {
	return {
		earned: 0,
		spent: 0,
		a: { received: 0, spent: 0 },
		b: { received: 0, spent: 0 }
	};
}

function seededVault() {
	return {
		name: 'Test Vault',
		createdAt: Timestamp.now(),
		members: {
			a: { name: 'Alice', email: aliceEmail },
			b: { name: 'Bob', email: bobEmail }
		},
		totals: zeroTotals()
	};
}

function seededClient() {
	return {
		name: 'Acme Studio',
		contact: 'accounts@acme.test',
		notes: '',
		isArchived: false,
		createdAt: Timestamp.now(),
		updatedAt: Timestamp.now(),
		createdBy: aliceEmail,
		updatedBy: aliceEmail
	};
}

function paymentFields(mutationId, amountPaise = 100_00, partner = 'a') {
	return {
		clientId: 'client-acme',
		clientName: 'Acme Studio',
		amountPaise,
		partner,
		occurredOn: '2026-10-13',
		note: 'Invoice payment',
		createdAt: serverTimestamp(),
		updatedAt: serverTimestamp(),
		createdBy: aliceEmail,
		updatedBy: aliceEmail,
		lastMutationId: mutationId
	};
}

function paymentDelta(amountPaise, partner = 'a') {
	return {
		earned: amountPaise,
		spent: 0,
		aReceived: partner === 'a' ? amountPaise : 0,
		bReceived: partner === 'b' ? amountPaise : 0,
		aSpent: 0,
		bSpent: 0
	};
}

function expenseFields(mutationId, amountPaise = 50_00, partner = 'b') {
	return {
		clientId: null,
		clientName: null,
		amountPaise,
		partner,
		category: 'Software',
		occurredOn: '2026-10-13',
		note: 'Subscription',
		createdAt: serverTimestamp(),
		updatedAt: serverTimestamp(),
		createdBy: aliceEmail,
		updatedBy: aliceEmail,
		lastMutationId: mutationId
	};
}

function expenseDelta(amountPaise, partner = 'b') {
	return {
		earned: 0,
		spent: amountPaise,
		aReceived: 0,
		bReceived: 0,
		aSpent: partner === 'a' ? amountPaise : 0,
		bSpent: partner === 'b' ? amountPaise : 0
	};
}

function mutationFields(id, kind, recordId, delta) {
	return {
		id,
		kind,
		recordType: kind.startsWith('payment') ? 'payment' : 'expense',
		recordId,
		delta,
		actorEmail: aliceEmail,
		summary: 'Test ledger mutation',
		createdAt: serverTimestamp()
	};
}

function updateVaultForDelta(batch, db, mutationId, delta) {
	batch.update(doc(db, 'vaults', vaultId), {
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

async function addValidPayment(db, paymentId = 'payment-1', mutationId = 'mutation-1', amount = 100_00) {
	const batch = writeBatch(db);
	const delta = paymentDelta(amount);
	batch.set(doc(db, 'vaults', vaultId, 'payments', paymentId), paymentFields(mutationId, amount));
	batch.set(
		doc(db, 'vaults', vaultId, 'mutations', mutationId),
		mutationFields(mutationId, 'payment-create', paymentId, delta)
	);
	updateVaultForDelta(batch, db, mutationId, delta);
	return batch.commit();
}

before(async () => {
	testEnvironment = await initializeTestEnvironment({
		projectId,
		firestore: {
			rules: readFileSync('firestore.rules', 'utf8'),
			host: '127.0.0.1',
			port: 8080
		}
	});
});

beforeEach(async () => {
	await testEnvironment.clearFirestore();
	await testEnvironment.withSecurityRulesDisabled(async (context) => {
		const adminDb = context.firestore();
		await setDoc(doc(adminDb, 'vaults', vaultId), seededVault());
		await setDoc(doc(adminDb, 'vaults', vaultId, 'clients', 'client-acme'), seededClient());
	});
});

after(async () => {
	await testEnvironment.cleanup();
});

test('allows an initial vault only for an account listed as a member', async () => {
	await testEnvironment.clearFirestore();
	const aliceDb = memberDb(aliceEmail);
	const eveDb = memberDb(eveEmail);
	const initial = {
		name: 'New Vault',
		createdAt: serverTimestamp(),
		members: {
			a: { name: 'Alice', email: aliceEmail },
			b: { name: 'Bob', email: bobEmail }
		},
		totals: zeroTotals()
	};

	// An email/password account that is listed as a member may create the vault,
	// even though its token is not "verified".
	await assertSucceeds(setDoc(doc(aliceDb, 'vaults', 'new-vault'), initial));

	// An account that is not in the member list may not.
	await assertFails(setDoc(doc(eveDb, 'vaults', 'blocked-vault'), initial));

	// A vault whose member list excludes the creator is refused.
	const selfless = {
		...initial,
		members: {
			a: { name: 'Bob', email: bobEmail },
			b: { name: 'Eve', email: eveEmail }
		}
	};
	await assertFails(setDoc(doc(aliceDb, 'vaults', 'selfless-vault'), selfless));

	// A token without an email is refused outright.
	const noEmail = testEnvironment
		.authenticatedContext('uid-no-email', { email: null, firebase: { sign_in_provider: 'password' } })
		.firestore();
	await assertFails(setDoc(doc(noEmail, 'vaults', 'no-email-vault'), initial));
});

test('allows members and denies non-members when reading vault data', async () => {
	await assertSucceeds(getDoc(doc(memberDb(aliceEmail), 'vaults', vaultId)));
	await assertSucceeds(getDoc(doc(memberDb(bobEmail), 'vaults', vaultId, 'clients', 'client-acme')));
	await assertFails(getDoc(doc(memberDb(eveEmail), 'vaults', vaultId)));
	await assertFails(getDoc(doc(testEnvironment.unauthenticatedContext().firestore(), 'vaults', vaultId)));
});

test('allows only constrained member-discovery queries', async () => {
	const aliceDb = memberDb(aliceEmail);
	const bobDb = memberDb(bobEmail);
	const eveDb = memberDb(eveEmail);

	await assertSucceeds(
		getDocs(query(collection(aliceDb, 'vaults'), where('members.a.email', '==', aliceEmail)))
	);
	await assertSucceeds(
		getDocs(query(collection(bobDb, 'vaults'), where('members.b.email', '==', bobEmail)))
	);
	await assertFails(getDocs(collection(aliceDb, 'vaults')));
	await assertFails(
		getDocs(query(collection(eveDb, 'vaults'), where('members.a.email', '==', aliceEmail)))
	);
});

test('allows a member to create a valid client and blocks a non-member', async () => {
	const aliceDb = memberDb(aliceEmail);
	const eveDb = memberDb(eveEmail);
	const client = {
		name: 'Good Client',
		contact: '',
		notes: '',
		isArchived: false,
		createdAt: serverTimestamp(),
		updatedAt: serverTimestamp(),
		createdBy: aliceEmail,
		updatedBy: aliceEmail
	};

	await assertSucceeds(setDoc(doc(aliceDb, 'vaults', vaultId, 'clients', 'client-good'), client));
	await assertFails(setDoc(doc(eveDb, 'vaults', vaultId, 'clients', 'client-evil'), client));
});

test('allows a valid three-document payment batch and keeps totals atomic', async () => {
	const aliceDb = memberDb(aliceEmail);
	await assertSucceeds(addValidPayment(aliceDb));

	const vault = await getDoc(doc(aliceDb, 'vaults', vaultId));
	const payment = await getDoc(doc(aliceDb, 'vaults', vaultId, 'payments', 'payment-1'));
	const mutation = await getDoc(doc(aliceDb, 'vaults', vaultId, 'mutations', 'mutation-1'));

	if (!vault.exists() || !payment.exists() || !mutation.exists()) {
		throw new Error('Expected atomic batch documents to exist.');
	}

	if (vault.data().totals.earned !== 100_00 || vault.data().totals.a.received !== 100_00) {
		throw new Error('Expected payment batch to update aggregate totals.');
	}
});

test('allows a valid three-document expense batch and updates the paying partner total', async () => {
	const aliceDb = memberDb(aliceEmail);
	const batch = writeBatch(aliceDb);
	const delta = expenseDelta(50_00, 'b');
	batch.set(doc(aliceDb, 'vaults', vaultId, 'expenses', 'expense-1'), expenseFields('expense-mutation-1', 50_00, 'b'));
	batch.set(
		doc(aliceDb, 'vaults', vaultId, 'mutations', 'expense-mutation-1'),
		mutationFields('expense-mutation-1', 'expense-create', 'expense-1', delta)
	);
	updateVaultForDelta(batch, aliceDb, 'expense-mutation-1', delta);
	await assertSucceeds(batch.commit());

	const vault = await getDoc(doc(aliceDb, 'vaults', vaultId));
	if (!vault.exists() || vault.data().totals.spent !== 50_00 || vault.data().totals.b.spent !== 50_00) {
		throw new Error('Expected expense batch to update shared and partner spending totals.');
	}
});

test('denies direct ledger or aggregate manipulation', async () => {
	const aliceDb = memberDb(aliceEmail);
	const roguePayment = paymentFields('not-a-real-mutation', 500_00);

	await assertFails(setDoc(doc(aliceDb, 'vaults', vaultId, 'payments', 'rogue-payment'), roguePayment));
	await assertFails(updateDoc(doc(aliceDb, 'vaults', vaultId), { 'totals.earned': increment(500_00) }));
});

test('denies a mismatched mutation delta even inside a batch', async () => {
	const aliceDb = memberDb(aliceEmail);
	const batch = writeBatch(aliceDb);
	const badDelta = paymentDelta(999_00);
	batch.set(doc(aliceDb, 'vaults', vaultId, 'payments', 'payment-bad'), paymentFields('mutation-bad', 100_00));
	batch.set(
		doc(aliceDb, 'vaults', vaultId, 'mutations', 'mutation-bad'),
		mutationFields('mutation-bad', 'payment-create', 'payment-bad', badDelta)
	);
	updateVaultForDelta(batch, aliceDb, 'mutation-bad', badDelta);

	await assertFails(batch.commit());
});

test('allows a valid payment edit and removal through linked batches', async () => {
	const aliceDb = memberDb(aliceEmail);
	await assertSucceeds(addValidPayment(aliceDb));

	const updateBatch = writeBatch(aliceDb);
	const updateDelta = paymentDelta(50_00);
	updateBatch.update(doc(aliceDb, 'vaults', vaultId, 'payments', 'payment-1'), {
		amountPaise: 150_00,
		updatedAt: serverTimestamp(),
		updatedBy: aliceEmail,
		lastMutationId: 'mutation-2'
	});
	updateBatch.set(
		doc(aliceDb, 'vaults', vaultId, 'mutations', 'mutation-2'),
		mutationFields('mutation-2', 'payment-update', 'payment-1', updateDelta)
	);
	updateVaultForDelta(updateBatch, aliceDb, 'mutation-2', updateDelta);
	await assertSucceeds(updateBatch.commit());

	const deleteBatch = writeBatch(aliceDb);
	const deleteDelta = paymentDelta(-150_00);
	deleteBatch.delete(doc(aliceDb, 'vaults', vaultId, 'payments', 'payment-1'));
	deleteBatch.set(
		doc(aliceDb, 'vaults', vaultId, 'mutations', 'mutation-3'),
		mutationFields('mutation-3', 'payment-delete', 'payment-1', deleteDelta)
	);
	updateVaultForDelta(deleteBatch, aliceDb, 'mutation-3', deleteDelta);
	await assertSucceeds(deleteBatch.commit());
});

test('does not allow a member to delete a client or mutate an audit record', async () => {
	const aliceDb = memberDb(aliceEmail);
	await assertFails(deleteDoc(doc(aliceDb, 'vaults', vaultId, 'clients', 'client-acme')));
	await assertSucceeds(addValidPayment(aliceDb));
	await assertFails(updateDoc(doc(aliceDb, 'vaults', vaultId, 'mutations', 'mutation-1'), { summary: 'Tampered' }));
});
