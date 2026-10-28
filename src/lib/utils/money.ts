const MAX_PAISE = 9_000_000_000_000_000;

export class MoneyParseError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'MoneyParseError';
	}
}

/**
 * Converts a human-entered rupee amount to integer paise without using
 * floating-point arithmetic. Accepted examples: 1200, 1,200.5, ₹ 1,200.50.
 */
export function parseMoneyToPaise(rawValue: string): number {
	const normalized = rawValue.replace(/[₹,\s]/g, '').trim();

	if (!normalized) {
		throw new MoneyParseError('Enter an amount.');
	}

	if (!/^\d+(?:\.\d{0,2})?$/.test(normalized)) {
		throw new MoneyParseError('Use a positive rupee amount with at most two decimal places.');
	}

	const [rupeesPart, decimalPart = ''] = normalized.split('.');
	const rupees = BigInt(rupeesPart);
	const paiseDigits = `${decimalPart}00`.slice(0, 2);
	const paise = rupees * 100n + BigInt(paiseDigits);

	if (paise <= 0n) {
		throw new MoneyParseError('Amount must be greater than ₹0.');
	}

	if (paise > BigInt(MAX_PAISE)) {
		throw new MoneyParseError('That amount is too large for Vault.');
	}

	return Number(paise);
}

export function isValidPaise(value: unknown): value is number {
	return Number.isSafeInteger(value) && typeof value === 'number' && value >= 0 && value <= MAX_PAISE;
}

/**
 * A balance (earned − spent) may legitimately be negative, so signed values
 * are valid input here even though individual records never are.
 */
export function isValidSignedPaise(value: unknown): value is number {
	return Number.isSafeInteger(value) && typeof value === 'number' && Math.abs(value) <= MAX_PAISE;
}

export function formatPaise(value: number, options: Intl.NumberFormatOptions = {}): string {
	const safeValue = isValidSignedPaise(value) ? value : 0;

	return new Intl.NumberFormat('en-IN', {
		style: 'currency',
		currency: 'INR',
		maximumFractionDigits: 2,
		minimumFractionDigits: safeValue % 100 === 0 ? 0 : 2,
		...options
	}).format(safeValue / 100);
}

/**
 * Formats a balance with its sign always visible. A negative balance must
 * never render as a positive amount: en-IN currency formatting puts the
 * minus first (−₹100), and callers should use this for any net figure.
 */
export function formatSignedPaise(value: number, options: Intl.NumberFormatOptions = {}): string {
	return formatPaise(value, { signDisplay: 'negative', ...options });
}

export function formatPaiseInput(value: number): string {
	if (!isValidPaise(value)) {
		return '';
	}

	const rupees = Math.trunc(value / 100);
	const paise = value % 100;
	return paise === 0 ? String(rupees) : `${rupees}.${String(paise).padStart(2, '0')}`;
}

export function netPaise(totals: { earned: number; spent: number }): number {
	return totals.earned - totals.spent;
}
