import type { FirebaseError } from 'firebase/app';

/**
 * Pop-up failures that mean "this browser or environment cannot show a pop-up
 * at all", where the full-page redirect flow is still worth trying as a
 * fallback. Authorisation failures (for example `auth/unauthorized-domain`)
 * are deliberately absent: retrying those through the redirect flow would only
 * loop the user back to the sign-in screen with no explanation.
 */
export const POPUP_FALLBACK_CODES = [
	'auth/popup-blocked',
	'auth/operation-not-supported-in-this-environment',
	'auth/internal-error'
] as const;

export function firebaseErrorCode(error: unknown): string | undefined {
	const code = (error as Partial<FirebaseError>)?.code;
	return typeof code === 'string' ? code : undefined;
}

export function shouldFallBackToRedirect(error: unknown): boolean {
	const code = firebaseErrorCode(error);
	return code !== undefined && (POPUP_FALLBACK_CODES as readonly string[]).includes(code);
}
