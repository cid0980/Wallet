/**
 * Render harness for the real +page.svelte.
 *
 * Every reachable session/vault/data combination must produce visible UI. An
 * unmatched combination used to render a completely blank page, which is
 * indistinguishable from a crash for the person holding the phone. This script
 * renders each combination and fails when one comes out empty.
 *
 * Run with: npm run test:render
 */
import { render } from 'svelte/server';

import Page from '../../src/routes/+page.svelte';
// Relative import so TypeScript and the harness build resolve the same stub
// module instance that the page receives through the $lib aliases.
import { authState, vaultData, vaultSession } from './stubs';

const user = { displayName: 'Cid Partner', email: 'cid@example.com', uid: 'uid-cid' };

const vault = {
	id: 'vault-1',
	name: 'Our Vault',
	members: {
		a: { name: 'Cid Partner', email: 'cid@example.com' },
		b: { name: 'Partner Two', email: 'two@example.com' }
	},
	totals: { earned: 0, spent: 0, a: { received: 0, spent: 0 }, b: { received: 0, spent: 0 } },
	lastMutationId: null,
	createdAt: new Date(),
	updatedAt: new Date(),
	fromCache: false,
	pendingWrites: false
};

const readyData = {
	status: 'ready',
	clients: [],
	payments: [],
	expenses: [],
	mutations: [],
	fromCache: false,
	pendingWrites: false,
	error: null
};

type Scenario = {
	name: string;
	auth: unknown;
	session: unknown;
	data: unknown;
	/** Text that must appear in the rendered page. */
	expect?: string;
};

const scenarios: Scenario[] = [
	{ name: 'loading', auth: { status: 'loading', user: null, email: null, error: null }, session: { status: 'idle' }, data: { status: 'idle' }, expect: 'Checking your secure Vault session' },
	{ name: 'signed-out', auth: { status: 'signed-out', user: null, email: null, error: null }, session: { status: 'idle' }, data: { status: 'idle' }, expect: 'Continue with Google' },
	{ name: 'signing-in', auth: { status: 'signing-in', user: null, email: null, error: null }, session: { status: 'idle' }, data: { status: 'idle' }, expect: 'Opening Google' },
	{ name: 'session loading', auth: { status: 'signed-in', user, email: user.email, error: null }, session: { status: 'loading' }, data: { status: 'idle' }, expect: 'Finding your shared Vault' },
	{ name: 'no-vault', auth: { status: 'signed-in', user, email: user.email, error: null }, session: { status: 'no-vault' }, data: { status: 'idle' }, expect: 'Create the shared vault' },
	{ name: 'session error', auth: { status: 'signed-in', user, email: user.email, error: null }, session: { status: 'error', error: 'denied' }, data: { status: 'idle' }, expect: 'We could not open your Vault' },
	{ name: 'records loading', auth: { status: 'signed-in', user, email: user.email, error: null }, session: { status: 'ready', vault }, data: { status: 'loading' }, expect: 'Loading your shared records' },
	{ name: 'records error', auth: { status: 'signed-in', user, email: user.email, error: null }, session: { status: 'ready', vault }, data: { status: 'error', error: 'denied' }, expect: 'We could not load your records' },
	{ name: 'workspace', auth: { status: 'signed-in', user, email: user.email, error: null }, session: { status: 'ready', vault }, data: readyData, expect: 'Available balance' },
	{ name: 'signed-in without email (raw state)', auth: { status: 'signed-in', user: { ...user, email: null }, email: null, error: null }, session: { status: 'ready', vault }, data: readyData, expect: 'did not finish starting' },
	{ name: 'ready session without vault', auth: { status: 'signed-in', user, email: user.email, error: null }, session: { status: 'ready', vault: null }, data: readyData, expect: 'did not finish starting' },
	{ name: 'records ready before session', auth: { status: 'signed-in', user, email: user.email, error: null }, session: { status: 'no-vault' }, data: readyData, expect: 'Create the shared vault' },
	{ name: 'session never observed', auth: { status: 'signed-in', user, email: user.email, error: null }, session: { status: 'idle' }, data: readyData, expect: 'Finding your shared Vault' },
	{
		name: 'token email resolves where the record has none',
		auth: { status: 'signed-in', user: { ...user, email: null }, email: 'cid@example.com', error: null },
		session: { status: 'loading' },
		data: { status: 'idle' },
		expect: 'Finding your shared Vault'
	},
	{
		name: 'account without any email shows the startup card',
		auth: { status: 'signed-in', user: { ...user, email: null }, email: null, error: null },
		session: { status: 'ready', vault },
		data: readyData,
		expect: 'did not finish starting'
	},
	{ name: 'error state with message', auth: { status: 'error', user: null, email: null, error: 'auth/unauthorized-domain' }, session: { status: 'idle' }, data: { status: 'idle' }, expect: 'auth/unauthorized-domain' }
];

const failures: string[] = [];
const lines: string[] = [];

for (const scenario of scenarios) {
	(authState as { set: (value: unknown) => void }).set(scenario.auth);
	(vaultSession as { set: (value: unknown) => void }).set(scenario.session);
	(vaultData as { set: (value: unknown) => void }).set(scenario.data);

	try {
		const { body } = render(Page);
		const text = body
			.replace(/<[^>]*>/g, ' ')
			.replace(/\s+/g, ' ')
			.trim();

		if (text.length === 0) {
			failures.push(`${scenario.name}: rendered a blank page`);
			lines.push(`BLANK !! | ${scenario.name}`);
			continue;
		}

		if (scenario.expect && !text.includes(scenario.expect)) {
			failures.push(`${scenario.name}: missing expected text "${scenario.expect}"`);
			lines.push(`WRONG !! | ${scenario.name} | ${text.slice(0, 80)}`);
			continue;
		}

		lines.push(`ok      | ${scenario.name}`);
	} catch (error) {
		failures.push(`${scenario.name}: threw ${(error as Error).message}`);
		lines.push(`CRASH !! | ${scenario.name} | ${(error as Error).message}`);
	}
}

console.log(lines.join('\n'));

if (failures.length > 0) {
	console.error(`\nRender harness failed for ${failures.length} scenario(s):`);
	for (const failure of failures) {
		console.error(` - ${failure}`);
	}
	process.exit(1);
}

console.log(`\nAll ${scenarios.length} render scenarios show UI.`);
