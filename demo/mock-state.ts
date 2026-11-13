/**
 * In-memory stand-in for the Firestore-backed Vault.
 *
 * Only exists so the real UI can be exercised locally without Firebase
 * credentials. It mimics the service layer's signatures and rebuilds the
 * aggregate totals exactly the way the Firestore batches do.
 */
import type {
	ClientInput,
	ClientRecord,
	ExpenseInput,
	ExpenseRecord,
	MutationKind,
	PartnerKey,
	PaymentInput,
	PaymentRecord,
	ProjectInput,
	ProjectRecord,
	ProjectStatus,
	VaultMutation,
	VaultSummary,
	VaultTotals
} from '$lib/types/vault';
import { defaultSpendingTags } from '$lib/types/vault';

const actorName = (email: string) => email;

let seq = 0;
function nextId(prefix: string): string {
	seq += 1;
	return `${prefix}-demo-${seq.toString().padStart(3, '0')}`;
}

function daysAgo(days: number, hour = 10): Date {
	const date = new Date();
	date.setDate(date.getDate() - days);
	date.setHours(hour, 15, 0, 0);
	return date;
}

function dateKey(days: number): string {
	const date = new Date();
	date.setDate(date.getDate() - days);
	return date.toISOString().slice(0, 10);
}

const partnerA = { name: 'Arun Kumar', email: 'arun@studionorth.in' };
const partnerB = { name: 'Divya Ramesh', email: 'divya@studionorth.in' };

const clients: ClientRecord[] = [
	{
		id: 'client-nexus',
		name: 'Nexus Interiors',
		contact: 'bala@nexusinteriors.in',
		notes: 'Bengaluru showroom chain. Pays on the 1st and 15th.',
		isArchived: false,
		createdAt: daysAgo(96),
		updatedAt: daysAgo(20),
		createdBy: partnerA.email,
		updatedBy: partnerB.email
	},
	{
		id: 'client-greenleaf',
		name: 'GreenLeaf Ayurveda',
		contact: 'orders@greenleaf.co.in',
		notes: 'Packaging refresh. Wants invoice in their own template.',
		isArchived: false,
		createdAt: daysAgo(64),
		updatedAt: daysAgo(6),
		createdBy: partnerB.email,
		updatedBy: partnerA.email
	},
	{
		id: 'client-sundar',
		name: 'Sundar Textiles',
		contact: 'sundar@stextiles.in',
		notes: 'Catalog finished in September. Archive unless they reorder.',
		isArchived: true,
		createdAt: daysAgo(140),
		updatedAt: daysAgo(40),
		createdBy: partnerA.email,
		updatedBy: partnerA.email
	}
];

const projects: ProjectRecord[] = [
	{
		id: 'project-storefront',
		name: 'Storefront redesign',
		clientId: 'client-nexus',
		clientName: 'Nexus Interiors',
		estimatedPaise: 8_500_000,
		status: 'active',
		note: 'Home, category, and product pages. Two revision rounds.',
		createdAt: daysAgo(52),
		updatedAt: daysAgo(4),
		createdBy: partnerA.email,
		updatedBy: partnerB.email
	},
	{
		id: 'project-packaging',
		name: 'Logo & packaging',
		clientId: 'client-greenleaf',
		clientName: 'GreenLeaf Ayurveda',
		estimatedPaise: 4_200_000,
		status: 'active',
		note: 'Label illustrations for six SKUs.',
		createdAt: daysAgo(48),
		updatedAt: daysAgo(6),
		createdBy: partnerB.email,
		updatedBy: partnerA.email
	},
	{
		id: 'project-photography',
		name: 'Product photography',
		clientId: 'client-nexus',
		clientName: 'Nexus Interiors',
		estimatedPaise: 3_000_000,
		status: 'done',
		note: 'Shot at the Kochi warehouse.',
		createdAt: daysAgo(90),
		updatedAt: daysAgo(46),
		createdBy: partnerA.email,
		updatedBy: partnerA.email
	},
	{
		id: 'project-catalog',
		name: 'Catalog revamp',
		clientId: 'client-sundar',
		clientName: 'Sundar Textiles',
		estimatedPaise: 2_500_000,
		status: 'done',
		note: 'Closed after the September print run.',
		createdAt: daysAgo(130),
		updatedAt: daysAgo(42),
		createdBy: partnerB.email,
		updatedBy: partnerB.email
	}
];

const payments: PaymentRecord[] = [
	{
		id: 'payment-1',
		clientId: 'client-nexus',
		clientName: 'Nexus Interiors',
		projectId: 'project-storefront',
		projectName: 'Storefront redesign',
		amountPaise: 4_000_000,
		partner: 'a' as PartnerKey,
		tags: ['Advance'],
		occurredOn: dateKey(24),
		note: 'Advance on signing',
		createdAt: daysAgo(24),
		updatedAt: daysAgo(24),
		createdBy: partnerA.email,
		updatedBy: partnerA.email,
		lastMutationId: 'mutation-1'
	},
	{
		id: 'payment-2',
		clientId: 'client-greenleaf',
		clientName: 'GreenLeaf Ayurveda',
		projectId: 'project-packaging',
		projectName: 'Logo & packaging',
		amountPaise: 4_200_000,
		partner: 'b' as PartnerKey,
		tags: ['Final payment', 'Packaging'],
		occurredOn: dateKey(6),
		note: 'Full and final, UPI',
		createdAt: daysAgo(6),
		updatedAt: daysAgo(6),
		createdBy: partnerB.email,
		updatedBy: partnerB.email,
		lastMutationId: 'mutation-2'
	},
	{
		id: 'payment-3',
		clientId: 'client-nexus',
		clientName: 'Nexus Interiors',
		projectId: 'project-storefront',
		projectName: 'Storefront redesign',
		amountPaise: 2_000_000,
		partner: 'b' as PartnerKey,
		tags: ['Milestone'],
		occurredOn: dateKey(11),
		note: 'Second milestone',
		createdAt: daysAgo(11),
		updatedAt: daysAgo(11),
		createdBy: partnerB.email,
		updatedBy: partnerB.email,
		lastMutationId: 'mutation-3'
	},
	{
		id: 'payment-4',
		clientId: 'client-nexus',
		clientName: 'Nexus Interiors',
		projectId: 'project-photography',
		projectName: 'Product photography',
		amountPaise: 3_000_000,
		partner: 'a' as PartnerKey,
		tags: [],
		occurredOn: dateKey(46),
		note: 'Settled with the September invoice',
		createdAt: daysAgo(46),
		updatedAt: daysAgo(46),
		createdBy: partnerA.email,
		updatedBy: partnerA.email,
		lastMutationId: 'mutation-4'
	}
];

const expenses: ExpenseRecord[] = [
	{
		id: 'expense-1',
		clientId: null,
		clientName: null,
		amountPaise: 423_900,
		partner: 'a' as PartnerKey,
		tags: ['Software'],
		occurredOn: dateKey(12),
		note: 'Adobe CC — both seats',
		createdAt: daysAgo(12),
		updatedAt: daysAgo(12),
		createdBy: partnerA.email,
		updatedBy: partnerA.email,
		lastMutationId: 'mutation-5'
	},
	{
		id: 'expense-2',
		clientId: 'client-nexus',
		clientName: 'Nexus Interiors',
		amountPaise: 1_200_000,
		partner: 'b' as PartnerKey,
		tags: ['Contractor'],
		occurredOn: dateKey(19),
		note: 'Rajesh — front-end build, 4 days',
		createdAt: daysAgo(19),
		updatedAt: daysAgo(19),
		createdBy: partnerB.email,
		updatedBy: partnerB.email,
		lastMutationId: 'mutation-6'
	},
	{
		id: 'expense-3',
		clientId: null,
		clientName: null,
		amountPaise: 185_000,
		partner: 'a' as PartnerKey,
		tags: ['Travel'],
		occurredOn: dateKey(5),
		note: 'Train to Chennai for the Nexus shoot review',
		createdAt: daysAgo(5),
		updatedAt: daysAgo(5),
		createdBy: partnerA.email,
		updatedBy: partnerA.email,
		lastMutationId: 'mutation-7'
	},
	{
		id: 'expense-4',
		clientId: 'client-greenleaf',
		clientName: 'GreenLeaf Ayurveda',
		amountPaise: 650_000,
		partner: 'b' as PartnerKey,
		tags: ['Advertising'],
		occurredOn: dateKey(3),
		note: 'Boosting the packaging launch post',
		createdAt: daysAgo(3),
		updatedAt: daysAgo(3),
		createdBy: partnerB.email,
		updatedBy: partnerB.email,
		lastMutationId: 'mutation-8'
	}
];

const mutations: VaultMutation[] = [
	{
		id: 'mutation-8',
		kind: 'expense-create' as MutationKind,
		recordType: 'expense',
		recordId: 'expense-4',
		delta: { earned: 0, spent: 650_000, aReceived: 0, bReceived: 0, aSpent: 0, bSpent: 650_000 },
		actorEmail: partnerB.email,
		summary: 'Added ₹6,500.00 expense · GreenLeaf Ayurveda · Advertising',
		createdAt: daysAgo(3)
	},
	{
		id: 'mutation-3',
		kind: 'payment-create' as MutationKind,
		recordType: 'payment',
		recordId: 'payment-3',
		delta: { earned: 2_000_000, spent: 0, aReceived: 0, bReceived: 2_000_000, aSpent: 0, bSpent: 0 },
		actorEmail: partnerB.email,
		summary: 'Recorded ₹20,000.00 payment · Nexus Interiors',
		createdAt: daysAgo(11)
	},
	{
		id: 'mutation-2',
		kind: 'payment-create' as MutationKind,
		recordType: 'payment',
		recordId: 'payment-2',
		delta: { earned: 4_200_000, spent: 0, aReceived: 0, bReceived: 4_200_000, aSpent: 0, bSpent: 0 },
		actorEmail: partnerB.email,
		summary: 'Recorded ₹42,000.00 payment · GreenLeaf Ayurveda',
		createdAt: daysAgo(6)
	},
	{
		id: 'mutation-7',
		kind: 'expense-create' as MutationKind,
		recordType: 'expense',
		recordId: 'expense-3',
		delta: { earned: 0, spent: 185_000, aReceived: 0, bReceived: 0, aSpent: 185_000, bSpent: 0 },
		actorEmail: partnerA.email,
		summary: 'Added ₹1,850.00 expense · Travel',
		createdAt: daysAgo(5)
	}
];

const vault: VaultSummary = {
	id: 'vault-demo',
	name: 'Studio North',
	members: { a: { ...partnerA }, b: { ...partnerB } },
	totals: { earned: 0, spent: 0, a: { received: 0, spent: 0 }, b: { received: 0, spent: 0 } },
	tags: [...defaultSpendingTags],
	lastMutationId: 'mutation-8',
	createdAt: daysAgo(160),
	updatedAt: daysAgo(3),
	fromCache: false,
	pendingWrites: false
};

export const state = { clients, projects, payments, expenses, mutations, vault };

type Listener = () => void;
const listeners = new Set<Listener>();

export function onChange(listener: Listener): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function notify(): void {
	rebuildTotals();
	for (const listener of listeners) listener();
}

export function rebuildTotals(): void {
	const totals: VaultTotals = {
		earned: 0,
		spent: 0,
		a: { received: 0, spent: 0 },
		b: { received: 0, spent: 0 }
	};

	for (const payment of state.payments) {
		totals.earned += payment.amountPaise;
		totals[payment.partner].received += payment.amountPaise;
	}

	for (const expense of state.expenses) {
		totals.spent += expense.amountPaise;
		totals[expense.partner].spent += expense.amountPaise;
	}

	state.vault.totals = totals;
}

rebuildTotals();

function logMutation(kind: MutationKind, recordId: string, summary: string, actor: string): string {
	const id = nextId('mutation');
	state.mutations = [
		{
			id,
			kind,
			recordType: kind.startsWith('payment') ? 'payment' : 'expense',
			recordId,
			delta: { earned: 0, spent: 0, aReceived: 0, bReceived: 0, aSpent: 0, bSpent: 0 },
			actorEmail: actorName(actor),
			summary,
			createdAt: new Date()
		},
		...state.mutations
	];
	state.vault.lastMutationId = id;
	return id;
}

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

export function clientCreate(input: ClientInput, actor: string): void {
	state.clients = [
		{
			id: nextId('client'),
			name: input.name.trim(),
			contact: input.contact.trim(),
			notes: input.notes.trim(),
			isArchived: false,
			createdAt: new Date(),
			updatedAt: new Date(),
			createdBy: actor,
			updatedBy: actor
		},
		...state.clients
	];
	notify();
}

export function clientUpdate(client: ClientRecord, input: ClientInput, actor: string): void {
	state.clients = state.clients.map((row) =>
		row.id === client.id
			? {
					...row,
					name: input.name.trim(),
					contact: input.contact.trim(),
					notes: input.notes.trim(),
					updatedAt: new Date(),
					updatedBy: actor
				}
			: row
	);
	state.projects = state.projects.map((project) =>
		project.clientId === client.id ? { ...project, clientName: input.name.trim() } : project
	);
	notify();
}

export function clientArchive(client: ClientRecord, isArchived: boolean, actor: string): void {
	state.clients = state.clients.map((row) =>
		row.id === client.id ? { ...row, isArchived, updatedAt: new Date(), updatedBy: actor } : row
	);
	notify();
}

export function projectCreate(input: ProjectInput, actor: string): void {
	state.projects = [
		{
			id: nextId('project'),
			name: input.name.trim(),
			clientId: input.clientId,
			clientName: input.clientName,
			estimatedPaise: input.estimatedPaise,
			status: 'active' as ProjectStatus,
			note: input.note.trim(),
			createdAt: new Date(),
			updatedAt: new Date(),
			createdBy: actor,
			updatedBy: actor
		},
		...state.projects
	];
	notify();
}

export function projectUpdate(project: ProjectRecord, input: ProjectInput, actor: string): void {
	state.projects = state.projects.map((row) =>
		row.id === project.id
			? {
					...row,
					name: input.name.trim(),
					clientId: input.clientId,
					clientName: input.clientName,
					estimatedPaise: input.estimatedPaise,
					note: input.note.trim(),
					updatedAt: new Date(),
					updatedBy: actor
				}
			: row
	);
	state.payments = state.payments.map((payment) =>
		payment.projectId === project.id
			? { ...payment, projectName: input.name.trim(), clientName: input.clientName, clientId: input.clientId }
			: payment
	);
	notify();
}

export function projectStatus(projectId: string, status: ProjectStatus, actor: string): void {
	state.projects = state.projects.map((row) =>
		row.id === projectId ? { ...row, status, updatedAt: new Date(), updatedBy: actor } : row
	);
	notify();
}

export function projectDelete(projectId: string): void {
	state.projects = state.projects.filter((row) => row.id !== projectId);
	state.payments = state.payments.map((payment) =>
		payment.projectId === projectId ? { ...payment, projectId: null, projectName: null } : payment
	);
	notify();
}

export function vaultTags(tags: string[]): void {
	state.vault.tags = tags;
	notify();
}

export function vaultMember(partner: PartnerKey, name: string, email: string): void {
	state.vault.members[partner] = { name: name.trim(), email: email.trim() };
	notify();
}

export function paymentCreate(input: PaymentInput, actor: string): void {
	const id = nextId('payment');
	const lastMutationId = logMutation(
		'payment-create',
		id,
		`Recorded ${rupees(input.amountPaise)} payment · ${input.clientName}`,
		actor
	);
	state.payments = [
		{
			id,
			clientId: input.clientId,
			clientName: input.clientName,
			projectId: input.projectId,
			projectName: input.projectName,
			amountPaise: input.amountPaise,
			partner: input.partner,
			tags: [...input.tags],
			occurredOn: input.occurredOn,
			note: input.note.trim(),
			createdAt: new Date(),
			updatedAt: new Date(),
			createdBy: actor,
			updatedBy: actor,
			lastMutationId
		},
		...state.payments
	];
	notify();
}

export function paymentUpdate(payment: PaymentRecord, input: PaymentInput, actor: string): void {
	const lastMutationId = logMutation(
		'payment-update',
		payment.id,
		`Edited payment · ${input.clientName}`,
		actor
	);
	state.payments = state.payments.map((row) =>
		row.id === payment.id
			? {
					...row,
					clientId: input.clientId,
					clientName: input.clientName,
					projectId: input.projectId,
					projectName: input.projectName,
					amountPaise: input.amountPaise,
					partner: input.partner,
					tags: [...input.tags],
					occurredOn: input.occurredOn,
					note: input.note.trim(),
					updatedAt: new Date(),
					updatedBy: actor,
					lastMutationId
				}
			: row
	);
	notify();
}

export function paymentDelete(payment: PaymentRecord, actor: string): void {
	logMutation('payment-delete', payment.id, `Deleted payment · ${payment.clientName}`, actor);
	state.payments = state.payments.filter((row) => row.id !== payment.id);
	notify();
}

export function expenseCreate(input: ExpenseInput, actor: string): void {
	const id = nextId('expense');
	const lastMutationId = logMutation(
		'expense-create',
		id,
		`Added ${rupees(input.amountPaise)} expense · ${input.tags.join(', ') || 'Untagged'}`,
		actor
	);
	state.expenses = [
		{
			id,
			clientId: input.clientId,
			clientName: input.clientName,
			amountPaise: input.amountPaise,
			partner: input.partner,
			tags: input.tags,
			occurredOn: input.occurredOn,
			note: input.note.trim(),
			createdAt: new Date(),
			updatedAt: new Date(),
			createdBy: actor,
			updatedBy: actor,
			lastMutationId
		},
		...state.expenses
	];
	notify();
}

export function expenseUpdate(expense: ExpenseRecord, input: ExpenseInput, actor: string): void {
	const lastMutationId = logMutation(
		'expense-update',
		expense.id,
		`Edited expense · ${input.tags.join(', ') || 'Untagged'}`,
		actor
	);
	state.expenses = state.expenses.map((row) =>
		row.id === expense.id
			? {
					...row,
					clientId: input.clientId,
					clientName: input.clientName,
					amountPaise: input.amountPaise,
					partner: input.partner,
					tags: input.tags,
					occurredOn: input.occurredOn,
					note: input.note.trim(),
					updatedAt: new Date(),
					updatedBy: actor,
					lastMutationId
				}
			: row
	);
	notify();
}

export function expenseDelete(expense: ExpenseRecord, actor: string): void {
	logMutation('expense-delete', expense.id, `Deleted expense · ${rupees(expense.amountPaise)}`, actor);
	state.expenses = state.expenses.filter((row) => row.id !== expense.id);
	notify();
}
