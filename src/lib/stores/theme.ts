/**
 * Theme for this device.
 *
 * 'auto' follows the phone; 'light' and 'dark' pin the choice. It is stored per
 * device on purpose — the vault itself stays theme-free, so two people can read
 * the same records on differently-lit phones.
 *
 * The choice is painted onto <html data-theme>, and the phone's status and
 * navigation bars are kept in step — see CHROME and manifestHref below for why
 * that has to go through the manifest and not just a meta tag.
 */
import { get, writable } from 'svelte/store';

export type ThemePref = 'auto' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_KEY = 'vault.theme';

/**
 * The two values the system bars are painted with — always the page background,
 * never the brand green, so the bars read as part of the app.
 *
 * An installed Android app builds these into its home-screen record at install
 * time and only ever reads them from the web app manifest (a meta tag is ignored
 * inside a standalone window), and a manifest holds a single colour. Hence one
 * manifest per theme, swapped through the <link rel="manifest"> tag.
 */
const CHROME: Record<ResolvedTheme, { color: string; manifest: string }> = {
	light: { color: '#f5f7f6', manifest: '/manifest.webmanifest' },
	dark: { color: '#0e1210', manifest: '/manifest.dark.webmanifest' }
};

export function manifestHref(theme: ResolvedTheme): string {
	return CHROME[theme].manifest;
}

export function chromeColor(theme: ResolvedTheme): string {
	return CHROME[theme].color;
}

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

/** Put the resolved theme on the document and on the system bars. */
function paint(pref: ThemePref): ResolvedTheme {
	const resolved = resolveTheme(pref);
	if (typeof document === 'undefined') return resolved;
	const root = document.documentElement;
	root.dataset.theme = resolved;
	root.style.colorScheme = resolved;
	const meta = document.querySelector('meta[name="theme-color"]');
	if (meta) meta.setAttribute('content', chromeColor(resolved));
	const link = document.querySelector('link[rel="manifest"]');
	if (link) link.setAttribute('href', manifestHref(resolved));
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
