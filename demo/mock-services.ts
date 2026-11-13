/**
 * Drop-in replacement for `$lib/services/vault-data` in the local demo build.
 * Same signatures, in-memory effects, so the real Svelte components run
 * unchanged without Firebase.
 */
import type {
	ClientInput,
	ClientRecord,
	ExpenseInput,
	ExpenseRecord,
	PartnerKey,
	PaymentInput,
	PaymentRecord,
	ProjectInput,
	ProjectRecord,
	ProjectStatus,
	VaultDataSnapshot,
	VaultSummary
} from '$lib/types/vault';

import * as mock from './mock-state';

export function subscribeToVaultData(
	_vaultId: string,
	onData: (snapshot: VaultDataSnapshot) => void,
	_onError: (error: unknown) => void
): () => void {
	const push = () =>
		onData({
			clients: mock.state.clients,
			projects: mock.state.projects,
			payments: mock.state.payments,
			expenses: mock.state.expenses,
			mutations: mock.state.mutations,
			fromCache: false,
			pendingWrites: false
		});

	push();
	return mock.onChange(push);
}

export function vaultDataErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : 'The demo data layer failed.';
}

export async function createClient(_vaultId: string, input: ClientInput, actorEmail: string): Promise<void> {
	mock.clientCreate(input, actorEmail);
}

export async function updateClient(
	_vaultId: string,
	client: ClientRecord,
	input: ClientInput,
	actorEmail: string
): Promise<void> {
	mock.clientUpdate(client, input, actorEmail);
}

export async function setClientArchived(
	_vaultId: string,
	client: ClientRecord,
	isArchived: boolean,
	actorEmail: string
): Promise<void> {
	mock.clientArchive(client, isArchived, actorEmail);
}

export async function createProject(_vaultId: string, input: ProjectInput, actorEmail: string): Promise<void> {
	mock.projectCreate(input, actorEmail);
}

export async function updateProject(
	_vaultId: string,
	project: ProjectRecord,
	input: ProjectInput,
	actorEmail: string
): Promise<void> {
	mock.projectUpdate(project, input, actorEmail);
}

export async function setProjectStatus(
	_vaultId: string,
	projectId: string,
	status: ProjectStatus,
	actorEmail: string
): Promise<void> {
	mock.projectStatus(projectId, status, actorEmail);
}

export async function deleteProject(_vaultId: string, projectId: string): Promise<void> {
	mock.projectDelete(projectId);
}

export async function updateVaultTags(_vaultId: string, tags: string[]): Promise<void> {
	mock.vaultTags(tags);
}

export async function updateVaultMember(
	_vault: VaultSummary,
	partner: PartnerKey,
	name: string,
	email: string
): Promise<void> {
	mock.vaultMember(partner, name, email);
}

export async function createPayment(
	_vault: VaultSummary,
	input: PaymentInput,
	actorEmail: string
): Promise<void> {
	mock.paymentCreate(input, actorEmail);
}

export async function updatePayment(
	_vault: VaultSummary,
	payment: PaymentRecord,
	input: PaymentInput,
	actorEmail: string
): Promise<void> {
	mock.paymentUpdate(payment, input, actorEmail);
}

export async function deletePayment(
	_vault: VaultSummary,
	payment: PaymentRecord,
	actorEmail: string
): Promise<void> {
	mock.paymentDelete(payment, actorEmail);
}

export async function createExpense(
	_vault: VaultSummary,
	input: ExpenseInput,
	actorEmail: string
): Promise<void> {
	mock.expenseCreate(input, actorEmail);
}

export async function updateExpense(
	_vault: VaultSummary,
	expense: ExpenseRecord,
	input: ExpenseInput,
	actorEmail: string
): Promise<void> {
	mock.expenseUpdate(expense, input, actorEmail);
}

export async function deleteExpense(
	_vault: VaultSummary,
	expense: ExpenseRecord,
	actorEmail: string
): Promise<void> {
	mock.expenseDelete(expense, actorEmail);
}
