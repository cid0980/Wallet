import { writable } from 'svelte/store';

import { subscribeToVaultData, vaultDataErrorMessage } from '$lib/services/vault-data';
import type {
	ClientRecord,
	ExpenseRecord,
	PaymentRecord,
	ProjectRecord,
	VaultDataSnapshot,
	VaultMutation
} from '$lib/types/vault';

export type VaultDataStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface VaultDataState {
	status: VaultDataStatus;
	clients: ClientRecord[];
	projects: ProjectRecord[];
	payments: PaymentRecord[];
	expenses: ExpenseRecord[];
	mutations: VaultMutation[];
	fromCache: boolean;
	pendingWrites: boolean;
	error: string | null;
}

const initialState: VaultDataState = {
	status: 'idle',
	clients: [],
	projects: [],
	payments: [],
	expenses: [],
	mutations: [],
	fromCache: false,
	pendingWrites: false,
	error: null
};

export const vaultData = writable<VaultDataState>(initialState);

let activeVaultId: string | null = null;
let dataUnsubscribe: (() => void) | undefined;

function updateFromSnapshot(snapshot: VaultDataSnapshot): void {
	vaultData.set({
		status: 'ready',
		clients: snapshot.clients,
		projects: snapshot.projects,
		payments: snapshot.payments,
		expenses: snapshot.expenses,
		mutations: snapshot.mutations,
		fromCache: snapshot.fromCache,
		pendingWrites: snapshot.pendingWrites,
		error: null
	});
}

export function observeVaultData(vaultId: string, force = false): void {
	if (!force && activeVaultId === vaultId) {
		return;
	}

	dataUnsubscribe?.();
	activeVaultId = vaultId;
	vaultData.set({ ...initialState, status: 'loading' });
	dataUnsubscribe = subscribeToVaultData(
		vaultId,
		(snapshot) => updateFromSnapshot(snapshot),
		(error) => {
			vaultData.set({
				...initialState,
				status: 'error',
				error: vaultDataErrorMessage(error)
			});
		}
	);
}

export function clearVaultData(): void {
	dataUnsubscribe?.();
	dataUnsubscribe = undefined;
	activeVaultId = null;
	vaultData.set(initialState);
}
