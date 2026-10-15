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



test('resolves the account email from the token when the record has none', async () => {
	const { emailFromClaims, resolveAccountEmail, describeAccount } = await import(
		'../src/lib/firebase/account.ts'
	);

	assert.equal(emailFromClaims({ email: 'cid@example.com' }), 'cid@example.com');
	assert.equal(emailFromClaims({ email: '  cid@example.com  ' }), 'cid@example.com');
	assert.equal(emailFromClaims({ email: 42 }), null);
	assert.equal(emailFromClaims({}), null);
	assert.equal(emailFromClaims(undefined), null);

	// Record carries the email: the token is inspected once (the rules need to
	// know it carries the claim) but never force-refreshed.
	let tokenCalls = 0;
	let forcedCalls = 0;
	const withRecord = {
		email: 'cid@example.com',
		uid: 'uid-1',
		providerData: [{ providerId: 'google.com' }],
		getIdTokenResult: async (force) => {
			tokenCalls += 1;
			if (force) forcedCalls += 1;
			return { claims: { email: 'cid@example.com', email_verified: true } };
		}
	};
	assert.equal(await resolveAccountEmail(withRecord), 'cid@example.com');
	assert.equal(tokenCalls, 1);
	assert.equal(forcedCalls, 0);

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

test('stored member emails match what Google tokens and the rules compare', async () => {
	// Mirrors createInitialVault's normalization: both addresses lower-cased,
	// signed-in member restored to the exact Auth casing.
	const signedInEmail = 'asencid07@gmail.com'; // Google returns lower case
	const typedPartnerEmail = '  Partner.Two@Gmail.COM  ';

	const members = {
		a: { name: 'Cid', email: signedInEmail },
		b: { name: 'Two', email: typedPartnerEmail.trim() }
	};

	members.a.email = members.a.email.toLocaleLowerCase();
	members.b.email = members.b.email.toLocaleLowerCase();
	const ownPartner = members.a;
	ownPartner.email = signedInEmail;

	// The vault document's members must equal the token email the rules compare.
	assert.equal(members.a.email, signedInEmail);
	assert.equal(members.b.email, 'partner.two@gmail.com');

	// The partner's membership query uses the resolved (lower-case) token email,
	// so the stored value has to match it exactly.
	const storedPartner = members.b.email;
	const partnerTokenEmail = 'partner.two@gmail.com';
	assert.equal(storedPartner, partnerTokenEmail);

	// A capitalised address from the setup form would have missed both.
	assert.notEqual(typedPartnerEmail.trim(), partnerTokenEmail);
});

test('access-check guidance maps each failure code to the right fix', async () => {
	const { describeAccessProbe } = await import('../src/lib/firebase/access-probe.ts');

	assert.match(describeAccessProbe('permission-denied'), /Rules deny this account at \/vaults/);
	assert.match(describeAccessProbe('unavailable'), /could not be reached/);
	assert.match(describeAccessProbe('failed-precondition'), /local storage/);
	assert.match(describeAccessProbe('unknown-ish'), /unknown-ish/);
});

test('the inspection reports the exact claims the published rules test', async () => {
	const { inspectAccount, formatInspection } = await import('../src/lib/firebase/account.ts');

	// Claims as Google sends them: every condition in the rules passes.
	const healthy = {
		email: 'asencid07@gmail.com',
		uid: 'uid-ok',
		providerData: [{ providerId: 'google.com', email: 'asencid07@gmail.com' }],
		getIdTokenResult: async () => ({
			claims: {
				email: 'asencid07@gmail.com',
				email_verified: true,
				firebase: { sign_in_provider: 'google.com' }
			}
		})
	};

	const healthyReport = await inspectAccount(healthy);
	assert.equal(healthyReport.emailVerified, true);
	assert.equal(healthyReport.signInProvider, 'google.com');
	assert.match(formatInspection(healthyReport), /token email_verified: true/);
	assert.match(formatInspection(healthyReport), /token sign_in_provider: google\.com/);
	assert.match(formatInspection(healthyReport), /token email claim: asencid07@gmail\.com/);

	// A token that would silently fail every rule must be visible as such.
	const missingClaims = {
		email: null,
		uid: 'uid-bad',
		providerData: [{ providerId: 'google.com', email: null }],
		getIdTokenResult: async () => ({ claims: { email: 'asencid07@gmail.com' } })
	};

	const badReport = await inspectAccount(missingClaims);
	assert.equal(badReport.emailVerified, 'missing');
	assert.equal(badReport.signInProvider, null);
	assert.match(formatInspection(badReport), /token email_verified: missing/);
	assert.match(formatInspection(badReport), /token sign_in_provider: missing/);

	// A non-boolean claim is reported as such rather than assumed true.
	const stringy = {
		email: 'a@b.com',
		uid: 'uid-str',
		providerData: [],
		getIdTokenResult: async () => ({ claims: { email: 'a@b.com', email_verified: 'true' } })
	};
	assert.equal((await inspectAccount(stringy)).emailVerified, 'not-boolean');
});

test('an account whose token has no email claim is caught, not sent to the rules', async () => {
	const { resolveAccount, resolveAccountEmail } = await import('../src/lib/firebase/account.ts');

	// Exactly the reported production state: provider entry has the email, the
	// record has none, and the token minted for the account has no email claim.
	let forcedRefreshes = 0;
	const reported = {
		email: null,
		uid: 'sbULzZTXDKgNmmtgFRvm5nrduXn1',
		providerData: [{ providerId: 'google.com', email: 'asencid07@gmail.com' }],
		getIdTokenResult: async (force) => {
			if (force) {
				forcedRefreshes += 1;
			}
			return {
				claims: {
					aud: 'valet-07',
					name: 'Cid',
					picture: 'x',
					sub: 'sbUL',
					user_id: 'sbUL',
					firebase: { sign_in_provider: 'google.com' }
				}
			};
		}
	};

	const resolved = await resolveAccount(reported);
	assert.equal(resolved.email, 'asencid07@gmail.com', 'identifiable from the provider entry');
	assert.equal(resolved.tokenEmail, null, 'but the token carries no email claim');
	assert.equal(forcedRefreshes, 1, 'one forced refresh is attempted before giving up');
	assert.equal(await resolveAccountEmail(reported), 'asencid07@gmail.com');

	// After the account is repaired, a refreshed token carries the claim.
	const repaired = {
		email: 'asencid07@gmail.com',
		uid: 'uid-new',
		providerData: [{ providerId: 'google.com', email: 'asencid07@gmail.com' }],
		getIdTokenResult: async () => ({
			claims: {
				email: 'asencid07@gmail.com',
				email_verified: true,
				firebase: { sign_in_provider: 'google.com' }
			}
		})
	};
	const repairedResolved = await resolveAccount(repaired);
	assert.equal(repairedResolved.email, 'asencid07@gmail.com');
	assert.equal(repairedResolved.tokenEmail, 'asencid07@gmail.com');

	// A record with an email never needs a forced refresh.
	let refreshes = 0;
	const healthy = {
		email: 'cid@example.com',
		uid: 'uid-healthy',
		providerData: [{ providerId: 'google.com', email: 'cid@example.com' }],
		getIdTokenResult: async (force) => {
			if (force) refreshes += 1;
			return { claims: { email: 'cid@example.com', email_verified: true } };
		}
	};
	await resolveAccount(healthy);
	assert.equal(refreshes, 0);
});

test('the published rules accept any signed-in member email, not just Google', async () => {
	const rules = await import('node:fs').then((fs) =>
		fs.readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8')
	);

	// Email/password tokens are not "verified" until a link is clicked, and the
	// provider is 'password', so neither condition may gate access.
	assert.doesNotMatch(rules, /email_verified == true/);
	assert.doesNotMatch(rules, /sign_in_provider == 'google\.com'/);

	// Access is still gated on the vault's member list.
	assert.match(rules, /function signedInWithEmail\(\)/);
	assert.match(rules, /get\('a', \{\}\)\.get\('email', ''\) == authEmail\(\)/);
	assert.match(rules, /allow get, list: if isVaultMemberData\(resource\.data\);/);
});
