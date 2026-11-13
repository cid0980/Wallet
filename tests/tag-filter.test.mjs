import assert from 'node:assert/strict';
import test from 'node:test';

import {
	buildTagVocabulary,
	filterTaggedRecords,
	hasTag,
	inRange,
	presetRange,
	rangeLabel,
	summarizeRecords,
	usedTags
} from '../src/lib/utils/tag-filter.ts';

const record = (tags, occurredOn, amountPaise, partner = 'a') => ({
	tags,
	occurredOn,
	amountPaise,
	partner
});

test('the vocabulary keeps the shared order, then appends orphan tags once', () => {
	const vocabulary = buildTagVocabulary(['Software', 'Travel'], [
		record(['Hosting'], '2026-11-01', 100),
		record(['software', 'Travel'], '2026-11-02', 100),
		record(['Hosting', 'Ads'], '2026-11-03', 100)
	]);

	assert.deepEqual(vocabulary, ['Software', 'Travel', 'Ads', 'Hosting']);
});

test('a tag removed from the shared list still exists on records', () => {
	// Settings says "Past expenses keep it": the tag must stay tappable.
	const vocabulary = buildTagVocabulary(['Software'], [record(['Old Vendor'], '2026-10-01', 500)]);
	assert.ok(vocabulary.includes('Old Vendor'));
});

test('tag matching is case-insensitive and trims whitespace', () => {
	assert.ok(hasTag({ tags: ['Software'] }, ' software '));
	assert.ok(!hasTag({ tags: [] }, 'Software'));
	assert.ok(!hasTag({}, 'Software'));
});

test('presets: this month runs from the 1st to today', () => {
	assert.deepEqual(presetRange('month', new Date(2026, 10, 13)), {
		from: '2026-11-01',
		to: '2026-11-13'
	});
});

test('presets: last 30 days includes today and the 29 before it', () => {
	assert.deepEqual(presetRange('last30', new Date(2026, 10, 13)), {
		from: '2026-10-15',
		to: '2026-11-13'
	});
});

test('presets: the financial year starts on 1 April', () => {
	assert.deepEqual(presetRange('fy', new Date(2026, 10, 13)), {
		from: '2026-04-01',
		to: '2026-11-13'
	});
	assert.deepEqual(presetRange('fy', new Date(2026, 1, 2)), {
		from: '2025-04-01',
		to: '2026-02-02'
	});
});

test('an empty bound is open ended, and all-time keeps everything', () => {
	assert.ok(inRange('2020-01-01', { from: '', to: '' }));
	assert.ok(inRange('2026-11-13', { from: '2026-11-01', to: '2026-11-13' }));
	assert.ok(!inRange('2026-10-31', { from: '2026-11-01', to: '2026-11-13' }));
	assert.ok(!inRange('2026-11-14', { from: '2026-11-01', to: '2026-11-13' }));
});

test('filtering combines the tapped tag with the date range', () => {
	const records = [
		record(['Software'], '2026-11-02', 100),
		record(['Software', 'Travel'], '2026-11-09', 200),
		record(['Travel'], '2026-11-10', 300),
		record(['Software'], '2026-10-01', 400)
	];

	const filtered = filterTaggedRecords(records, {
		tag: 'Software',
		range: { from: '2026-11-01', to: '2026-11-30' }
	});

	assert.deepEqual(
		filtered.map((entry) => entry.amountPaise),
		[100, 200]
	);
});

test('no tapped tag means the whole range, and the order is preserved', () => {
	const records = [record(['A'], '2026-11-02', 100), record(['B'], '2026-11-09', 200)];
	assert.deepEqual(
		filterTaggedRecords(records, { range: { from: '', to: '' } }).map((entry) => entry.amountPaise),
		[100, 200]
	);
});

test('the summary totals the filtered rows and splits them by partner', () => {
	const summary = summarizeRecords([
		record(['Software'], '2026-11-02', 100, 'a'),
		record(['Software'], '2026-11-03', 250, 'b'),
		record(['Software'], '2026-11-04', 50, 'a')
	]);

	assert.deepEqual(summary, { totalPaise: 400, count: 3, aPaise: 150, bPaise: 250 });
});

test('an empty selection summarises to zero rather than throwing', () => {
	assert.deepEqual(summarizeRecords([]), { totalPaise: 0, count: 0, aPaise: 0, bPaise: 0 });
});

test('the filter bar only offers tags this ledger actually used', () => {
	const payments = [record(['Retainer'], '2026-11-01', 100)];
	const tags = usedTags(payments, ['Software', 'Travel', 'Retainer']);
	assert.deepEqual(tags, ['Retainer']);
});

test('untagged records are simply absent from the tag bar', () => {
	const payments = [record([], '2026-11-01', 100), record(['Retainer'], '2026-11-02', 200)];
	assert.deepEqual(usedTags(payments, []), ['Retainer']);
});

test('the range label describes open bounds in words', () => {
	assert.equal(rangeLabel({ from: '', to: '' }), 'All time');
	assert.equal(rangeLabel({ from: '2026-11-01', to: '2026-11-13' }), '2026-11-01 to 2026-11-13');
});
