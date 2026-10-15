import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeAuthDomain } from '../src/lib/firebase/auth-domain.ts';

const projectId = 'valet-07';
const fallback = 'valet-07.firebaseapp.com';

test('keeps a correct Firebase auth domain', () => {
	assert.equal(normalizeAuthDomain('valet-07.firebaseapp.com', projectId), fallback);
	assert.equal(normalizeAuthDomain('  valet-07.firebaseapp.com  ', projectId), fallback);
});

test('repairs a deployment URL pasted into VITE_FIREBASE_AUTH_DOMAIN', () => {
	// This exact misconfiguration broke Google sign-in in production:
	// Firebase builds `https://${authDomain}/__/auth/handler`, so a URL here
	// produced the unusable `https://https://wallet-neon-ten.vercel.app/...`.
	assert.equal(normalizeAuthDomain('https://wallet-neon-ten.vercel.app/', projectId), fallback);
	assert.equal(normalizeAuthDomain('https://wallet-neon-ten.vercel.app', projectId), fallback);
	assert.equal(normalizeAuthDomain('http://wallet-git-main.vercel.app/', projectId), fallback);
	assert.equal(normalizeAuthDomain('wallet-neon-ten.vercel.app/', projectId), fallback);
});

test('falls back when the auth domain is missing or meaningless', () => {
	assert.equal(normalizeAuthDomain('', projectId), fallback);
	assert.equal(normalizeAuthDomain('   ', projectId), fallback);
	assert.equal(normalizeAuthDomain('valet-07', projectId), fallback);
	assert.equal(normalizeAuthDomain('localhost', projectId), fallback);
	assert.equal(normalizeAuthDomain('http://localhost:5173/', projectId), fallback);
	assert.equal(normalizeAuthDomain('http://127.0.0.1:5173', projectId), fallback);
});

test('accepts a custom Firebase auth domain', () => {
	assert.equal(normalizeAuthDomain('auth.example.com', projectId), 'auth.example.com');
	assert.equal(normalizeAuthDomain('https://auth.example.com/', projectId), 'auth.example.com');
	assert.equal(normalizeAuthDomain('valet-07.web.app', projectId), 'valet-07.web.app');
});

test('falls back to the redirect flow only for pop-up environment failures', async () => {
	const { shouldFallBackToRedirect, firebaseErrorCode } = await import(
		'../src/lib/firebase/sign-in-strategy.ts'
	);

	assert.equal(firebaseErrorCode({ code: 'auth/popup-blocked' }), 'auth/popup-blocked');
	assert.equal(firebaseErrorCode(new Error('plain')), undefined);

	// Environments that cannot show a pop-up.
	assert.equal(shouldFallBackToRedirect({ code: 'auth/popup-blocked' }), true);
	assert.equal(
		shouldFallBackToRedirect({ code: 'auth/operation-not-supported-in-this-environment' }),
		true
	);

	// Real configuration or user problems must surface, never loop.
	assert.equal(shouldFallBackToRedirect({ code: 'auth/unauthorized-domain' }), false);
	assert.equal(shouldFallBackToRedirect({ code: 'auth/operation-not-allowed' }), false);
	assert.equal(shouldFallBackToRedirect({ code: 'auth/popup-closed-by-user' }), false);
	assert.equal(shouldFallBackToRedirect(new Error('plain')), false);
});
