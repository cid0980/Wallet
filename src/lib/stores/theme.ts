/**
 * Theme for this device.
 *
 * 'auto' follows the phone; 'light' and 'dark' pin the choice. It is stored per
 * device on purpose — the vault itself stays theme-free, so two people can read
 * the same records on differently-lit phones.
 *
 * The choice is painted onto <html data-theme> and the browser chrome
 * (theme-color) is kept in step, so the status and navigation bars never carry
 * a colour of their own.
 */
import { get, writable } from 'svelte/store';

export type ThemePref = 'auto' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_KEY = 'vault.theme';

/** Kept in sync with --bg in app.css: the chrome should read as part of the page. */
const CHROME_COLOR: Record<ResolvedTheme, string> = {
	light: '#f5f7f6',
	dark: '#0e1210'
};

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

/** Put the resolved theme on the document and on the browser chrome. */
function paint(pref: ThemePref): ResolvedTheme {
	const resolved = resolveTheme(pref);
	if (typeof document === 'undefined') return resolved;
	const root = document.documentElement;
	root.dataset.theme = resolved;
	root.style.colorScheme = resolved;
	const meta = document.querySelector('meta[name="theme-color"]');
	if (meta) meta.setAttribute('content', CHROME_COLOR[resolved]);
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
