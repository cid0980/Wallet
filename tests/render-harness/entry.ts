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
	tags: ['Advertising', 'Contractor', 'Equipment', 'Office', 'Software', 'Travel', 'Other'],
	lastMutationId: null,
	createdAt: new Date(),
	updatedAt: new Date(),
	fromCache: false,
	pendingWrites: false
};

const readyData = {
	status: 'ready',
	clients: [],
	projects: [],
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
	/** Semantic markup must survive the refactor, not just the visible text. */
	expectMarkup?: string[];
};

const busyVault = {
	...vault,
	totals: {
		earned: 1500000,
		spent: 250000,
		a: { received: 1500000, spent: 0 },
		b: { received: 0, spent: 250000 }
	}
};

const busyData = {
	status: 'ready',
	clients: Array.from({ length: 5 }, (_, index) => ({
		id: `client-${index}`,
		name: `Client ${index + 1}`,
		contact: `client${index + 1}@example.com`,
		notes: '',
		isArchived: false,
		createdAt: new Date(),
		updatedAt: new Date(),
		createdBy: 'cid@example.com',
		updatedBy: 'cid@example.com'
	})),
	projects: [
		{
			id: 'project-1',
			name: 'Website build',
			clientId: 'client-0',
			clientName: 'Client 1',
			estimatedPaise: 6000000,
			status: 'active',
			note: 'Two pages left',
			createdAt: new Date(),
			updatedAt: new Date(),
			createdBy: 'cid@example.com',
			updatedBy: 'two@example.com'
		},
		{
			id: 'project-2',
			name: 'Logo set',
			clientId: 'client-1',
			clientName: 'Client 2',
			estimatedPaise: 100000,
			status: 'done',
			note: '',
			createdAt: new Date(),
			updatedAt: new Date(),
			createdBy: 'two@example.com',
			updatedBy: 'two@example.com'
		}
	],
	payments: [
		{
			id: 'payment-1',
			clientId: 'client-0',
			clientName: 'Client 1',
			projectId: 'project-1',
			projectName: 'Website build',
			amountPaise: 1500000,
			partner: 'a',
			occurredOn: '2026-10-14',
			note: 'Invoice 21',
			createdAt: new Date(),
			updatedAt: new Date(),
			createdBy: 'cid@example.com',
			updatedBy: 'cid@example.com',
			lastMutationId: 'mutation-1'
		}
	],
	expenses: [
		{
			id: 'expense-1',
			clientId: null,
			clientName: null,
			amountPaise: 250000,
			partner: 'b',
			tags: ['Software', 'Hosting'],
			occurredOn: '2026-10-13',
			note: 'Editor licence',
			createdAt: new Date(),
			updatedAt: new Date(),
			createdBy: 'two@example.com',
			updatedBy: 'two@example.com',
			lastMutationId: 'mutation-2'
		}
	],
	mutations: [
		{
			id: 'mutation-1',
			kind: 'payment-create',
			recordType: 'payment',
			recordId: 'payment-1',
			delta: { earned: 1500000, spent: 0, aReceived: 1500000, bReceived: 0, aSpent: 0, bSpent: 0 },
			actorEmail: 'cid@example.com',
			summary: 'Payment of ₹15,000 from Client 1',
			createdAt: new Date()
		},
		{
			id: 'mutation-2',
			kind: 'expense-create',
			recordType: 'expense',
			recordId: 'expense-1',
			delta: { earned: 0, spent: 250000, aReceived: 0, bReceived: 0, aSpent: 0, bSpent: 250000 },
			actorEmail: 'two@example.com',
			summary: 'Expense of ₹2,500 for Software',
			createdAt: new Date()
		}
	],
	fromCache: false,
	pendingWrites: false,
	error: null
};

const scenarios: Scenario[] = [
	{ name: 'loading', auth: { status: 'loading', user: null, email: null, error: null }, session: { status: 'idle' }, data: { status: 'idle' }, expect: 'Checking your secure Vault session' },
	{ name: 'signed-out', auth: { status: 'signed-out', user: null, email: null, error: null }, session: { status: 'idle' }, data: { status: 'idle' }, expect: 'Sign in' },
	{ name: 'signing-in', auth: { status: 'signing-in', user: null, email: null, error: null }, session: { status: 'idle' }, data: { status: 'idle' }, expect: 'Signing in' },
	{ name: 'session loading', auth: { status: 'signed-in', user, email: user.email, error: null }, session: { status: 'loading' }, data: { status: 'idle' }, expect: 'Finding your shared Vault' },
	{ name: 'no-vault', auth: { status: 'signed-in', user, email: user.email, error: null }, session: { status: 'no-vault' }, data: { status: 'idle' }, expect: 'Create the shared vault' },
	{ name: 'session error', auth: { status: 'signed-in', user, email: user.email, error: null }, session: { status: 'error', error: 'denied' }, data: { status: 'idle' }, expect: 'We could not open your Vault' },
	{ name: 'records loading', auth: { status: 'signed-in', user, email: user.email, error: null }, session: { status: 'ready', vault }, data: { status: 'loading' }, expect: 'Loading your shared records', expectMarkup: ['aria-busy="true"', 'class="skeleton-row"'] },
	{ name: 'records error', auth: { status: 'signed-in', user, email: user.email, error: null }, session: { status: 'ready', vault }, data: { status: 'error', error: 'denied' }, expect: 'We could not load your records' },
	{ name: 'workspace', auth: { status: 'signed-in', user, email: user.email, error: null }, session: { status: 'ready', vault }, data: readyData, expect: 'Available balance' },
	{ name: 'workspace with records', auth: { status: 'signed-in', user, email: user.email, error: null }, session: { status: 'ready', vault: busyVault }, data: busyData, expect: 'Latest changes', expectMarkup: ['class="skip-link"', 'id="vault-main"', 'aria-label="Vault sections"', 'role="progressbar"'] },
	{ name: 'empty workspace invites the first payment', auth: { status: 'signed-in', user, email: user.email, error: null }, session: { status: 'ready', vault }, data: readyData, expect: 'Nothing recorded yet' },
	{ name: 'offline workspace says so', auth: { status: 'signed-in', user, email: user.email, error: null }, session: { status: 'ready', vault: { ...busyVault, fromCache: true } }, data: { ...busyData, fromCache: true }, expect: 'Offline' },
	{ name: 'no clients yet', auth: { status: 'signed-in', user, email: user.email, error: null }, session: { status: 'ready', vault }, data: { ...busyData, clients: [], payments: [], mutations: [] }, expect: 'Latest changes' },
	{
		name: 'home shows project progress',
		auth: { status: 'signed-in', user, email: user.email, error: null },
		session: { status: 'ready', vault },
		data: busyData,
		expect: 'received of'
	},
	{
		name: 'project closes in on its estimate',
		auth: { status: 'signed-in', user, email: user.email, error: null },
		session: { status: 'ready', vault },
		data: {
			...busyData,
			projects: busyData.projects.map((project) => (project.id === 'project-1' ? { ...project, estimatedPaise: 1500000 } : project))
		},
		expect: 'Complete'
	},
	{
		name: 'expenses show spending tags',
		auth: { status: 'signed-in', user, email: user.email, error: null },
		session: { status: 'ready', vault },
		data: busyData,
		expect: 'Software'
	},
	{
		name: 'project records who edited the estimate',
		auth: { status: 'signed-in', user, email: user.email, error: null },
		session: { status: 'ready', vault },
		data: busyData,
		expect: 'two@example.com'
	},
	{
		name: 'empty projects invite the first one',
		auth: { status: 'signed-in', user, email: user.email, error: null },
		session: { status: 'ready', vault },
		data: { ...busyData, projects: [] },
		expect: 'No projects yet'
	},
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

		if (scenario.expectMarkup?.some((fragment) => !body.includes(fragment))) {
			const missing = scenario.expectMarkup.filter((fragment) => !body.includes(fragment));
			failures.push(`${scenario.name}: missing semantic markup ${missing.join(', ')}`);
			lines.push(`A11Y !! | ${scenario.name} | ${missing.join(', ')}`);
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
