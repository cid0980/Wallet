/**
 * Theme for this device.
 *
 * 'auto' follows the phone; 'light' and 'dark' pin the choice. It is stored per
 * device on purpose — the vault itself stays theme-free, so two people can read
 * the same records on differently-lit phones.
 *
 * The choice is painted onto <html data-theme>, and that is all: the app
 * declares no theme colour anywhere, so the phone's status and navigation bars
 * stay the system's own instead of being tinted.
 */
import { get, writable } from 'svelte/store';

export type ThemePref = 'auto' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_KEY = 'vault.theme';

const DARK_QUERY = '(prefers-color-scheme: dark)';

function systemQuery(): MediaQueryList | null {
	if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
	return window.matchMedia(DARK_QUERY);
}

function readStored(): ThemePref {
	if (typeof window === 'undefined') return 'auto';
	try {
		const value = window.localStorage.getItem(THEME_KEY);
		return value === 'light' || value === 'dark' || value === 'auto' ? value : 'auto';
	} catch {
		return 'auto';
	}
}

export function isThemePref(value: unknown): value is ThemePref {
	return value === 'auto' || value === 'light' || value === 'dark';
}

export function resolveTheme(pref: ThemePref): ResolvedTheme {
	if (pref === 'light' || pref === 'dark') return pref;
	return systemQuery()?.matches ? 'dark' : 'light';
}

/** Put the resolved theme on the document. */
function paint(pref: ThemePref): ResolvedTheme {
	const resolved = resolveTheme(pref);
	if (typeof document === 'undefined') return resolved;
	const root = document.documentElement;
	root.dataset.theme = resolved;
	root.style.colorScheme = resolved;
	return resolved;
}

export const themePref = writable<ThemePref>(readStored());
export const resolvedTheme = writable<ResolvedTheme>('light');

if (typeof window !== 'undefined') {
	themePref.subscribe((pref) => {
		resolvedTheme.set(paint(pref));
		try {
			window.localStorage.setItem(THEME_KEY, pref);
		} catch {
			/* Private mode: the choice simply won't survive a reload. */
		}
	});
	// 'auto' has to follow the phone while the app is open, not only at boot.
	systemQuery()?.addEventListener('change', () => paint(get(themePref)));
}

export function setThemePref(pref: ThemePref): void {
	themePref.set(pref);
}
