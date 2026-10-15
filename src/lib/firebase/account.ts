/**
 * A signed-in Google account normally always carries an email address, and
 * Vault needs it twice over: it selects the shared vault and it is the value
 * the Firestore rules compare against `request.auth.token.email`.
 *
 * Some accounts do not share one: restricted work, school, or admin-managed
 * Google accounts can return an ID token without an email claim. Firebase then
 * creates a user record whose identifier column is empty, the app has nothing
 * to look a vault up with, and every screen downstream stalls.
 *
 * These helpers resolve the email from the token as well as from the user
 * record, so the two can never disagree.
 */

export interface TokenLike {
	claims?: Record<string, unknown>;
}

export interface AccountLike {
	email?: string | null;
	uid?: string;
	providerData?: { providerId?: string }[] | null;
	getIdTokenResult?: () => Promise<TokenLike>;
}

/** The email claim carried by the ID token, lower-cased by Google. */
export function emailFromClaims(claims: Record<string, unknown> | undefined): string | null {
	const value = claims?.email;
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * Resolves the account email, preferring the user record and falling back to
 * the ID token claims when the record carries none.
 */
export async function resolveAccountEmail(
	user: AccountLike | null | undefined
): Promise<string | null> {
	if (typeof user?.email === 'string' && user.email.trim()) {
		return user.email.trim();
	}

	if (!user?.getIdTokenResult) {
		return null;
	}

	try {
		const token = await user.getIdTokenResult();
		return emailFromClaims(token.claims);
	} catch {
		return null;
	}
}

/** Short human-readable identification of an account, for diagnostics. */
export function describeAccount(user: AccountLike | null | undefined): string {
	if (!user) {
		return 'no account';
	}

	const providers = (user.providerData ?? [])
		.map((provider) => provider?.providerId)
		.filter((providerId): providerId is string => Boolean(providerId));

	return [
		user.uid ? `uid ${user.uid}` : null,
		providers.length > 0 ? `via ${providers.join(', ')}` : null,
		`email ${user.email?.trim() ? 'present' : 'missing'}`
	]
		.filter(Boolean)
		.join(' · ');
}
