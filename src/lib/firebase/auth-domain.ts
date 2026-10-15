/**
 * Firebase Auth builds the Google sign-in handler URL as
 * `https://${authDomain}/__/auth/handler`. The value must therefore be a bare
 * host name such as `your-project.firebaseapp.com`.
 *
 * Deployment dashboards make it easy to paste the website URL (for example
 * `https://wallet-neon-ten.vercel.app/`) into VITE_FIREBASE_AUTH_DOMAIN, which
 * produces `https://https://wallet-neon-ten.vercel.app//__/auth/handler` and
 * breaks Google sign-in completely. Normalize whatever is configured and fall
 * back to the project's default Firebase auth domain when the value cannot be
 * a Firebase auth host.
 */
export function normalizeAuthDomain(value: string, projectId: string): string {
	const fallback = `${projectId}.firebaseapp.com`;

	if (typeof value !== 'string') {
		return fallback;
	}

	let domain = value.trim().replace(/^https?:\/\//i, '');
	domain = domain.split('/')[0].split('?')[0].split('#')[0].trim();

	if (
		!domain ||
		domain === projectId ||
		domain.includes('localhost') ||
		domain.startsWith('127.0.0.1') ||
		domain.startsWith('0.0.0.0')
	) {
		return fallback;
	}

	// A deployed website host is never a Firebase auth domain. Only Firebase
	// managed hosts are accepted here, so a pasted deployment URL self-heals.
	if (domain.endsWith('.vercel.app') || domain.endsWith('.netlify.app')) {
		return fallback;
	}

	return domain;
}
