/**
 * Whether a project has been paid for is derived, never stored.
 *
 * The vault used to flip a stored `done` flag once payments reached the
 * estimate. That flag went stale: deleting or reducing a payment never
 * cleared it, and the post-save calculation could count a freshly written
 * payment twice (once from the live snapshot, once from the form input),
 * marking a part-paid project "Complete".
 *
 * Payment status is now computed from the current payment records every
 * time it is shown, so any create/edit/delete — including a partner's
 * concurrent change arriving over the wire — is reflected immediately and
 * exactly once. The stored project `status` ('active' | 'done') means only
 * whether the *work* is finished, and is changed by hand.
 */

export type ProjectPaymentState = 'unpaid' | 'part-paid' | 'fully-paid' | 'overpaid' | 'no-estimate';

export interface ProjectPaymentStatus {
	state: ProjectPaymentState;
	/** Sum of the payments currently linked to the project, in paise. */
	paidPaise: number;
	/** Estimate minus paid, floored at 0. */
	remainingPaise: number;
	/** Paid minus estimate when overpaid, otherwise 0. */
	excessPaise: number;
	/** True when an estimate exists and payments cover it. */
	covered: boolean;
}

/**
 * Totals the payments linked to each project. Records without a project
 * link (or with a non-positive amount, which the rules reject anyway) are
 * ignored, and each record is counted exactly once, by construction.
 */
export function paidByProject(
	payments: Iterable<{ projectId: string | null; amountPaise: number }>
): Record<string, number> {
	const paid: Record<string, number> = {};

	for (const payment of payments) {
		if (payment.projectId && Number.isSafeInteger(payment.amountPaise) && payment.amountPaise > 0) {
			paid[payment.projectId] = (paid[payment.projectId] ?? 0) + payment.amountPaise;
		}
	}

	return paid;
}

export function projectPaymentStatus(estimatedPaise: number, paidPaise: number): ProjectPaymentStatus {
	const estimate = Number.isSafeInteger(estimatedPaise) && estimatedPaise > 0 ? estimatedPaise : 0;
	const paid = Number.isSafeInteger(paidPaise) && paidPaise > 0 ? paidPaise : 0;

	if (estimate === 0) {
		return { state: 'no-estimate', paidPaise: paid, remainingPaise: 0, excessPaise: 0, covered: false };
	}

	if (paid === 0) {
		return { state: 'unpaid', paidPaise: 0, remainingPaise: estimate, excessPaise: 0, covered: false };
	}

	if (paid < estimate) {
		return { state: 'part-paid', paidPaise: paid, remainingPaise: estimate - paid, excessPaise: 0, covered: false };
	}

	if (paid === estimate) {
		return { state: 'fully-paid', paidPaise: paid, remainingPaise: 0, excessPaise: 0, covered: true };
	}

	return { state: 'overpaid', paidPaise: paid, remainingPaise: 0, excessPaise: paid - estimate, covered: true };
}

/** Short badge text for a derived payment state. */
export function paymentStateLabel(state: ProjectPaymentState): string {
	switch (state) {
		case 'fully-paid':
			return 'Fully paid';
		case 'overpaid':
			return 'Overpaid';
		case 'part-paid':
			return 'Part paid';
		case 'unpaid':
			return 'Unpaid';
		case 'no-estimate':
			return 'No estimate';
	}
}
