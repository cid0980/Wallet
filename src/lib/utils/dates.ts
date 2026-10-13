export function todayDateKey(): string {
	const today = new Date();
	const year = today.getFullYear();
	const month = String(today.getMonth() + 1).padStart(2, '0');
	const day = String(today.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

export function isDateKey(value: string): boolean {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
		return false;
	}

	const [year, month, day] = value.split('-').map(Number);
	const date = new Date(year, month - 1, day);
	return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function formatDateKey(value: string): string {
	if (!isDateKey(value)) {
		return 'Unknown date';
	}

	const [year, month, day] = value.split('-').map(Number);
	return new Intl.DateTimeFormat('en-IN', {
		day: 'numeric',
		month: 'short',
		year: 'numeric'
	}).format(new Date(year, month - 1, day));
}

export function formatRelativeDate(value: string): string {
	if (!isDateKey(value)) {
		return 'Unknown date';
	}

	const today = todayDateKey();
	if (value === today) {
		return 'Today';
	}

	const yesterday = new Date();
	yesterday.setDate(yesterday.getDate() - 1);
	const yesterdayKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
	if (value === yesterdayKey) {
		return 'Yesterday';
	}

	return formatDateKey(value);
}

export function formatDateTime(value: Date | null): string {
	if (!value) {
		return 'Syncing…';
	}

	return new Intl.DateTimeFormat('en-IN', {
		day: 'numeric',
		month: 'short',
		hour: 'numeric',
		minute: '2-digit'
	}).format(value);
}
