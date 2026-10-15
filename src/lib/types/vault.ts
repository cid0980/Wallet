export type PartnerKey = 'a' | 'b';

/** Starter list of spending tags; the vault keeps its own editable copy. */
export const defaultSpendingTags = [
	'Advertising',
	'Contractor',
	'Equipment',
	'Office',
	'Software',
	'Travel',
	'Other'
] as const;

export const MAX_TAG_LENGTH = 40;
export const MAX_EXPENSE_TAGS = 5;
export const MAX_VAULT_TAGS = 12;

export type MoneyRecordType = 'payment' | 'expense';
export type MutationKind =
	| 'payment-create'
	| 'payment-update'
	| 'payment-delete'
	| 'expense-create'
	| 'expense-update'
	| 'expense-delete';

export type ProjectStatus = 'active' | 'done';

export interface VaultMember {
	name: string;
	email: string;
}

export interface PartnerTotals {
	received: number;
	spent: number;
}

/** All monetary values are non-negative integer paise. */
export interface VaultTotals {
	earned: number;
	spent: number;
	a: PartnerTotals;
	b: PartnerTotals;
}

export interface MutationDelta {
	earned: number;
	spent: number;
	aReceived: number;
	bReceived: number;
	aSpent: number;
	bSpent: number;
}

export interface VaultSetupInput {
	name: string;
	members: {
		a: VaultMember;
		b: VaultMember;
	};
}

export interface VaultSummary {
	id: string;
	name: string;
	members: {
		a: VaultMember;
		b: VaultMember;
	};
	totals: VaultTotals;
	/** Shared spending tags; defaults to `defaultSpendingTags` until edited. */
	tags: string[];
	lastMutationId: string | null;
	createdAt: Date | null;
	updatedAt: Date | null;
	fromCache: boolean;
	pendingWrites: boolean;
}

export interface ClientRecord {
	id: string;
	name: string;
	contact: string;
	notes: string;
	isArchived: boolean;
	createdAt: Date | null;
	updatedAt: Date | null;
	createdBy: string;
	updatedBy: string;
}

export interface ProjectRecord {
	id: string;
	name: string;
	clientId: string;
	clientName: string;
	estimatedPaise: number;
	status: ProjectStatus;
	note: string;
	createdAt: Date | null;
	updatedAt: Date | null;
	createdBy: string;
	updatedBy: string;
}

export interface PaymentRecord {
	id: string;
	clientId: string;
	clientName: string;
	projectId: string | null;
	projectName: string | null;
	amountPaise: number;
	partner: PartnerKey;
	occurredOn: string;
	note: string;
	createdAt: Date | null;
	updatedAt: Date | null;
	createdBy: string;
	updatedBy: string;
	lastMutationId: string;
}

export interface ExpenseRecord {
	id: string;
	clientId: string | null;
	clientName: string | null;
	amountPaise: number;
	partner: PartnerKey;
	tags: string[];
	occurredOn: string;
	note: string;
	createdAt: Date | null;
	updatedAt: Date | null;
	createdBy: string;
	updatedBy: string;
	lastMutationId: string;
}

export interface VaultMutation {
	id: string;
	kind: MutationKind;
	recordType: MoneyRecordType;
	recordId: string;
	delta: MutationDelta;
	actorEmail: string;
	summary: string;
	createdAt: Date | null;
}

export interface ClientInput {
	name: string;
	contact: string;
	notes: string;
}

export interface ProjectInput {
	name: string;
	clientId: string;
	clientName: string;
	estimatedPaise: number;
	note: string;
}

export interface PaymentInput {
	clientId: string;
	clientName: string;
	projectId: string | null;
	projectName: string | null;
	amountPaise: number;
	partner: PartnerKey;
	occurredOn: string;
	note: string;
}

export interface ExpenseInput {
	clientId: string | null;
	clientName: string | null;
	amountPaise: number;
	partner: PartnerKey;
	tags: string[];
	occurredOn: string;
	note: string;
}

export interface VaultDataSnapshot {
	clients: ClientRecord[];
	projects: ProjectRecord[];
	payments: PaymentRecord[];
	expenses: ExpenseRecord[];
	mutations: VaultMutation[];
	fromCache: boolean;
	pendingWrites: boolean;
}
