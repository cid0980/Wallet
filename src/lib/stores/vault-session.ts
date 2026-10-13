import { writable } from 'svelte/store';

import {
	subscribeToVaultMembership,
	vaultErrorMessage,
	type VaultMembershipResult
} from '$lib/services/vault-bootstrap';
import type { VaultSummary } from '$lib/types/vault';

export type VaultSessionStatus = 'idle' | 'loading' | 'no-vault' | 'ready' | 'error';

export interface VaultSessionState {
	status: VaultSessionStatus;
	vault: VaultSummary | null;
	vaultCount: number;
	fromCache: boolean;
	error: string | null;
}

const initialState: VaultSessionState = {
	status: 'idle',
	vault: null,
	vaultCount: 0,
	fromCache: false,
	error: null
};

export const vaultSession = writable<VaultSessionState>(initialState);

let activeEmail: string | null = null;
let membershipUnsubscribe: (() => void) | undefined;

function updateFromMembership(result: VaultMembershipResult): void {
	const [vault] = result.vaults;

	vaultSession.set({
		status: vault ? 'ready' : 'no-vault',
		vault: vault ?? null,
		vaultCount: result.vaults.length,
		fromCache: result.fromCache,
		error: null
	});
}

export function observeVaultSession(email: string, force = false): void {
	if (!force && activeEmail === email) {
		return;
	}

	membershipUnsubscribe?.();
	activeEmail = email;
	vaultSession.set({
		status: 'loading',
		vault: null,
		vaultCount: 0,
		fromCache: false,
		error: null
	});

	membershipUnsubscribe = subscribeToVaultMembership(
		email,
		(result) => updateFromMembership(result),
		(error) => {
			vaultSession.set({
				status: 'error',
				vault: null,
				vaultCount: 0,
				fromCache: false,
				error: vaultErrorMessage(error)
			});
		}
	);
}

export function clearVaultSession(): void {
	membershipUnsubscribe?.();
	membershipUnsubscribe = undefined;
	activeEmail = null;
	vaultSession.set(initialState);
}
