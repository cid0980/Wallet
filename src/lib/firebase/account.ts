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

export interface ProviderLike {
	providerId?: string;
	email?: string | null;
}

export interface AccountLike {
	email?: string | null;
	uid?: string;
	providerData?: ProviderLike[] | null;
	getIdTokenResult?: (forceRefresh?: boolean) => Promise<TokenLike>;
}

export interface AccountInspection {
	uid: string | null;
	providers: string[];
	recordEmail: string | null;
	providerEmail: string | null;
	claimsEmail: string | null;
	claimKeys: string[];
	/** The claims the Firestore rules test directly. */
	emailVerified: boolean | 'missing' | 'not-boolean';
	signInProvider: string | null;
	tokenError: string | null;
}

/** The email claim carried by the ID token, lower-cased by Google. */
export function emailFromClaims(claims: Record<string, unknown> | undefined): string | null {
	const value = claims?.email;
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** The email carried by the linked provider, which survives a stripped record. */
export function emailFromProviderData(user: AccountLike | null | undefined): string | null {
	for (const provider of user?.providerData ?? []) {
		const value = provider?.email;
		if (typeof value === 'string' && value.trim()) {
			return value.trim();
		}
	}

	return null;
}

async function tokenClaims(
	user: AccountLike | null | undefined,
	forceRefresh = false
): Promise<{ claims: Record<string, unknown> | undefined; error: string | null }> {
	if (!user?.getIdTokenResult) {
		return { claims: undefined, error: null };
	}

	try {
		const token = await user.getIdTokenResult(forceRefresh);
		return { claims: token.claims as Record<string, unknown> | undefined, error: null };
	} catch (error) {
		return { claims: undefined, error: error instanceof Error ? error.message : 'token lookup failed' };
	}
}

export interface ResolvedAccount {
	/** The best email available for identifying the account and the vault. */
	email: string | null;
	/**
	 * The email claim inside the ID token. This is the value the Firestore
	 * rules read, so an account can be identifiable and still unusable: a
	 * record created before the email scope existed keeps minting tokens with
	 * no `email` claim, and every read is denied.
	 */
	tokenEmail: string | null;
}

/**
 * Resolves the account email from every source Firebase can offer (user record,
 * linked provider entry, ID token claims) and reports the token's own claim.
 *
 * When the token carries no email, one forced refresh is attempted first: a
 * usable record sometimes mints its email only on the next token.
 */
export async function resolveAccount(
	user: AccountLike | null | undefined
): Promise<ResolvedAccount> {
	const recordEmail =
		typeof user?.email === 'string' && user.email.trim() ? user.email.trim() : null;
	const providerEmail = emailFromProviderData(user);

	let { claims } = await tokenClaims(user);
	let tokenEmail = emailFromClaims(claims);

	if (!tokenEmail) {
		const refreshed = await tokenClaims(user, true);
		claims = refreshed.claims ?? claims;
		tokenEmail = emailFromClaims(claims);
	}

	return {
		email: recordEmail ?? providerEmail ?? tokenEmail,
		tokenEmail
	};
}

/** Convenience wrapper for callers that only need the identifying email. */
export async function resolveAccountEmail(
	user: AccountLike | null | undefined
): Promise<string | null> {
	return (await resolveAccount(user)).email;
}

/**
 * Records what each email source returned, so a single screenshot of the
 * failure screen explains why a session could not be used.
 */
export async function inspectAccount(
	user: AccountLike | null | undefined
): Promise<AccountInspection> {
	const { claims, error } = await tokenClaims(user);

	const verified = claims?.email_verified;
	const firebaseClaim = claims?.firebase as { sign_in_provider?: unknown } | undefined;

	return {
		uid: user?.uid ?? null,
		providers: (user?.providerData ?? [])
			.map((provider) => provider?.providerId)
			.filter((providerId): providerId is string => Boolean(providerId)),
		recordEmail: typeof user?.email === 'string' && user.email.trim() ? user.email.trim() : null,
		providerEmail: emailFromProviderData(user),
		claimsEmail: emailFromClaims(claims),
		claimKeys: Object.keys(claims ?? {}).sort(),
		// The published rules require email_verified == true and
		// firebase.sign_in_provider == 'google.com'. Reporting both turns a
		// permission-denied from the rules into a readable answer.
		emailVerified:
			verified === undefined ? 'missing' : typeof verified === 'boolean' ? verified : 'not-boolean',
		signInProvider:
			typeof firebaseClaim?.sign_in_provider === 'string' ? firebaseClaim.sign_in_provider : null,
		tokenError: error
	};
}

/** Renders an inspection for on-screen display. */
export function formatInspection(inspection: AccountInspection): string {
	return [
		`uid: ${inspection.uid ?? 'none'}`,
		`providers: ${inspection.providers.join(', ') || 'none'}`,
		`record email: ${inspection.recordEmail ?? 'missing'}`,
		`provider email: ${inspection.providerEmail ?? 'missing'}`,
		`token email claim: ${inspection.claimsEmail ?? 'missing'}`,
		`token claim keys: ${inspection.claimKeys.join(', ') || 'none'}`,
		`token email_verified: ${inspection.emailVerified}`,
		`token sign_in_provider: ${inspection.signInProvider ?? 'missing'}`,
		`token lookup: ${inspection.tokenError ?? 'ok'}`
	].join('\n');
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
