import { test } from 'node:test';
import assert from 'node:assert/strict';

import { formatPaise, formatSignedPaise, netPaise } from '../src/lib/utils/money.ts';
import {
	paidByProject,
	paymentStateLabel,
	projectPaymentStatus
} from '../src/lib/utils/project-payment-status.ts';

test('a part-paid project is never reported as covered', () => {
	const status = projectPaymentStatus(1000_00, 600_00);
	assert.equal(status.state, 'part-paid');
	assert.equal(status.covered, false);
	assert.equal(status.remainingPaise, 400_00);
});

test('deleting the only payment returns the project to unpaid', () => {
	const before = paidByProject([{ projectId: 'p1', amountPaise: 1000_00 }]);
	assert.equal(projectPaymentStatus(1000_00, before.p1).state, 'fully-paid');

	const after = paidByProject([]);
	const status = projectPaymentStatus(1000_00, after.p1 ?? 0);
	assert.equal(status.state, 'unpaid');
	assert.equal(status.covered, false);
	assert.equal(status.remainingPaise, 1000_00);
});

test('each payment record is counted exactly once, per project', () => {
	const paid = paidByProject([
		{ projectId: 'p1', amountPaise: 600_00 },
		{ projectId: 'p1', amountPaise: 400_00 },
		{ projectId: 'p2', amountPaise: 5000_00 },
		{ projectId: null, amountPaise: 999_00 }
	]);

	assert.equal(paid.p1, 1000_00);
	assert.equal(paid.p2, 5000_00);
	assert.equal(projectPaymentStatus(1000_00, paid.p1).state, 'fully-paid');
	// A payment on another project must not leak into this one.
	assert.equal(projectPaymentStatus(1000_00, paid.p3 ?? 0).state, 'unpaid');
});

test('zero, negative and malformed amounts never inflate a total', () => {
	const paid = paidByProject([
		{ projectId: 'p1', amountPaise: 0 },
		{ projectId: 'p1', amountPaise: -50_00 },
		{ projectId: 'p1', amountPaise: 1.5 }
	]);

	assert.equal(paid.p1 ?? 0, 0);
	assert.equal(projectPaymentStatus(1000_00, paid.p1 ?? 0).state, 'unpaid');
});

test('overpayment is reported with the excess', () => {
	const status = projectPaymentStatus(1000_00, 1250_00);
	assert.equal(status.state, 'overpaid');
	assert.equal(status.covered, true);
	assert.equal(status.excessPaise, 250_00);
	assert.equal(status.remainingPaise, 0);
});

test('a project without an estimate tracks payments without a target', () => {
	const status = projectPaymentStatus(0, 300_00);
	assert.equal(status.state, 'no-estimate');
	assert.equal(status.paidPaise, 300_00);
	assert.equal(status.covered, false);
	assert.equal(paymentStateLabel(status.state), 'No estimate');
});

test('a negative balance keeps its minus sign', () => {
	const balance = netPaise({ earned: 0, spent: 100_00 });
	assert.equal(balance, -100_00);
	assert.match(formatSignedPaise(balance), /^-₹100$/);
	assert.match(formatPaise(balance), /^-₹100$/);
	assert.match(formatSignedPaise(0), /^₹0$/);
	assert.match(formatSignedPaise(250_50), /^₹250\.50$/);
});
