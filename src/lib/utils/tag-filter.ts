/**
 * Tag + date-range filtering for the money tabs.
 *
 * Kept free of Svelte and Firebase imports so the rules that decide what a tag
 * filter shows can be unit-tested directly: which tags exist to tap, which
 * records belong to a tapped tag, and what the summary card adds up.
 */
import type { PartnerKey } from '$lib/types/vault';

export interface TaggedRecord {
	tags: string[];
	/** `YYYY-MM-DD`; compared as a string, which sorts correctly for this form. */
	occurredOn: string;
	amountPaise: number;
	partner: PartnerKey;
}

export type RangePreset = 'month' | 'last30' | 'fy' | 'all' | 'custom';

/** An empty bound means "open ended" on that side. */
export interface DateRange {
	from: string;
	to: string;
}

export const OPEN_RANGE: DateRange = { from: '', to: '' };

function dateKey(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

function shiftDays(base: Date, days: number): Date {
	const copy = new Date(base.getFullYear(), base.getMonth(), base.getDate());
	copy.setDate(copy.getDate() + days);
	return copy;
}

/**
 * Presets are computed from "today" at call time, so a tab left open across
 * midnight rolls over instead of pinning yesterday's month.
 */
export function presetRange(preset: RangePreset, today = new Date()): DateRange {
	switch (preset) {
		case 'month':
			return {
				from: dateKey(new Date(today.getFullYear(), today.getMonth(), 1)),
				to: dateKey(today)
			};
		case 'last30':
			return { from: dateKey(shiftDays(today, -29)), to: dateKey(today) };
		case 'fy': {
			// Indian financial year: 1 April – 31 March.
			const startYear = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
			return { from: `${startYear}-04-01`, to: dateKey(today) };
		}
		case 'all':
		case 'custom':
		default:
			return { ...OPEN_RANGE };
	}
}

export function rangeLabel(range: DateRange): string {
	if (!range.from && !range.to) {
		return 'All time';
	}

	return `${range.from || 'The beginning'} to ${range.to || 'today'}`;
}

export function inRange(dateKeyValue: string, range: DateRange): boolean {
	if (range.from && dateKeyValue < range.from) {
		return false;
	}

	if (range.to && dateKeyValue > range.to) {
		return false;
	}

	return true;
}

function uniqueTagList(tags: string[]): string[] {
	const seen = new Set<string>();
	const list: string[] = [];

	for (const raw of tags) {
		const tag = typeof raw === 'string' ? raw.trim() : '';
		if (!tag) {
			continue;
		}

		const key = tag.toLowerCase();
		if (seen.has(key)) {
			continue;
		}

		seen.add(key);
		list.push(tag);
	}

	return list;
}

/**
 * Every tag worth offering or filtering by: the shared vault list first (the
 * vault's own order is meaningful), then any tag found only on existing
 * records — including tags removed from the shared list, which the expense list
 * keeps forever. Without that second pass a tag you once used becomes
 * impossible to filter or reuse.
 */
export function buildTagVocabulary(sharedTags: string[], records: { tags?: string[] }[] = []): string[] {
	const shared = uniqueTagList(sharedTags);
	const seen = new Set(shared.map((tag) => tag.toLowerCase()));
	const extra: string[] = [];

	for (const record of records) {
		for (const tag of uniqueTagList(record.tags ?? [])) {
			const key = tag.toLowerCase();
			if (seen.has(key)) {
				continue;
			}

			seen.add(key);
			extra.push(tag);
		}
	}

	extra.sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
	return [...shared, ...extra];
}

export function hasTag(record: { tags?: string[] }, tag: string): boolean {
	const needle = tag.trim().toLowerCase();
	return (record.tags ?? []).some((entry) => entry.trim().toLowerCase() === needle);
}

export interface TagSummary {
	/** Signed paise: direction depends on the caller (spent vs received). */
	totalPaise: number;
	count: number;
	aPaise: number;
	bPaise: number;
}

export function summarizeRecords(records: TaggedRecord[]): TagSummary {
	const summary: TagSummary = { totalPaise: 0, count: 0, aPaise: 0, bPaise: 0 };

	for (const record of records) {
		summary.totalPaise += record.amountPaise;
		summary.count += 1;
		summary[record.partner === 'a' ? 'aPaise' : 'bPaise'] += record.amountPaise;
	}

	return summary;
}

export interface TagFilterOptions<T> {
	tag?: string | null;
	range?: DateRange;
}

/** Tagged + date-filtered list, preserving the incoming (newest-first) order. */
export function filterTaggedRecords<T extends TaggedRecord>(
	records: T[],
	{ tag = null, range = OPEN_RANGE }: TagFilterOptions<T> = {}
): T[] {
	return records.filter((record) => {
		if (tag && !hasTag(record, tag)) {
			return false;
		}

		return inRange(record.occurredOn, range);
	});
}

/**
 * Tags actually present on a set of records, in shared-list order. Used for the
 * filter bar, which should offer what this ledger really contains rather than
 * every tag the vault knows about.
 */
export function usedTags(records: { tags?: string[] }[], sharedTags: string[] = []): string[] {
	const used = new Set<string>();
	for (const record of records) {
		for (const tag of uniqueTagList(record.tags ?? [])) {
			used.add(tag.toLowerCase());
		}
	}

	return buildTagVocabulary(sharedTags, records).filter((tag) => used.has(tag.toLowerCase()));
}
