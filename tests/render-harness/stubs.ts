/**
 * Scenario-driven stand-ins for the real stores. The page under test imports
 * these module paths, so the harness can render any session/vault/data
 * combination without Firebase.
 */
import { writable } from 'svelte/store';

export const authState = writable<unknown>({ status: 'loading', user: null, error: null });
export const vaultSession = writable<unknown>({ status: 'idle' });
export const vaultData = writable<unknown>({ status: 'idle' });

export function startAuthObserver(): void {}
export function signInWithGoogle(): void {}
export function signOutOfVault(): void {}
export function stopAuthObserver(): void {}
export function observeVaultSession(): void {}
export function clearVaultSession(): void {}
export function observeVaultData(): void {}
export function clearVaultData(): void {}
