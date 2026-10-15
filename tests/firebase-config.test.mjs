import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeAuthDomain } from '../src/lib/firebase/auth-domain.ts';

const projectId = 'valet-07';
const fallback = 'valet-07.firebaseapp.com';

test('keeps a correct Firebase auth domain', () => {
	assert.equal(normalizeAuthDomain('valet-07.firebaseapp.com', projectId), fallback);
	assert.equal(normalizeAuthDomain('  valet-07.firebaseapp.com  ', projectId), fallback);
});

test('repairs a deployment URL pasted into VITE_FIREBASE_AUTH_DOMAIN', () => {
	// This exact misconfiguration broke Google sign-in in production:
	// Firebase builds `https://${authDomain}/__/auth/handler`, so a URL here
	// produced the unusable `https://https://wallet-neon-ten.vercel.app/...`.
	assert.equal(normalizeAuthDomain('https://wallet-neon-ten.vercel.app/', projectId), fallback);
	assert.equal(normalizeAuthDomain('https://wallet-neon-ten.vercel.app', projectId), fallback);
	assert.equal(normalizeAuthDomain('http://wallet-git-main.vercel.app/', projectId), fallback);
	assert.equal(normalizeAuthDomain('wallet-neon-ten.vercel.app/', projectId), fallback);
});

test('falls back when the auth domain is missing or meaningless', () => {
	assert.equal(normalizeAuthDomain('', projectId), fallback);
	assert.equal(normalizeAuthDomain('   ', projectId), fallback);
	assert.equal(normalizeAuthDomain('valet-07', projectId), fallback);
	assert.equal(normalizeAuthDomain('localhost', projectId), fallback);
	assert.equal(normalizeAuthDomain('http://localhost:5173/', projectId), fallback);
	assert.equal(normalizeAuthDomain('http://127.0.0.1:5173', projectId), fallback);
});

test('accepts a custom Firebase auth domain', () => {
	assert.equal(normalizeAuthDomain('auth.example.com', projectId), 'auth.example.com');
	assert.equal(normalizeAuthDomain('https://auth.example.com/', projectId), 'auth.example.com');
	assert.equal(normalizeAuthDomain('valet-07.web.app', projectId), 'valet-07.web.app');
});

test('falls back to the redirect flow only for pop-up environment failures', async () => {
	const { shouldFallBackToRedirect, firebaseErrorCode } = await import(
		'../src/lib/firebase/sign-in-strategy.ts'
	);

	assert.equal(firebaseErrorCode({ code: 'auth/popup-blocked' }), 'auth/popup-blocked');
	assert.equal(firebaseErrorCode(new Error('plain')), undefined);

	// Environments that cannot show a pop-up.
	assert.equal(shouldFallBackToRedirect({ code: 'auth/popup-blocked' }), true);
	assert.equal(
		shouldFallBackToRedirect({ code: 'auth/operation-not-supported-in-this-environment' }),
		true
	);

	// Real configuration or user problems must surface, never loop.
	assert.equal(shouldFallBackToRedirect({ code: 'auth/unauthorized-domain' }), false);
	assert.equal(shouldFallBackToRedirect({ code: 'auth/operation-not-allowed' }), false);
	assert.equal(shouldFallBackToRedirect({ code: 'auth/popup-closed-by-user' }), false);
	assert.equal(shouldFallBackToRedirect(new Error('plain')), false);
});

test('a session without an email is rejected before it can blank the app', async () => {
	const { hasUsableAccountEmail } = await import('../src/lib/firebase/sign-in-strategy.ts');

	assert.equal(hasUsableAccountEmail({ email: 'cid@example.com' }), true);
	assert.equal(hasUsableAccountEmail({ email: 'cid@example.com' }), true);
	assert.equal(hasUsableAccountEmail({ email: null }), false);
	assert.equal(hasUsableAccountEmail({ email: '' }), false);
	assert.equal(hasUsableAccountEmail({ email: '   ' }), false);
	assert.equal(hasUsableAccountEmail({}), false);
	assert.equal(hasUsableAccountEmail(null), false);
	assert.equal(hasUsableAccountEmail(undefined), false);
});

test('resolves the account email from the token when the record has none', async () => {
	const { emailFromClaims, resolveAccountEmail, describeAccount } = await import(
		'../src/lib/firebase/account.ts'
	);

	assert.equal(emailFromClaims({ email: 'cid@example.com' }), 'cid@example.com');
	assert.equal(emailFromClaims({ email: '  cid@example.com  ' }), 'cid@example.com');
	assert.equal(emailFromClaims({ email: 42 }), null);
	assert.equal(emailFromClaims({}), null);
	assert.equal(emailFromClaims(undefined), null);

	// Record carries the email: never touch the token.
	let tokenCalls = 0;
	const withRecord = {
		email: 'cid@example.com',
		uid: 'uid-1',
		providerData: [{ providerId: 'google.com' }],
		getIdTokenResult: async () => {
			tokenCalls += 1;
			return { claims: { email: 'other@example.com' } };
		}
	};
	assert.equal(await resolveAccountEmail(withRecord), 'cid@example.com');
	assert.equal(tokenCalls, 0);

	// Record has no email (the failing production case): fall back to claims.
	const recordWithoutEmail = {
		email: null,
		uid: 'uid-2',
		providerData: [{ providerId: 'google.com' }],
		getIdTokenResult: async () => ({ claims: { email: 'partner@example.com' } })
	};
	assert.equal(await resolveAccountEmail(recordWithoutEmail), 'partner@example.com');

	// Neither source has an email: the sign-in must be rejected, not looped.
	const noEmailAnywhere = {
		email: null,
		uid: 'uid-3',
		getIdTokenResult: async () => ({ claims: { sub: 'uid-3' } })
	};
	assert.equal(await resolveAccountEmail(noEmailAnywhere), null);
	assert.equal(await resolveAccountEmail({ email: null }), null);
	assert.equal(await resolveAccountEmail(null), null);

	// A failing token lookup must not throw into the auth listener.
	const brokenToken = {
		email: '',
		getIdTokenResult: async () => {
			throw new Error('offline');
		}
	};
	assert.equal(await resolveAccountEmail(brokenToken), null);

	assert.match(describeAccount(recordWithoutEmail), /uid uid-2/);
	assert.match(describeAccount(recordWithoutEmail), /google\.com/);
	assert.match(describeAccount(recordWithoutEmail), /email missing/);
	assert.equal(describeAccount(null), 'no account');
});

test('finds the email from provider data and reports what each source returned', async () => {
	const { emailFromProviderData, inspectAccount, formatInspection, resolveAccountEmail } =
		await import('../src/lib/firebase/account.ts');

	// The record is stripped, but the linked Google entry still carries it.
	const providerOnly = {
		email: null,
		uid: 'uid-9',
		providerData: [{ providerId: 'google.com', email: 'asencid07@gmail.com' }],
		getIdTokenResult: async () => ({ claims: { name: 'Cid' } })
	};
	assert.equal(emailFromProviderData(providerOnly), 'asencid07@gmail.com');
	assert.equal(await resolveAccountEmail(providerOnly), 'asencid07@gmail.com');

	// Nothing anywhere: the session must be rejected with a full explanation.
	const nothing = {
		email: '',
		uid: 'uid-10',
		providerData: [{ providerId: 'google.com', email: null }],
		getIdTokenResult: async () => ({ claims: { name: 'No Email', picture: 'x' } })
	};
	assert.equal(emailFromProviderData(nothing), null);
	assert.equal(await resolveAccountEmail(nothing), null);

	const inspection = await inspectAccount(nothing);
	assert.equal(inspection.uid, 'uid-10');
	assert.deepEqual(inspection.providers, ['google.com']);
	assert.equal(inspection.recordEmail, null);
	assert.equal(inspection.providerEmail, null);
	assert.equal(inspection.claimsEmail, null);
	assert.deepEqual(inspection.claimKeys, ['name', 'picture']);
	assert.equal(inspection.tokenError, null);

	const report = formatInspection(inspection);
	assert.match(report, /uid: uid-10/);
	assert.match(report, /record email: missing/);
	assert.match(report, /token email claim: missing/);
	assert.match(report, /token claim keys: name, picture/);

	// A failing token lookup is reported rather than thrown.
	const broken = {
		email: null,
		uid: 'uid-11',
		providerData: [],
		getIdTokenResult: async () => {
			throw new Error('auth/network-request-failed');
		}
	};
	const brokenInspection = await inspectAccount(broken);
	assert.match(brokenInspection.tokenError ?? '', /network-request-failed/);
	assert.match(formatInspection(brokenInspection), /token lookup: auth\/network-request-failed/);
});

test('rules-denied guidance points at the console and the published file', async () => {
	const rules = await import('node:fs').then((fs) =>
		fs.readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8')
	);

	// The app reads vaults with two member queries; the published rule set must
	// allow exactly that shape for a member.
	assert.match(rules, /match \/vaults\/\{vaultId\} \{/);
	assert.match(rules, /allow get, list: if isVaultMemberData\(resource\.data\);/);
	assert.match(rules, /match \/vaults\/\{vaultId\}\/clients\/\{clientId\} \{/);

	// This must be the full policy, not the Step 1 bootstrap policy whose
	// catch-all denies every client, payment, expense, and history read.
	assert.doesNotMatch(rules, /narrow bootstrap policy/);
	assert.match(rules, /allow create: if isVaultMember\(vaultId\)\s*&& isValidClient\(request\.resource\.data\)/);

	const lineCount = rules.trim().split('\n').length;
	assert.ok(lineCount > 400, `expected the full rule set, saw ${lineCount} lines`);
});
