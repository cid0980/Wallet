/**
 * Turns a Firestore error code into the one action that fixes it. Kept free of
 * app imports so it can be unit-tested directly.
 */
export function describeAccessProbe(code: string): string {
	switch (code) {
		case 'permission-denied':
			return 'Rules deny this account at /vaults. Either the published rules are still the locked or bootstrap set, or the token does not carry a verified email that matches the vault member list. See the claims below.';
		case 'unavailable':
			return 'Firestore could not be reached from this device. Check the connection and try again.';
		case 'failed-precondition':
			return 'The browser refused local storage for Firestore. Leave private browsing or allow site data.';
		default:
			return `The access check failed with ${code}.`;
	}
}

/**
 * A document that never exists. Reading it separates "the rules or the token
 * claims deny this account" from "reads work; the vault simply is not there".
 */
export const ACCESS_PROBE_COLLECTION = 'vaults';
export const ACCESS_PROBE_DOCUMENT = 'vault-access-probe';
