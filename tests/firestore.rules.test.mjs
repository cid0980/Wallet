import { after, before, beforeEach, test } from 'node:test';
import { readFileSync } from 'node:fs';

import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import {
	collection,
	deleteDoc,
	deleteField,
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

// Members sign in with email/password and must verify the address before
// the rules accept them: the member list names an email, and verification
// is what proves the account owns that inbox. A verified token is the only
// shape treated as a member anywhere in these tests.
function memberDb(email, { verified = true } = {}) {
	return testEnvironment.authenticatedContext(`uid-${email}`, {
		email,
		email_verified: verified,
		firebase: { sign_in_provider: 'password' }
	}).firestore();
}

// The same verified account shape, used to prove a non-member is refused
// for membership reasons rather than verification ones.
function nonMemberDb(email) {
	return memberDb(email);
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

function paymentFields(mutationId, amountPaise = 100_00, partner = 'a', project = null) {
	return {
		clientId: 'client-acme',
		clientName: 'Acme Studio',
		projectId: project?.id ?? null,
		projectName: project?.name ?? null,
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
		tags: ['Software'],
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

	// A verified email/password account that is listed as a member may create
	// the vault.
	await assertSucceeds(setDoc(doc(aliceDb, 'vaults', 'new-vault'), initial));

	// The same member email on an unverified account may not: knowing an
	// invited address is not proof of owning it.
	const unverifiedAlice = memberDb(aliceEmail, { verified: false });
	await assertFails(setDoc(doc(unverifiedAlice, 'vaults', 'unverified-vault'), initial));

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

test('denies an unverified account even when its email is a vault member', async () => {
	// Regression: an attacker who learns an invited partner email could
	// register a password account for it. Without email_verified the vault,
	// its subcollections and member-discovery queries must all stay shut.
	const unverifiedBob = memberDb(bobEmail, { verified: false });
	await assertFails(getDoc(doc(unverifiedBob, 'vaults', vaultId)));
	await assertFails(getDoc(doc(unverifiedBob, 'vaults', vaultId, 'clients', 'client-acme')));
	await assertFails(
		getDocs(query(collection(unverifiedBob, 'vaults'), where('members.b.email', '==', bobEmail)))
	);
	await assertFails(
		setDoc(doc(unverifiedBob, 'vaults', vaultId, 'clients', 'new-client'), {
			...seededClient(),
			createdBy: bobEmail,
			updatedBy: bobEmail
		})
	);

	// The verified owner of the same address is unaffected.
	await assertSucceeds(getDoc(doc(memberDb(bobEmail), 'vaults', vaultId)));
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

test('keeps pre-tags expense records editable and migrates them to tags', async () => {
	const aliceDb = memberDb(aliceEmail);
	// A record saved before spending tags existed: one fixed category field.
	await testEnvironment.withSecurityRulesDisabled(async (context) => {
		await setDoc(doc(context.firestore(), 'vaults', vaultId, 'expenses', 'legacy-expense'), {
			clientId: null,
			clientName: null,
			amountPaise: 50_00,
			partner: 'b',
			category: 'Software',
			occurredOn: '2026-10-01',
			note: 'Old shape',
			createdAt: Timestamp.now(),
			updatedAt: Timestamp.now(),
			createdBy: aliceEmail,
			updatedBy: aliceEmail,
			lastMutationId: 'legacy-mutation'
		});
	});

	const batch = writeBatch(aliceDb);
	const delta = { earned: 0, spent: 0, aReceived: 0, bReceived: 0, aSpent: 0, bSpent: 0 };
	batch.update(doc(aliceDb, 'vaults', vaultId, 'expenses', 'legacy-expense'), {
		clientId: null,
		clientName: null,
		amountPaise: 50_00,
		partner: 'b',
		tags: ['Software', 'Hosting'],
		occurredOn: '2026-10-01',
		note: 'Old shape',
		category: deleteField(),
		updatedAt: serverTimestamp(),
		updatedBy: aliceEmail,
		lastMutationId: 'mutation-migrate'
	});
	batch.set(
		doc(aliceDb, 'vaults', vaultId, 'mutations', 'mutation-migrate'),
		mutationFields('mutation-migrate', 'expense-update', 'legacy-expense', delta)
	);
	updateVaultForDelta(batch, aliceDb, 'mutation-migrate', delta);
	await assertSucceeds(batch.commit());
});

test('lets members edit the shared spending tags without touching money', async () => {
	const aliceDb = memberDb(aliceEmail);
	const eveDb = nonMemberDb(eveEmail);

	await assertSucceeds(
		updateDoc(doc(aliceDb, 'vaults', vaultId), {
			tags: ['Software', 'Hosting', 'Travel'],
			updatedAt: serverTimestamp()
		})
	);

	// A tags edit that also nudges totals is refused.
	await assertFails(
		updateDoc(doc(aliceDb, 'vaults', vaultId), {
			tags: ['Software'],
			'totals.earned': increment(500_00),
			updatedAt: serverTimestamp()
		})
	);

	// At least one tag, each tag a short string.
	await assertFails(
		updateDoc(doc(aliceDb, 'vaults', vaultId), {
			tags: [],
			updatedAt: serverTimestamp()
		})
	);

	// A non-member may not edit the list.
	await assertFails(
		updateDoc(doc(eveDb, 'vaults', vaultId), {
			tags: ['Hacked'],
			updatedAt: serverTimestamp()
		})
	);
});

test('still accepts a money batch after spending tags exist on the vault', async () => {
	const aliceDb = memberDb(aliceEmail);
	await assertSucceeds(
		updateDoc(doc(aliceDb, 'vaults', vaultId), {
			tags: ['Software', 'Hosting'],
			updatedAt: serverTimestamp()
		})
	);
	await assertSucceeds(addValidPayment(aliceDb));
});

test('allows members to run projects and edit the estimated price', async () => {
	const aliceDb = memberDb(aliceEmail);
	const eveDb = nonMemberDb(eveEmail);
	const projectDoc = doc(aliceDb, 'vaults', vaultId, 'projects', 'project-site');
	const project = {
		name: 'Website build',
		clientId: 'client-acme',
		clientName: 'Acme Studio',
		estimatedPaise: 6000000,
		status: 'active',
		note: 'Two pages left',
		createdAt: serverTimestamp(),
		updatedAt: serverTimestamp(),
		createdBy: aliceEmail,
		updatedBy: aliceEmail
	};

	await assertSucceeds(setDoc(projectDoc, project));
	await assertFails(setDoc(doc(eveDb, 'vaults', vaultId, 'projects', 'project-evil'), project));

	// Any member may revise the estimate; the edit must say who made it.
	await assertSucceeds(
		updateDoc(projectDoc, {
			estimatedPaise: 7500000,
			updatedAt: serverTimestamp(),
			updatedBy: aliceEmail
		})
	);

	// "edited by who" is not optional: the editor cannot be forged.
	await assertFails(
		updateDoc(projectDoc, {
			estimatedPaise: 1,
			updatedAt: serverTimestamp(),
			updatedBy: eveEmail
		})
	);

	// An estimate is a money amount, and a forged status is refused.
	await assertFails(
		updateDoc(projectDoc, {
			estimatedPaise: -5,
			updatedAt: serverTimestamp(),
			updatedBy: aliceEmail
		})
	);
	await assertFails(
		updateDoc(projectDoc, {
			status: 'archived',
			updatedAt: serverTimestamp(),
			updatedBy: aliceEmail
		})
	);

	await assertSucceeds(deleteDoc(projectDoc));
});

test('accepts a payment batch linked to a project', async () => {
	const aliceDb = memberDb(aliceEmail);
	await testEnvironment.withSecurityRulesDisabled(async (context) => {
		await setDoc(doc(context.firestore(), 'vaults', vaultId, 'projects', 'project-site'), {
			name: 'Website build',
			clientId: 'client-acme',
			clientName: 'Acme Studio',
			estimatedPaise: 6000000,
			status: 'active',
			note: '',
			createdAt: Timestamp.now(),
			updatedAt: Timestamp.now(),
			createdBy: aliceEmail,
			updatedBy: aliceEmail
		});
	});

	const batch = writeBatch(aliceDb);
	const delta = paymentDelta(100_00);
	batch.set(
		doc(aliceDb, 'vaults', vaultId, 'payments', 'payment-project'),
		paymentFields('mutation-project', 100_00, 'a', { id: 'project-site', name: 'Website build' })
	);
	batch.set(
		doc(aliceDb, 'vaults', vaultId, 'mutations', 'mutation-project'),
		mutationFields('mutation-project', 'payment-create', 'payment-project', delta)
	);
	updateVaultForDelta(batch, aliceDb, 'mutation-project', delta);
	await assertSucceeds(batch.commit());
});
