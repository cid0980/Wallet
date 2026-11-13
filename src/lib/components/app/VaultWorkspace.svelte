<script lang="ts">
	import type { User } from 'firebase/auth';

	import { tick } from 'svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import type { IconName } from '$lib/components/ui/icon-names';
	import ChipGroup from '$lib/components/ui/ChipGroup.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import Progress from '$lib/components/ui/Progress.svelte';
	import Sheet from '$lib/components/ui/Sheet.svelte';
	import TagFilterBar from '$lib/components/ui/TagFilterBar.svelte';
	import ToastMessage from '$lib/components/ui/Toast.svelte';
	import {
		createClient,
		createExpense,
		createPayment,
		createProject,
		deleteExpense,
		deletePayment,
		deleteProject,
		setClientArchived,
		setProjectStatus,
		updateClient,
		updateExpense,
		updatePayment,
		updateProject,
		updateVaultMember,
		updateVaultTags,
		vaultDataErrorMessage
	} from '$lib/services/vault-data';
	import { observeVaultData, vaultData } from '$lib/stores/vault-data';
	import type {
		ClientRecord,
		ExpenseRecord,
		PartnerKey,
		PaymentRecord,
		ProjectRecord,
		VaultMutation,
		VaultSummary
	} from '$lib/types/vault';
	import { MAX_EXPENSE_TAGS, MAX_PAYMENT_TAGS, MAX_TAG_LENGTH, MAX_VAULT_TAGS } from '$lib/types/vault';
	import {
		formatDateKey,
		formatDateTime,
		formatRelativeDate,
		todayDateKey,
		yesterdayDateKey
	} from '$lib/utils/dates';
	import { formatPaise, formatPaiseInput, formatSignedPaise, netPaise, parseMoneyToPaise } from '$lib/utils/money';
	import {
		paidByProject as sumPaidByProject,
		paymentStateLabel,
		projectPaymentStatus
	} from '$lib/utils/project-payment-status';
	import { projectIdForClient, projectsForClient } from '$lib/utils/project-picker';
	import {
		buildTagVocabulary,
		filterTaggedRecords,
		hasTag,
		inRange,
		presetRange,
		rangeLabel,
		summarizeRecords,
		usedTags,
		type RangePreset
	} from '$lib/utils/tag-filter';

	type MainTab = 'home' | 'clients' | 'projects' | 'payments' | 'expenses' | 'more';
	type Composer = 'none' | 'client' | 'project' | 'payment' | 'expense';
	type MorePanel = 'history' | 'settings';
	type DateMode = 'today' | 'yesterday' | 'custom';

	type ChipOption = { value: string; label: string; initial?: string };
	/** Which money tab a filter or composer belongs to. */
	type MoneyTab = 'payments' | 'expenses';
	/** A tapped tag plus the date window it is counted over. */
	type TagFilter = { tag: string | null; preset: RangePreset; from: string; to: string };
	type Toast = { tone: 'ok' | 'error'; text: string };
	type Confirmation = { title: string; message: string; confirmLabel: string; run: () => Promise<void> };

	export let vault: VaultSummary;
	export let user: User;
	/** Resolves to a failure message to show, or null when sign-out succeeded. */
	export let onSignOut: (mode?: 'keep' | 'clear') => Promise<string | null>;

	/**
	 * One list drives both navigation surfaces: the sidebar on desktop and the
	 * dial on phones, so a label or icon can never drift between them.
	 */
	const sections: { id: MainTab; label: string; icon: IconName }[] = [
		{ id: 'home', label: 'Home', icon: 'home' },
		{ id: 'projects', label: 'Projects', icon: 'target' },
		{ id: 'clients', label: 'Clients', icon: 'clients' },
		{ id: 'payments', label: 'Payments', icon: 'money-in' },
		{ id: 'expenses', label: 'Expenses', icon: 'money-out' },
		{ id: 'more', label: 'More', icon: 'more' }
	];

	let activeTab: MainTab = 'home';
	let morePanel: MorePanel = 'history';
	let composer: Composer = 'none';
	let actionBusy = false;
	let actionError: string | null = null;
	let toast: Toast | null = null;
	let confirmation: Confirmation | null = null;
	let clientFilter: 'active' | 'all' = 'active';
	let query = '';
	let paymentProjectFilter: { id: string; name: string } | null = null;

	let editingClient: ClientRecord | null = null;
	let clientName = '';
	let clientContact = '';
	let clientNotes = '';

	let editingPayment: PaymentRecord | null = null;
	let paymentTags: string[] = [];
	let newPaymentTag = '';
	let newExpenseTag = '';
	let paymentFilter: TagFilter = defaultFilter();
	let expenseFilter: TagFilter = defaultFilter();
	let paymentClientId = '';
	let paymentAmount = '';
	let paymentPartner: PartnerKey = 'a';
	let paymentDate = todayDateKey();
	let paymentDateMode: DateMode = 'today';
	let paymentNote = '';

	let editingProject: ProjectRecord | null = null;
	let projectName = '';
	let projectClientId = '';
	let projectEstimate = '';
	let projectNote = '';

	let editingExpense: ExpenseRecord | null = null;
	let expenseClientId = '';
	let expenseAmount = '';
	let expensePartner: PartnerKey = 'a';
	let expenseTags: string[] = [];
	let expenseDate = todayDateKey();
	let expenseDateMode: DateMode = 'today';
	let expenseNote = '';

	// Partner editing in settings
	let editingPartner: PartnerKey | null = null;
	let partnerEditName = '';
	let partnerEditEmail = '';
	let partnerEditBusy = false;

	let paymentProjectId = '';
	let tagDraft = '';

	// Client pickers become searchable once the chip list grows long.
	let paymentClientQuery = '';
	let expenseClientQuery = '';
	let projectClientQuery = '';
	let signingOutNow = false;
	let pullingUpdates = false;

	let toastTimer: ReturnType<typeof setTimeout> | undefined;

	$: activeClients = $vaultData.clients.filter((client) => !client.isArchived);
	$: shownClients = clientFilter === 'all' ? $vaultData.clients : activeClients;
	$: balance = netPaise(vault.totals);
	$: isSyncing = vault.pendingWrites || $vaultData.pendingWrites;
	$: isOffline = vault.fromCache && $vaultData.fromCache;
	$: ownPartner = (user.email?.toLowerCase() === vault.members.b.email.toLowerCase() ? 'b' : 'a') as PartnerKey;
	$: ownName = ownPartner === 'a' ? vault.members.a.name : vault.members.b.name;
	$: otherName = ownPartner === 'a' ? vault.members.b.name : vault.members.a.name;
	$: ownInitial = ownName.trim().slice(0, 1).toUpperCase() || '•';
	$: otherInitial = otherName.trim().slice(0, 1).toUpperCase() || '•';
	$: partnerRows = [
		{ key: 'a' as const, member: vault.members.a },
		{ key: 'b' as const, member: vault.members.b }
	];
	$: ownFirst = ownName.trim().split(/\s+/)[0] || 'there';
	$: selectedPaymentClient = activeClients.find((client) => client.id === paymentClientId) ?? null;
	$: selectedExpenseClient = activeClients.find((client) => client.id === expenseClientId) ?? null;

	$: partnerOptions = [
		{ value: 'a', label: vault.members.a.name, initial: initial(vault.members.a.name) },
		{ value: 'b', label: vault.members.b.name, initial: initial(vault.members.b.name) }
	] satisfies ChipOption[];

	$: vaultTagOptions = vault.tags.map((tag) => ({ value: tag, label: tag }));

	$: activeProjects = $vaultData.projects.filter((project) => project.status === 'active');
	$: paymentClientProjects = projectsForClient($vaultData.projects, paymentClientId);
	$: selectedPaymentProject = paymentClientProjects.find((project) => project.id === paymentProjectId) ?? null;

	// Payment coverage is always derived from the current records — never a
	// stored flag — so edits, deletions and a partner's concurrent writes are
	// reflected immediately, and no payment can be counted twice.
	$: paidByProject = sumPaidByProject($vaultData.payments);

	$: paymentClientOptions = activeClients.map((client) => ({ value: client.id, label: client.name }));

	$: expenseClientOptions = [
		{ value: '', label: 'No client' },
		...activeClients.map((client) => ({ value: client.id, label: client.name }))
	];

	/** Keeps the current selection visible even when the search would hide it. */
	function filterClientOptions(options: ChipOption[], rawQuery: string, selectedId: string): ChipOption[] {
		const term = rawQuery.trim().toLowerCase();
		if (!term) {
			return options;
		}
		return options.filter((option) => option.value === selectedId || option.label.toLowerCase().includes(term));
	}

	$: shownPaymentClientOptions = filterClientOptions(paymentClientOptions, paymentClientQuery, paymentClientId);
	$: shownExpenseClientOptions = filterClientOptions(expenseClientOptions, expenseClientQuery, expenseClientId);
	$: shownProjectClientOptions = filterClientOptions(paymentClientOptions, projectClientQuery, projectClientId);

	$: needle = query.trim().toLowerCase();
	$: filteredClients = needle ? shownClients.filter((client) => matches(needle, client.name, client.contact, client.notes)) : shownClients;

	// Every tag the vault knows about, including ones that exist only on older
	// records. Built from the shared list plus the records themselves so a tag
	// you created once can always be found again.
	$: tagVocabulary = buildTagVocabulary(vault.tags, [
		...$vaultData.payments,
		...$vaultData.expenses,
		{ tags: paymentTags },
		{ tags: expenseTags }
	]);
	$: composerTagOptions = tagVocabulary.map((tag) => ({ value: tag, label: tag }));
	$: paymentTagsUsed = usedTags($vaultData.payments, vault.tags);
	$: expenseTagsUsed = usedTags($vaultData.expenses, vault.tags);
	$: paymentRange = { from: paymentFilter.from, to: paymentFilter.to };
	$: expenseRange = { from: expenseFilter.from, to: expenseFilter.to };

	$: filteredPayments = filterTaggedRecords(
		$vaultData.payments.filter(
			(payment) =>
				(!paymentProjectFilter || payment.projectId === paymentProjectFilter.id) &&
				(!needle ||
					matches(
						needle,
						payment.clientName,
						payment.projectName,
						payment.note,
						payment.tags.join(' '),
						partnerName(payment.partner),
						formatPaise(payment.amountPaise)
					))
		),
		{ tag: paymentFilter.tag, range: paymentRange }
	);
	$: filteredExpenses = filterTaggedRecords(
		$vaultData.expenses.filter(
			(expense) =>
				!needle ||
				matches(
					needle,
					expense.tags.join(' '),
					expense.clientName,
					expense.note,
					partnerName(expense.partner),
					formatPaise(expense.amountPaise)
				)
		),
		{ tag: expenseFilter.tag, range: expenseRange }
	);
	$: paymentSummary = summarizeRecords(filteredPayments);
	$: expenseSummary = summarizeRecords(filteredExpenses);
	// Estimated value of the work still open, and how much of it has landed.
	$: projectsSummary = activeProjects.reduce(
		(acc, project) => {
			const paid = paidByProject[project.id] ?? 0;
			acc.estimatedPaise += project.estimatedPaise;
			acc.paidPaise += Math.min(paid, project.estimatedPaise);
			acc.outstandingPaise += Math.max(0, project.estimatedPaise - paid);
			return acc;
		},
		{ estimatedPaise: 0, paidPaise: 0, outstandingPaise: 0 }
	);
	/** History reads better with a person's name than a raw address. */
	function actorLabel(email: string): string {
		if (email === vault.members.a.email) return vault.members.a.name;
		if (email === vault.members.b.email) return vault.members.b.name;
		return email;
	}

	/** The amount sits in its own column, so drop it from the summary text. */
	function summaryText(summary: string): string {
		return summary.replace(/₹[\d.,]+\s*/g, '').replace(/\s{2,}/g, ' ').trim();
	}

	$: paymentFilterActive = paymentFilter.tag !== null || paymentFilter.preset !== 'month' || Boolean(paymentProjectFilter);
	$: expenseFilterActive = expenseFilter.tag !== null || expenseFilter.preset !== 'month';
	$: filteredProjects = needle
		? $vaultData.projects.filter((project) => matches(needle, project.name, project.clientName, project.note))
		: $vaultData.projects;

	function initial(value: string): string {
		return value.trim().slice(0, 1).toUpperCase() || '•';
	}

	function matches(needle: string, ...values: (string | null | undefined)[]): boolean {
		return values.some((value) => (value ?? '').toLowerCase().includes(needle));
	}

	function partnerName(partner: PartnerKey): string {
		return partner === 'a' ? vault.members.a.name : vault.members.b.name;
	}

	function openPartnerEditor(partner: PartnerKey): void {
		editingPartner = partner;
		partnerEditName = vault.members[partner].name;
		partnerEditEmail = vault.members[partner].email;
	}

	function closePartnerEditor(): void {
		editingPartner = null;
		partnerEditName = '';
		partnerEditEmail = '';
	}

	async function savePartnerEdit(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		if (!editingPartner) return;
		partnerEditBusy = true;
		try {
			await updateVaultMember(vault, editingPartner, partnerEditName, partnerEditEmail, user.email ?? '');
			say(`${partnerEditName} updated.`);
			closePartnerEditor();
		} catch (error) {
			actionError = vaultDataErrorMessage(error) ?? String(error);
		} finally {
			partnerEditBusy = false;
		}
	}

	function say(text: string, tone: Toast['tone'] = 'ok'): void {
		toast = { text, tone };
		clearTimeout(toastTimer);

		if (tone === 'ok') {
			toastTimer = setTimeout(() => (toast = null), 3600);
		}
	}

	function dismissToast(): void {
		clearTimeout(toastTimer);
		toast = null;
	}

	function dateModeFor(key: string): DateMode {
		if (key === todayDateKey()) {
			return 'today';
		}

		if (key === yesterdayDateKey()) {
			return 'yesterday';
		}

		return 'custom';
	}

	function pickDate(mode: DateMode, target: 'payment' | 'expense'): void {
		if (mode === 'today') {
			if (target === 'payment') {
				paymentDateMode = 'today';
				paymentDate = todayDateKey();
			} else {
				expenseDateMode = 'today';
				expenseDate = todayDateKey();
			}
			return;
		}

		if (mode === 'yesterday') {
			if (target === 'payment') {
				paymentDateMode = 'yesterday';
				paymentDate = yesterdayDateKey();
			} else {
				expenseDateMode = 'yesterday';
				expenseDate = yesterdayDateKey();
			}
			return;
		}

		if (target === 'payment') {
			paymentDateMode = 'custom';
		} else {
			expenseDateMode = 'custom';
		}
	}

	/** The dial is a phone affordance: it opens, picks a section, and closes. */
	let dialOpen = false;

	$: currentSection = sections.find((section) => section.id === activeTab) ?? sections[0];

	/** Six bubbles on the arc above the button, fanning from left to right. */
	$: dialItems = sections.map((section, index) => ({
		...section,
		angle: 180 - ((index + 0.5) * 180) / sections.length
	}));

	/** The mark opens the shared settings, so the bar carries one real action. */
	function openVaultSettings(): void {
		switchTab('more');
		morePanel = 'settings';
	}

	/** Past a short scroll the bar folds to one line: mark, name, sync. */
	let headerCondensed = false;

	function handleScroll(): void {
		headerCondensed = window.scrollY > 24;
	}

	function chooseSection(id: MainTab): void {
		dialOpen = false;
		switchTab(id);
	}

	/**
	 * Swipe support: the ring is laid out on known angles, so a drag can be
	 * matched to the bubble it points at. Dragging out of the button blooms the
	 * ring immediately, the aimed bubble lights up, and releasing goes there.
	 */
	let swipeStart: { x: number; y: number; active: boolean } | null = null;
	let swipeTarget: MainTab | null = null;
	let swipeConsumed = false;

	function aimedSection(dx: number, dy: number): MainTab | null {
		if (Math.hypot(dx, dy) < 12) return null;

		// 0° is due right, 90° is straight up; downward drags aim at nothing.
		const angle = (Math.atan2(-dy, dx) * 180) / Math.PI;
		if (angle < 0 || angle > 180) return null;

		let best = dialItems[0];
		let bestDelta = Number.POSITIVE_INFINITY;

		for (const item of dialItems) {
			const delta = Math.abs(item.angle - angle);
			if (delta < bestDelta) {
				bestDelta = delta;
				best = item;
			}
		}

		return best.id;
	}

	function startSwipe(event: PointerEvent): void {
		if (event.pointerType === 'mouse' && event.button !== 0) return;
		swipeStart = { x: event.clientX, y: event.clientY, active: true };
		swipeTarget = null;
		swipeConsumed = false;
	}

	function moveSwipe(event: PointerEvent): void {
		if (!swipeStart?.active) return;

		const dx = event.clientX - swipeStart.x;
		const dy = event.clientY - swipeStart.y;

		if (!dialOpen && Math.hypot(dx, dy) > 10) dialOpen = true;

		swipeTarget = aimedSection(dx, dy);
	}

	function endSwipe(event: PointerEvent): void {
		if (!swipeStart?.active) return;

		const dx = event.clientX - swipeStart.x;
		const dy = event.clientY - swipeStart.y;
		swipeStart.active = false;

		const target = aimedSection(dx, dy);
		swipeTarget = null;

		if (target && Math.hypot(dx, dy) >= 28) {
			// A click follows this gesture on some browsers; it must not toggle.
			swipeConsumed = true;
			chooseSection(target);
		}
	}

	function onFabClick(): void {
		if (swipeConsumed) {
			swipeConsumed = false;
			return;
		}

		void toggleDial();
	}

	function onScrimClick(): void {
		if (swipeConsumed) {
			swipeConsumed = false;
			return;
		}

		dialOpen = false;
	}

	/** Opening moves focus to where you are; closing gives it back to the button. */
	async function toggleDial(): Promise<void> {
		dialOpen = !dialOpen;
		await tick();

		const target = dialOpen
			? document.querySelector<HTMLElement>('.dial__item.is-on')
			: document.querySelector<HTMLElement>('.dial__fab');

		target?.focus();
	}

	function switchTab(tab: MainTab): void {
		activeTab = tab;
		composer = 'none';
		actionError = null;
		query = '';
		paymentProjectFilter = null;
	}

	function openClientComposer(client: ClientRecord | null = null): void {
		actionError = null;
		editingClient = client;
		clientName = client?.name ?? '';
		clientContact = client?.contact ?? '';
		clientNotes = client?.notes ?? '';
		composer = 'client';
	}

	function openPaymentComposer(payment: PaymentRecord | null = null, project: ProjectRecord | null = null): void {
		actionError = null;

		if (!payment && activeClients.length === 0) {
			say('Add a client first — every payment is linked to one.', 'error');
			switchTab('clients');
			openClientComposer();
			return;
		}

		editingPayment = payment;
		paymentClientId = payment?.clientId ?? project?.clientId ?? activeClients[0]?.id ?? '';
		paymentProjectId = payment?.projectId ?? project?.id ?? '';
		paymentAmount = payment ? formatPaiseInput(payment.amountPaise) : '';
		paymentPartner = payment?.partner ?? ownPartner;
		paymentDate = payment?.occurredOn ?? todayDateKey();
		paymentDateMode = dateModeFor(paymentDate);
		paymentNote = payment?.note ?? '';
		paymentTags = payment?.tags?.length ? [...payment.tags] : [];
		newPaymentTag = '';
		paymentClientQuery = '';
		composer = 'payment';
	}

	function choosePaymentClient(clientId: string): void {
		paymentClientId = clientId;
		// A project never belongs to two clients. Keep "No project" when
		// switching clients rather than silently linking to another client's work.
		paymentProjectId = projectIdForClient($vaultData.projects, clientId, paymentProjectId);
	}

	function choosePaymentProject(projectId: string): void {
		if (!projectId || paymentClientProjects.some((project) => project.id === projectId)) {
			paymentProjectId = projectId;
		}
	}

	function viewProjectPayments(project: ProjectRecord): void {
		switchTab('payments');
		paymentProjectFilter = { id: project.id, name: project.name };
	}

	function openExpenseComposer(expense: ExpenseRecord | null = null): void {
		actionError = null;
		editingExpense = expense;
		expenseClientId = expense?.clientId ?? '';
		expenseAmount = expense ? formatPaiseInput(expense.amountPaise) : '';
		expensePartner = expense?.partner ?? ownPartner;
		expenseTags = expense?.tags?.length ? [...expense.tags] : [];
		expenseDate = expense?.occurredOn ?? todayDateKey();
		expenseDateMode = dateModeFor(expenseDate);
		expenseNote = expense?.note ?? '';
		newExpenseTag = '';
		expenseClientQuery = '';
		composer = 'expense';
	}

	function openProjectComposer(project: ProjectRecord | null = null): void {
		actionError = null;

		if (!project && activeClients.length === 0) {
			say('Add a client first — every project belongs to one.', 'error');
			switchTab('clients');
			openClientComposer();
			return;
		}

		editingProject = project;
		projectName = project?.name ?? '';
		projectClientId = project?.clientId ?? activeClients[0]?.id ?? '';
		projectEstimate = project ? formatPaiseInput(project.estimatedPaise) : '';
		projectNote = project?.note ?? '';
		projectClientQuery = '';
		composer = 'project';
	}

	function closeComposer(): void {
		composer = 'none';
		actionError = null;
	}


	async function runAction(action: () => Promise<void>): Promise<void> {
		actionBusy = true;
		actionError = null;

		try {
			await action();
		} catch (error) {
			actionError = vaultDataErrorMessage(error);
		} finally {
			actionBusy = false;
		}
	}

	async function saveClient(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		await runAction(async () => {
			const input = { name: clientName, contact: clientContact, notes: clientNotes };
			if (editingClient) {
				await updateClient(vault.id, editingClient, input, user.email ?? '');
				closeComposer();
				say('Client updated.');
			} else {
				await createClient(vault.id, input, user.email ?? '');
				closeComposer();
				say('Client added.');
			}
		});
	}

	async function savePayment(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		await runAction(async () => {
			if (!selectedPaymentClient) {
				throw new Error('Choose an active client.');
			}

			if (paymentProjectId && !selectedPaymentProject) {
				throw new Error('Choose a project for this client, or choose No project.');
			}

			const input = {
				clientId: selectedPaymentClient.id,
				clientName: selectedPaymentClient.name,
				projectId: selectedPaymentProject?.id ?? null,
				projectName: selectedPaymentProject?.name ?? null,
				amountPaise: parseMoneyToPaise(paymentAmount),
				partner: paymentPartner,
				tags: paymentTags,
				occurredOn: paymentDate,
				note: paymentNote
			};

			if (editingPayment) {
				await updatePayment(vault, editingPayment, input, user.email ?? '');
				closeComposer();
				say('Payment updated.');
			} else {
				await createPayment(vault, input, user.email ?? '');
				closeComposer();
				say(`${formatPaise(input.amountPaise)} received from ${selectedPaymentClient.name}.`);
			}

			// No completion bookkeeping here: "fully paid" is derived from the
			// payment list itself, so it can never double-count this write or
			// go stale when a payment is later edited or removed.
		});
	}

	async function saveExpense(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		await runAction(async () => {
			const input = {
				clientId: selectedExpenseClient?.id ?? null,
				clientName: selectedExpenseClient?.name ?? null,
				amountPaise: parseMoneyToPaise(expenseAmount),
				partner: expensePartner,
				tags: expenseTags,
				occurredOn: expenseDate,
				note: expenseNote
			};

			if (editingExpense) {
				await updateExpense(vault, editingExpense, input, user.email ?? '');
				closeComposer();
				say('Expense updated.');
			} else {
				await createExpense(vault, input, user.email ?? '');
				closeComposer();
				say(`${formatPaise(input.amountPaise)} expense recorded.`);
			}
		});
	}

	/** In-app confirmation, so no browser dialog with a different look per device. */
	function archiveClient(client: ClientRecord): void {
		const restoring = client.isArchived;
		confirmation = {
			title: restoring ? `Restore ${client.name}?` : `Archive ${client.name}?`,
			message: restoring
				? 'The client returns to the picker for new payments.'
				: 'Archived clients stay in your history and keep all their payments.',
			confirmLabel: restoring ? 'Restore' : 'Archive',
			run: () => setClientArchived(vault.id, client, !client.isArchived, user.email ?? '')
		};
	}

	function removePayment(payment: PaymentRecord): void {
		confirmation = {
			title: 'Delete this payment?',
			message: `${formatPaise(payment.amountPaise)} from ${payment.clientName} will be removed from the balance and this list. The deletion itself stays in your history, so both of you can see what changed.`,
			confirmLabel: 'Delete payment',
			run: () => deletePayment(vault, payment, user.email ?? '')
		};
	}

	function removeExpense(expense: ExpenseRecord): void {
		confirmation = {
			title: 'Delete this expense?',
			message: `${formatPaise(expense.amountPaise)} for ${expense.tags.join(' / ')} will be removed from the balance and this list. The deletion itself stays in your history, so both of you can see what changed.`,
			confirmLabel: 'Delete expense',
			run: () => deleteExpense(vault, expense, user.email ?? '')
		};
	}

	async function saveProject(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		await runAction(async () => {
			const client = activeClients.find((entry) => entry.id === projectClientId) ?? null;
			if (!client) {
				throw new Error('Choose a client for this project.');
			}

			const input = {
				name: projectName,
				clientId: client.id,
				clientName: client.name,
				estimatedPaise: projectEstimate.trim() ? parseMoneyToPaise(projectEstimate) : 0,
				note: projectNote
			};

			if (editingProject) {
				await updateProject(vault.id, editingProject, input, user.email ?? '');
				closeComposer();
				say('Project updated.');
			} else {
				await createProject(vault.id, input, user.email ?? '');
				closeComposer();
				say(`Project added · estimate ${formatPaise(input.estimatedPaise)}.`);
			}
		});
	}

	/**
	 * Work status is manual and separate from payment status: a project can
	 * be finished work that is not fully paid yet, or fully paid work that is
	 * still being delivered. Only a person can say the work is done.
	 */
	async function toggleProjectWorkStatus(project: ProjectRecord): Promise<void> {
		const next = project.status === 'done' ? 'active' : 'done';
		await runAction(async () => {
			await setProjectStatus(vault.id, project.id, next, user.email ?? '');
			say(next === 'done' ? `${project.name} marked as work done.` : `${project.name} reopened.`);
		});
	}

	function removeProject(project: ProjectRecord): void {
		const linked = $vaultData.payments.filter((payment) => payment.projectId === project.id).length;
		if (linked > 0) {
			say(`${project.name} has ${linked} payment${linked === 1 ? '' : 's'} linked to it. Remove those first.`, 'error');
			return;
		}

		confirmation = {
			title: `Delete ${project.name}?`,
			message: `The project and its ${formatPaise(project.estimatedPaise)} estimate go away. It has no payments linked to it, and this cannot be undone.`,
			confirmLabel: 'Delete project',
			run: () => deleteProject(vault.id, project.id, user.email ?? '')
		};
	}

	const RANGE_PRESETS: { value: RangePreset; label: string }[] = [
		{ value: 'month', label: 'This month' },
		{ value: 'last30', label: 'Last 30 days' },
		{ value: 'fy', label: 'This FY' },
		{ value: 'all', label: 'All time' },
		{ value: 'custom', label: 'Dates…' }
	];

	/** Every tab opens on the current month, which is the useful default. */
	function defaultFilter(): TagFilter {
		const range = presetRange('month');
		return { tag: null, preset: 'month', from: range.from, to: range.to };
	}

	function tagFilterFor(tab: MoneyTab): TagFilter {
		return tab === 'payments' ? paymentFilter : expenseFilter;
	}

	function setTagFilter(tab: MoneyTab, tag: string | null): void {
		const current = tagFilterFor(tab);
		const next = { ...current, tag };
		if (tab === 'payments') {
			paymentFilter = next;
		} else {
			expenseFilter = next;
		}
	}

	/** Tapping the same chip twice clears it, so a filter is never a trap. */
	function toggleTagFilter(tab: MoneyTab, tag: string): void {
		setTagFilter(tab, tagFilterFor(tab).tag === tag ? null : tag);
	}

	function chooseRangePreset(tab: MoneyTab, preset: RangePreset): void {
		const current = tagFilterFor(tab);
		// "Dates…" keeps whatever window is showing as a starting point.
		const range = preset === 'custom' ? { from: current.from, to: current.to } : presetRange(preset);
		const next = { ...current, preset, ...range };
		if (tab === 'payments') {
			paymentFilter = next;
		} else {
			expenseFilter = next;
		}
	}

	function setRangeBound(tab: MoneyTab, bound: 'from' | 'to', value: string): void {
		const current = tagFilterFor(tab);
		const next = { ...current, preset: 'custom' as RangePreset, [bound]: value };
		if (tab === 'payments') {
			paymentFilter = next;
		} else {
			expenseFilter = next;
		}
	}

	function resetFilters(tab: MoneyTab): void {
		if (tab === 'payments') {
			paymentFilter = defaultFilter();
			paymentProjectFilter = null;
		} else {
			expenseFilter = defaultFilter();
		}
	}

	/**
	 * Creates a tag while recording money, instead of sending you to Settings.
	 * The tag is selected on the record immediately; the shared vocabulary is
	 * written in the background the way Settings writes it, so both partners get
	 * it, and the record still saves if that second write is refused.
	 */
	function addInlineTag(tab: MoneyTab): void {
		const draft = tab === 'payments' ? newPaymentTag : newExpenseTag;
		const tag = draft.trim().replace(/\s+/g, ' ').slice(0, MAX_TAG_LENGTH);
		if (!tag) {
			return;
		}

		const chosen = tagVocabulary.find((entry) => entry.toLowerCase() === tag.toLowerCase()) ?? tag;
		const selected = tab === 'payments' ? paymentTags : expenseTags;
		const maximum = tab === 'payments' ? MAX_PAYMENT_TAGS : MAX_EXPENSE_TAGS;

		if (tab === 'payments') {
			newPaymentTag = '';
		} else {
			newExpenseTag = '';
		}

		if (selected.some((entry) => entry.toLowerCase() === chosen.toLowerCase())) {
			say(`“${chosen}” is already selected.`);
			return;
		}

		if (selected.length >= maximum) {
			say(`Use at most ${maximum} tags on one record.`, 'error');
			return;
		}

		if (tab === 'payments') {
			paymentTags = [...paymentTags, chosen];
		} else {
			expenseTags = [...expenseTags, chosen];
		}

		if (vault.tags.some((entry) => entry.toLowerCase() === chosen.toLowerCase())) {
			say(`“${chosen}” selected.`);
			return;
		}

		if (vault.tags.length >= MAX_VAULT_TAGS) {
			say(`“${chosen}” applies to this record. The shared list is full (${MAX_VAULT_TAGS} tags), so it stays off the picker.`);
			return;
		}

		void runAction(async () => {
			await updateVaultTags(vault.id, [...vault.tags, chosen], user.email ?? '');
			say(`“${chosen}” added to shared tags.`);
		});
	}

	/** Enter inside the new-tag box adds the tag instead of saving the record. */
	function newTagKeydown(event: KeyboardEvent, tab: MoneyTab): void {
		if (event.key !== 'Enter') {
			return;
		}

		event.preventDefault();
		addInlineTag(tab);
	}

	/** Selects or clears a tag on the record being recorded. */
	function toggleTag(tab: MoneyTab, tag: string): void {
		const selected = tab === 'payments' ? paymentTags : expenseTags;
		const maximum = tab === 'payments' ? MAX_PAYMENT_TAGS : MAX_EXPENSE_TAGS;
		const key = tag.toLowerCase();
		const isOn = selected.some((entry) => entry.toLowerCase() === key);

		if (!isOn && selected.length >= maximum) {
			say(`Choose at most ${maximum} tags.`, 'error');
			return;
		}

		const next = isOn ? selected.filter((entry) => entry.toLowerCase() !== key) : [...selected, tag];

		if (tab === 'payments') {
			paymentTags = next;
		} else {
			expenseTags = next;
		}
	}

	function addCommonTag(event: SubmitEvent): void {
		event.preventDefault();
		const tag = tagDraft.trim().replace(/\s+/g, ' ').slice(0, 40);
		if (!tag) {
			return;
		}

		if (vault.tags.some((entry) => entry.toLowerCase() === tag.toLowerCase())) {
			say('That tag is already on the list.', 'error');
			return;
		}

		if (vault.tags.length >= MAX_VAULT_TAGS) {
			say(`Keep the list to ${MAX_VAULT_TAGS} tags.`, 'error');
			return;
		}

		void runAction(async () => {
			await updateVaultTags(vault.id, [...vault.tags, tag], user.email ?? '');
			tagDraft = '';
			say(`“${tag}” added to spending tags.`);
		});
	}

	function removeCommonTag(tag: string): void {
		if (vault.tags.length <= 1) {
			say('Keep at least one tag.', 'error');
			return;
		}

		void runAction(async () => {
			await updateVaultTags(
				vault.id,
				vault.tags.filter((entry) => entry !== tag),
				user.email ?? ''
			);
			say(`“${tag}” removed. Past expenses keep it.`);
		});
	}

	async function confirmAction(): Promise<void> {
		if (!confirmation) {
			return;
		}

		const pending = confirmation;
		confirmation = null;
		await runAction(async () => {
			await pending.run();
			say(`${pending.confirmLabel} done.`);
		});
	}

	async function requestSignOut(mode: 'keep' | 'clear'): Promise<void> {
		signingOutNow = true;
		try {
			const problem = await onSignOut(mode);
			if (problem) {
				say(problem, 'error');
			}
		} finally {
			signingOutNow = false;
		}
	}

	async function pullUpdates(): Promise<void> {
		if (!vault.id) return;
		pullingUpdates = true;
		try {
			observeVaultData(vault.id, true);
			say('Updates pulled.');
		} catch (error) {
			say(vaultDataErrorMessage(error) ?? String(error), 'error');
		} finally {
			pullingUpdates = false;
		}
	}

	function csvCell(value: string | number): string {
		const raw = String(value);
		// Neutralize spreadsheet formulas in user-entered names/notes before
		// applying ordinary CSV quoting.
		const text = /^\s*[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
		return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
	}

	function csvAmount(paise: number): string {
		const digits = String(paise).padStart(3, '0');
		return `${digits.slice(0, -2)}.${digits.slice(-2)}`;
	}

	function downloadCsv(filename: string, header: string[], rows: (string | number)[][]): void {
		const body = [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
		const url = URL.createObjectURL(new Blob([body], { type: 'text/csv;charset=utf-8' }));
		const link = document.createElement('a');
		link.href = url;
		link.download = filename;
		link.click();
		URL.revokeObjectURL(url);
		say('CSV downloaded. It contains your financial records — store it somewhere private.');
	}

	function exportPaymentsCsv(): void {
		downloadCsv(
			`vault-payments-${todayDateKey()}.csv`,
			['Date', 'Tags', 'Client', 'Project', 'Received by', 'Amount (INR)', 'Note'],
			filteredPayments.map((payment) => [
				payment.occurredOn,
				payment.tags.join(' · '),
				payment.clientName,
				payment.projectName ?? '',
				partnerName(payment.partner),
				csvAmount(payment.amountPaise),
				payment.note
			])
		);
	}

	function exportExpensesCsv(): void {
		downloadCsv(
			`vault-expenses-${todayDateKey()}.csv`,
			['Date', 'Tags', 'Client', 'Paid by', 'Amount (INR)', 'Note'],
			filteredExpenses.map((expense) => [
				expense.occurredOn,
				expense.tags.join(' · '),
				expense.clientName ?? '',
				partnerName(expense.partner),
				csvAmount(expense.amountPaise),
				expense.note
			])
		);
	}

	function mutationAmount(mutation: VaultMutation): { amount: number; direction: 'in' | 'out' } {
		if (mutation.delta.earned !== 0) {
			return { amount: Math.abs(mutation.delta.earned), direction: mutation.delta.earned > 0 ? 'in' : 'out' };
		}

		return { amount: Math.abs(mutation.delta.spent), direction: mutation.delta.spent > 0 ? 'out' : 'in' };
	}

	function mutationIcon(mutation: VaultMutation): 'money-in' | 'money-out' {
		return mutation.recordType === 'payment' ? 'money-in' : 'money-out';
	}

</script>


<div class="shell">
	<a class="skip-link" href="#vault-main">Skip to content</a>

	<aside class="sidenav" class:is-condensed={headerCondensed}>
		<div class="sidenav__top">
			<button class="vault-mark" type="button" aria-label={`Open settings for ${vault.name}`} onclick={openVaultSettings}>
				<span class="vault-mark__pair" aria-hidden="true">
					<span class="vault-mark__face vault-mark__face--you">{ownInitial}</span>
					<span class="vault-mark__face">{otherInitial}</span>
				</span>
				<span class="sidenav__id">
					<span class="sidenav__name">{vault.name}</span>
					<span class="sidenav__meta">
						<span class="sidenav__shared">Shared with {otherName}</span>
						{#if isOffline}
							<span class="sidenav__sync sidenav__sync--offline" role="status"><span class="sidenav__sync-dot" aria-hidden="true"></span>Offline</span>
						{:else if isSyncing}
							<span class="sidenav__sync" role="status"><span class="sidenav__sync-dot" aria-hidden="true"></span>Saving</span>
						{:else}
							<span class="sidenav__sync sidenav__sync--ok" role="status"><span class="sidenav__sync-dot" aria-hidden="true"></span>Synced</span>
						{/if}
					</span>
				</span>
			</button>
		</div>

		<nav class="tabs" aria-label="Vault sections">
			{#each sections as section (section.id)}
				<button class="tab" class:tab--on={activeTab === section.id} type="button" aria-current={activeTab === section.id} onclick={() => switchTab(section.id)}>
					<Icon name={section.icon} size={17} />
					<span class="tab__label">{section.label}</span>
				</button>
			{/each}
		</nav>
	</aside>

	<div class="shell__content">
	<main id="vault-main" tabindex="-1">
		{#if activeTab === 'home'}
			<div class="view">
				<div class="view__head">
					<div class="view__titles">
						<h2 class="h1">Hi {ownFirst}.</h2>
						<p class="view__sub">{activeProjects.length} project{activeProjects.length === 1 ? '' : 's'} in progress · {formatPaise(projectsSummary.outstandingPaise)} still to collect</p>
					</div>
				</div>
				<div class="view__cols">
					<div class="view__aside">

			<section class="hero" class:hero--negative={balance < 0}>
				<p class="hero__label">Available balance</p>
				<p class="hero__value num">{formatSignedPaise(balance)}</p>
				<p class="hero__note">
					{balance < 0 ? 'Below zero — expenses are above recorded payments' : 'Payments received minus expenses paid'}
				</p>
				<div class="hero__meter" role="img" aria-label={`${formatPaise(vault.totals.earned)} received, ${formatPaise(vault.totals.spent)} spent`}>
					<span class="hero__meter-in" style={`width: ${vault.totals.earned + vault.totals.spent ? vault.totals.earned / (vault.totals.earned + vault.totals.spent) * 100 : 50}%`}></span>
					<span class="hero__meter-out" style={`width: ${vault.totals.earned + vault.totals.spent ? vault.totals.spent / (vault.totals.earned + vault.totals.spent) * 100 : 50}%`}></span>
				</div>
				<dl class="hero__legend">
					<div><dt><span class="dot dot--in" aria-hidden="true"></span> In</dt><dd class="num">{formatPaise(vault.totals.earned)}</dd></div>
					<div><dt><span class="dot dot--out" aria-hidden="true"></span> Out</dt><dd class="num">{formatPaise(vault.totals.spent)}</dd></div>
				</dl>
			</section>

			<section class="quick" aria-label="Add something new">
				<button class="btn btn--primary btn--block" type="button" onclick={() => openPaymentComposer()}>
					<Icon name="money-in" size={17} /> Record a payment
				</button>
				<div class="quick__row">
					<button class="quick__btn" type="button" onclick={() => openExpenseComposer()}>
						<span class="quick__icon quick__icon--out" aria-hidden="true"><Icon name="money-out" size={19} /></span>
						Add expense
					</button>
					<button class="quick__btn" type="button" onclick={() => openClientComposer()}>
						<span class="quick__icon" aria-hidden="true"><Icon name="plus" size={19} /></span>
						New client
					</button>
					<button class="quick__btn" type="button" onclick={() => openProjectComposer()}>
						<span class="quick__icon" aria-hidden="true"><Icon name="target" size={19} /></span>
						New project
					</button>
				</div>
			</section>


				</div>

					<div class="view__main">
			<section class="section">
				<div class="section__head">
					<div class="section__title">
						<h2 class="h2">Your projects</h2>
					</div>
					{#if $vaultData.projects.length}
						<button class="btn btn--quiet btn--sm" type="button" onclick={() => switchTab('projects')}>See all</button>
					{/if}
				</div>

				{#if activeProjects.length}
					<div class="list">
						{#each activeProjects.slice(0, 3) as project (project.id)}
							{@const paid = paidByProject[project.id] ?? 0}
							{@const pay = projectPaymentStatus(project.estimatedPaise, paid)}
							<article class="row row--flat">
								<div class="row__body">
									<p class="row__title">{project.name}</p>
									<p class="row__meta">{project.clientName}</p>
									<Progress value={paid} max={project.estimatedPaise} label={`${formatPaise(paid)} received of ${formatPaise(project.estimatedPaise)}`} />
									<div class="row__figures">
										<span class="num">{formatPaise(paid)} of {formatPaise(project.estimatedPaise)}</span>
										{#if pay.remainingPaise > 0}
											<span class="num project-remaining">{formatPaise(pay.remainingPaise)} still to collect</span>
										{:else if pay.excessPaise > 0}
											<span class="num project-remaining">{formatPaise(pay.excessPaise)} above the estimate</span>
										{/if}
									</div>
									<p class="tiny">Updated {formatDateTime(project.updatedAt)} · {actorLabel(project.updatedBy)}</p>
								</div>
								<div class="row__side">
									<span class="badge" class:badge--in={pay.covered}>{paymentStateLabel(pay.state)}</span>
								</div>
							</article>
						{/each}
					</div>
				{:else if $vaultData.projects.length}
					<EmptyState icon="target" title="No work in progress" message="Every project is marked work-done. Start something new, or reopen a project from the Projects tab."><button class="btn btn--outline btn--sm" type="button" onclick={() => switchTab('projects')}>See projects</button></EmptyState>
				{:else}
					<EmptyState icon="target" title="No projects yet" message="Add a project with an estimated price. Vault tracks payments against it and shows when it is fully paid."><button class="btn btn--primary btn--sm" type="button" onclick={() => openProjectComposer()}>Add a project</button></EmptyState>
				{/if}
			</section>

			<section class="section">
				<div class="section__head">
					<div class="section__title">
								<h2 class="h2">Split by partner</h2>
					</div>
				</div>
				<div class="split">
					{#each ['a', 'b'] as partner (partner)}
						{@const member = partner === 'a' ? vault.members.a : vault.members.b}
						{@const figures = partner === 'a' ? vault.totals.a : vault.totals.b}
						<article class="split__row" class:split__row--b={partner === 'b'}>
							<span class="avatar" class:avatar--b={partner === 'b'} aria-hidden="true">{initial(member.name)}</span>
							<div class="split__body">
							<div class="split__name">{member.name}<span>{partner === ownPartner ? 'You' : 'Partner'}</span></div>
							<div class="split__bar" role="img" aria-label={`${member.name}: ${formatPaise(figures.received)} received, ${formatPaise(figures.spent)} spent`}>
								<span class="split__fill" style={`width: ${Math.min(100, figures.received + figures.spent ? figures.received / (figures.received + figures.spent) * 100 : 0)}%`}></span>
							</div>
							<dl class="split__figures">
								<div><dt>Received</dt><dd class="num">{formatPaise(figures.received)}</dd></div>
								<div><dt>Spent</dt><dd class="num">{formatPaise(figures.spent)}</dd></div>
							</dl>
							</div>
						</article>
					{/each}
				</div>
			</section>

			<section class="section">
				<div class="section__head">
					<div class="section__title">
						<h2 class="h2">Latest changes</h2>
					</div>
					{#if $vaultData.mutations.length}
						<button class="btn btn--quiet btn--sm" type="button" onclick={() => { switchTab('more'); morePanel = 'history'; }}>See all</button>
					{/if}
				</div>

				{#if $vaultData.mutations.length}
					<div class="list">
						{#each $vaultData.mutations.slice(0, 5) as mutation (mutation.id)}
							{@const change = mutationAmount(mutation)}
							<article class="row row--flat">
								<span class="row__icon" class:row__icon--out={change.direction === 'out'} aria-hidden="true">
									<Icon name={mutationIcon(mutation)} size={19} />
								</span>
								<div class="row__body">
									<p class="row__title">{summaryText(mutation.summary)}</p>
									<p class="row__meta">{actorLabel(mutation.actorEmail)} · {formatDateTime(mutation.createdAt)}</p>
								</div>
								<span class="row__amount num" class:row__amount--in={change.direction === 'in'} class:row__amount--out={change.direction === 'out'}>
									{change.direction === 'out' ? '−' : '+'}{formatPaise(change.amount)}
								</span>
							</article>
						{/each}
					</div>
				{:else}
					<EmptyState icon="history" title="Nothing recorded yet" message="Every payment and expense you add shows up here, so you both always know what changed."><button class="btn btn--primary btn--sm" type="button" onclick={() => openPaymentComposer()}>Record the first payment</button></EmptyState>
				{/if}
			</section>
					</div>
				</div>
			</div>
		{:else if activeTab === 'clients'}
			<div class="view">
				<div class="view__head">
					<div class="view__titles">
						<h2 class="h1">Clients</h2>
						<p class="view__sub">{activeClients.length} active · {$vaultData.clients.length} total</p>
					</div>
					<button class="btn btn--primary btn--sm" type="button" onclick={() => openClientComposer()}>
						<Icon name="plus" size={16} /> Add
					</button>
				</div>

				<div class="view__cols">
					<div class="view__aside">
						<div class="rail-card">
							<p class="rail-card__label">Showing</p>
							<ChipGroup label="Which clients to show" options={[{ value: 'active', label: `Active · ${activeClients.length}` }, { value: 'all', label: `All · ${$vaultData.clients.length}` }]} value={clientFilter} onChange={(value) => (clientFilter = value as 'active' | 'all')} />
						</div>
					</div>
					<div class="view__main">

			{#if $vaultData.clients.length > 4}
				<label class="search mt-14">
					<Icon name="search" size={18} />
					<input bind:value={query} type="search" placeholder="Search clients" aria-label="Search clients" />
				</label>
			{/if}

			<section class="section">
				{#if filteredClients.length}
					<div class="list">
						{#each filteredClients as client (client.id)}
							<article class="row" class:row--faded={client.isArchived}>
								<span class="row__icon row__icon--muted" aria-hidden="true">{initial(client.name)}</span>
								<div class="row__body">
									<p class="row__title">{client.name}</p>
									{#if client.contact}<p class="row__meta">{client.contact}</p>{/if}
									{#if client.notes}<p class="row__note">{client.notes}</p>{/if}
									{#if client.isArchived}<span class="badge">Archived</span>{/if}
								</div>
								<div class="row__side">
									<div class="row__tools">
										<button class="tool" type="button" onclick={() => openClientComposer(client)} aria-label={`Edit ${client.name}`}>
											<Icon name="pencil" size={16} />
										</button>
										<button class="tool" type="button" onclick={() => archiveClient(client)} aria-label={`${client.isArchived ? 'Restore' : 'Archive'} ${client.name}`}>
											{client.isArchived ? 'Restore' : 'Archive'}
										</button>
									</div>
								</div>
							</article>
						{/each}
					</div>
				{:else if needle}
					<EmptyState icon="search" title={`No clients match “${query}”`}><button class="btn btn--outline btn--sm" type="button" onclick={() => (query = '')}>Clear search</button></EmptyState>
				{:else}
					<EmptyState icon="clients" title="No clients yet" message="Add the people or companies who pay you. You can record a payment as soon as one exists."><button class="btn btn--primary btn--sm" type="button" onclick={() => openClientComposer()}>Add your first client</button></EmptyState>
				{/if}
			</section>
					</div>
				</div>
			</div>
		{:else if activeTab === 'projects'}
			<div class="view">
				<div class="view__head">
					<div class="view__titles">
						<h2 class="h1">Projects</h2>
						<p class="view__sub">{activeProjects.length} in progress · {formatPaise(projectsSummary.outstandingPaise)} still to collect</p>
					</div>
					<button class="btn btn--primary btn--sm" type="button" onclick={() => openProjectComposer()}>
						<Icon name="plus" size={16} /> Add
					</button>
				</div>

				<div class="view__cols">
					<div class="view__aside">
						<div class="summary">
							<p class="summary__label">Active work</p>
							<p class="summary__value num">{formatPaise(projectsSummary.estimatedPaise)}</p>
							<dl class="summary__rows">
								<div><dt>Received</dt><dd class="num">{formatPaise(projectsSummary.paidPaise)}</dd></div>
								<div><dt>Still to collect</dt><dd class="num">{formatPaise(projectsSummary.outstandingPaise)}</dd></div>
							</dl>
						</div>
						<p class="hint">An estimate is not income. “Fully paid” appears once payments reach it.</p>
					</div>
					<div class="view__main">

			{#if $vaultData.projects.length > 4}
				<label class="search mt-14">
					<Icon name="search" size={18} />
					<input bind:value={query} type="search" placeholder="Search projects" aria-label="Search projects" />
				</label>
			{/if}

			{#if filteredProjects.length}
				<div class="list">
					{#each filteredProjects as project (project.id)}
						{@const paid = paidByProject[project.id] ?? 0}
						{@const paymentCount = $vaultData.payments.filter((payment) => payment.projectId === project.id).length}
						{@const pay = projectPaymentStatus(project.estimatedPaise, paid)}
						<article class="row">
							<div class="row__body">
								<p class="row__title">{project.name}</p>
								<p class="row__meta">{project.clientName}</p>
								<Progress value={paid} max={project.estimatedPaise} label={`${formatPaise(paid)} received of ${formatPaise(project.estimatedPaise)}`} />
								<div class="row__figures">
									<span class="num">{formatPaise(paid)} of {formatPaise(project.estimatedPaise)}</span>
									{#if pay.remainingPaise > 0}
										<span class="num project-remaining">{formatPaise(pay.remainingPaise)} still to collect</span>
									{:else if pay.excessPaise > 0}
										<span class="num project-remaining">{formatPaise(pay.excessPaise)} above the estimate</span>
									{/if}
								</div>
								<div class="project-actions">
									{#if !pay.covered}
										<button class="btn btn--outline btn--sm" type="button" onclick={() => openPaymentComposer(null, project)}><Icon name="plus" size={16} /> Add payment</button>
									{/if}
									{#if paymentCount > 0}
										<button class="btn btn--quiet btn--sm" type="button" onclick={() => viewProjectPayments(project)}>View {paymentCount} payment{paymentCount === 1 ? '' : 's'}</button>
									{/if}
									<button class="btn btn--quiet btn--sm" type="button" disabled={actionBusy} onclick={() => void toggleProjectWorkStatus(project)}>
										{project.status === 'done' ? 'Reopen work' : 'Mark work done'}
									</button>
								</div>
								{#if project.note}<p class="row__note">{project.note}</p>{/if}
								<p class="tiny">Updated {formatDateTime(project.updatedAt)} · {actorLabel(project.updatedBy)}</p>
							</div>
							<div class="row__side">
								<span class="badge" class:badge--in={pay.covered}>{paymentStateLabel(pay.state)}</span>
								{#if project.status === 'done'}
									<span class="badge badge--soft">Work done</span>
								{/if}
								<div class="row__tools">
									<button class="tool" type="button" onclick={() => openProjectComposer(project)} aria-label={`Edit ${project.name}`}>
										<Icon name="pencil" size={16} />
									</button>
									<button class="tool tool--danger" type="button" onclick={() => removeProject(project)} aria-label={`Delete ${project.name}`}>
										<Icon name="trash" size={16} />
									</button>
								</div>
							</div>
						</article>
					{/each}
				</div>
			{:else if needle}
				<EmptyState icon="search" title={`No projects match “${query}”`}><button class="btn btn--outline btn--sm" type="button" onclick={() => (query = '')}>Clear search</button></EmptyState>
			{:else}
				<EmptyState icon="target" title="No projects yet" message="One client can carry several projects. Give each one an estimated price and track payments against it."><button class="btn btn--primary btn--sm" type="button" onclick={() => openProjectComposer()}>Add your first project</button></EmptyState>
			{/if}
					</div>
				</div>
			</div>
		{:else if activeTab === 'payments'}
			<div class="view">
				<div class="view__head">
					<div class="view__titles">
						<h2 class="h1">Payments</h2>
						<p class="view__sub">{formatPaise(vault.totals.earned)} received across {$vaultData.payments.length} payment{$vaultData.payments.length === 1 ? '' : 's'}</p>
					</div>
					<button class="btn btn--primary btn--sm" type="button" onclick={() => openPaymentComposer()}>
						<Icon name="plus" size={16} /> Add
					</button>
				</div>

				<div class="view__cols">
					<div class="view__aside">
			{#if $vaultData.payments.length}
				<TagFilterBar
					label="Filter payments"
					tags={paymentTagsUsed}
					filter={paymentFilter}
					summary={paymentSummary}
					partnerAName={vault.members.a.name}
					partnerBName={vault.members.b.name}
					unitLabel="payment"
					totalLabel="Received"
					presets={RANGE_PRESETS}
					disabled={actionBusy}
					onTag={(tag) => setTagFilter('payments', tag)}
					onPreset={(preset) => chooseRangePreset('payments', preset)}
					onBound={(bound, value) => setRangeBound('payments', bound, value)}
					onReset={() => resetFilters('payments')}
				/>
			{/if}

			{#if paymentProjectFilter}
				<div class="payment-filter" role="status">
					<span>Payments for <strong>{paymentProjectFilter.name}</strong></span>
					<button class="btn btn--quiet btn--sm" type="button" onclick={() => (paymentProjectFilter = null)}>Show all payments</button>
				</div>
			{/if}

					</div>
					<div class="view__main">
			{#if $vaultData.payments.length > 4}
				<label class="search">
					<Icon name="search" size={16} />
					<input bind:value={query} type="search" placeholder="Search payments" aria-label="Search payments" />
				</label>
			{/if}

			{#if filteredPayments.length}
				<div class="between mt-14">
					<p class="tiny" role="status">Showing {filteredPayments.length} of {$vaultData.payments.length}</p>
					<button class="btn btn--quiet btn--sm" type="button" onclick={exportPaymentsCsv}>Export CSV</button>
				</div>
			{/if}

			{#if filteredPayments.length}
				<div class="list">
					{#each filteredPayments as payment (payment.id)}
						<article class="row">
							<div class="row__body">
								<p class="row__title">{payment.clientName}</p>
								<p class="row__meta">
									{formatRelativeDate(payment.occurredOn)} · received by {partnerName(payment.partner)}{payment.projectName ? ` · ${payment.projectName}` : ''}
								</p>
								{#if payment.tags.length}
									<div class="row__tags">
										{#each payment.tags as tag (tag)}
											<button
												class="tag-pill"
												class:tag-pill--on={paymentFilter.tag === tag}
												type="button"
												aria-label={`Show payments tagged ${tag}`}
												onclick={() => setTagFilter('payments', paymentFilter.tag === tag ? null : tag)}
											>{tag}</button>
										{/each}
									</div>
								{/if}
								{#if payment.note}<p class="row__note">{payment.note}</p>{/if}
							</div>
							<div class="row__side">
								<span class="row__amount row__amount--in num">+{formatPaise(payment.amountPaise)}</span>
								<div class="row__tools">
									<button class="tool" type="button" onclick={() => openPaymentComposer(payment)} aria-label={`Edit payment from ${payment.clientName}`}>
										<Icon name="pencil" size={16} />
									</button>
									<button class="tool tool--danger" type="button" onclick={() => removePayment(payment)} aria-label={`Delete payment from ${payment.clientName}`}>
										<Icon name="trash" size={16} />
									</button>
								</div>
							</div>
						</article>
					{/each}
				</div>
			{:else if needle}
				<EmptyState icon="search" title={`No payments match “${query}”`}><button class="btn btn--outline btn--sm" type="button" onclick={() => (query = '')}>Clear search</button></EmptyState>
			{:else if $vaultData.payments.length}
				<EmptyState icon="tag" title={paymentFilter.tag ? `Nothing tagged ${paymentFilter.tag} in this range` : 'Nothing in this date range'}><button class="btn btn--outline btn--sm" type="button" onclick={() => resetFilters('payments')}>Show this month</button></EmptyState>
			{:else}
				<EmptyState icon="money-in" title="No payments recorded" message="Record what a client paid, and the shared balance updates for both of you instantly."><button class="btn btn--primary btn--sm" type="button" onclick={() => openPaymentComposer()}>Record payment</button></EmptyState>
			{/if}
					</div>
				</div>
			</div>
		{:else if activeTab === 'expenses'}
			<div class="view">
				<div class="view__head">
					<div class="view__titles">
						<h2 class="h1">Expenses</h2>
						<p class="view__sub">{formatPaise(vault.totals.spent)} tracked across {$vaultData.expenses.length} expense{$vaultData.expenses.length === 1 ? '' : 's'}</p>
					</div>
					<button class="btn btn--primary btn--sm" type="button" onclick={() => openExpenseComposer()}>
						<Icon name="plus" size={16} /> Add
					</button>
				</div>

				<div class="view__cols">
					<div class="view__aside">
			{#if $vaultData.expenses.length}
				<TagFilterBar
					label="Filter expenses"
					tags={expenseTagsUsed}
					filter={expenseFilter}
					summary={expenseSummary}
					partnerAName={vault.members.a.name}
					partnerBName={vault.members.b.name}
					unitLabel="expense"
					totalLabel="Spent"
					presets={RANGE_PRESETS}
					disabled={actionBusy}
					onTag={(tag) => setTagFilter('expenses', tag)}
					onPreset={(preset) => chooseRangePreset('expenses', preset)}
					onBound={(bound, value) => setRangeBound('expenses', bound, value)}
					onReset={() => resetFilters('expenses')}
				/>
			{/if}

					</div>
					<div class="view__main">
			{#if $vaultData.expenses.length > 4}
				<label class="search">
					<Icon name="search" size={16} />
					<input bind:value={query} type="search" placeholder="Search expenses" aria-label="Search expenses" />
				</label>
			{/if}

			{#if filteredExpenses.length}
				<div class="between mt-14">
					<p class="tiny" role="status">Showing {filteredExpenses.length} of {$vaultData.expenses.length}</p>
					<button class="btn btn--quiet btn--sm" type="button" onclick={exportExpensesCsv}>Export CSV</button>
				</div>
			{/if}

			{#if filteredExpenses.length}
				<div class="list">
					{#each filteredExpenses as expense (expense.id)}
						<article class="row">
							<div class="row__body">
								<div class="row__tags">
									{#each expense.tags as tag (tag)}
										<button
											class="tag-pill tag-pill--row"
											class:tag-pill--on={expenseFilter.tag === tag}
											type="button"
											aria-label={`Show expenses tagged ${tag}`}
											onclick={() => setTagFilter('expenses', expenseFilter.tag === tag ? null : tag)}
										>{tag}</button>
									{/each}
								</div>
								<p class="row__meta">
									{formatRelativeDate(expense.occurredOn)} · paid by {partnerName(expense.partner)}{expense.clientName ? ` · ${expense.clientName}` : ''}
								</p>
								{#if expense.note}<p class="row__note">{expense.note}</p>{/if}
							</div>
							<div class="row__side">
								<span class="row__amount row__amount--out num">−{formatPaise(expense.amountPaise)}</span>
								<div class="row__tools">
									<button class="tool" type="button" onclick={() => openExpenseComposer(expense)} aria-label={`Edit ${expense.tags.join(' ')} expense`}>
										<Icon name="pencil" size={16} />
									</button>
									<button class="tool tool--danger" type="button" onclick={() => removeExpense(expense)} aria-label={`Delete ${expense.tags.join(' ')} expense`}>
										<Icon name="trash" size={16} />
									</button>
								</div>
							</div>
						</article>
					{/each}
				</div>
			{:else if needle}
				<EmptyState icon="search" title={`No expenses match “${query}”`}><button class="btn btn--outline btn--sm" type="button" onclick={() => (query = '')}>Clear search</button></EmptyState>
			{:else if $vaultData.expenses.length}
				<EmptyState icon="tag" title={expenseFilter.tag ? `Nothing tagged ${expenseFilter.tag} in this range` : 'Nothing in this date range'}><button class="btn btn--outline btn--sm" type="button" onclick={() => resetFilters('expenses')}>Show this month</button></EmptyState>
			{:else}
				<EmptyState icon="money-out" title="No expenses recorded" message="Track what either of you paid out, so the profit split stays honest."><button class="btn btn--primary btn--sm" type="button" onclick={() => openExpenseComposer()}>Add expense</button></EmptyState>
			{/if}
					</div>
				</div>
			</div>
		{:else}
			<div class="view">
				<div class="view__head">
					<div class="view__titles">
						<h2 class="h1">More</h2>
						<p class="view__sub">History and settings for {vault.name}</p>
					</div>
				</div>
				<div class="view__cols">
					<div class="view__main">
			<ChipGroup label="More sections" options={[{ value: 'history', label: 'History', icon: 'history' }, { value: 'settings', label: 'Settings', icon: 'info' }]} value={morePanel} onChange={(value) => (morePanel = value as MorePanel)} />

			<section class="section">
				{#if morePanel === 'history'}
					{#if $vaultData.mutations.length}
						<div class="list">
							{#each $vaultData.mutations as mutation (mutation.id)}
								{@const change = mutationAmount(mutation)}
								<article class="row row--flat">
									<span class="row__icon" class:row__icon--out={change.direction === 'out'} aria-hidden="true">
										<Icon name={mutationIcon(mutation)} size={19} />
									</span>
									<div class="row__body">
										<p class="row__title">{summaryText(mutation.summary)}</p>
										<p class="row__meta">{actorLabel(mutation.actorEmail)} · {formatDateTime(mutation.createdAt)}</p>
									</div>
									<span class="row__amount num" class:row__amount--in={change.direction === 'in'} class:row__amount--out={change.direction === 'out'}>
										{change.direction === 'out' ? '−' : '+'}{formatPaise(change.amount)}
									</span>
								</article>
							{/each}
						</div>
					{:else}
						<EmptyState icon="history" title="No history yet" message="Every change is logged with who made it and when, so nothing is a mystery later." />
					{/if}
				{:else}
					<div class="settings">
						<section class="group">
							<h3 class="group__title">Vault</h3>
							<div class="panel">
								<div class="panel__row panel__row--kv">
									<p class="panel__label">Name</p>
									<p class="panel__value">{vault.name}</p>
								</div>
								<div class="panel__row panel__row--kv">
									<p class="panel__label">Created</p>
									<p class="panel__value">{formatDateTime(vault.createdAt)}</p>
								</div>
							</div>
						</section>

						<section class="group">
							<h3 class="group__title">People</h3>
							<div class="panel">
								{#each partnerRows as entry (entry.key)}
									<div class="panel__row">
										<span class="panel__face" class:panel__face--you={ownPartner === entry.key} aria-hidden="true">{initial(entry.member.name)}</span>
										<div class="panel__body">
											<p class="panel__value">{entry.member.name}{ownPartner === entry.key ? ' · you' : ''}</p>
											<p class="panel__meta">{entry.member.email}</p>
										</div>
										{#if ownPartner !== entry.key}
											<button class="panel__action" type="button" disabled={actionBusy || partnerEditBusy} onclick={() => (editingPartner === entry.key ? closePartnerEditor() : openPartnerEditor(entry.key))}>
												{editingPartner === entry.key ? 'Close' : 'Edit'}
											</button>
										{/if}
									</div>
								{/each}
							</div>

							{#if editingPartner}
								<form class="panel panel--form" onsubmit={(event) => void savePartnerEdit(event)}>
									<p class="group__title">Editing {editingPartner === 'a' ? vault.members.a.name : vault.members.b.name}</p>
									<label class="field">
										<span class="field__label">Name</span>
										<input class="input" bind:value={partnerEditName} maxlength="80" placeholder="Partner name" disabled={partnerEditBusy} required />
									</label>
									<label class="field">
										<span class="field__label">Email</span>
										<input class="input" bind:value={partnerEditEmail} type="email" maxlength="320" placeholder="partner@example.com" disabled={partnerEditBusy} required />
									</label>
									<p class="panel__meta">This address belongs to the other partner; you can't change your own.</p>
									<div class="edit-actions">
										<button class="btn btn--quiet btn--sm" type="button" disabled={partnerEditBusy} onclick={() => closePartnerEditor()}>Cancel</button>
										<button class="btn btn--primary btn--sm" type="submit" disabled={partnerEditBusy || !partnerEditName.trim() || !partnerEditEmail.trim()}>
											{partnerEditBusy ? 'Saving…' : 'Save'}
										</button>
									</div>
								</form>
							{/if}
						</section>

						<section class="group">
							<h3 class="group__title">Expense categories</h3>
							<div class="panel panel--pad">
								<p class="panel__meta">{vault.tags.length} tags · shown when you add an expense, shared with {otherName}.</p>
								<div class="tag-wrap" aria-label="Expense categories">
									{#each vault.tags as tag (tag)}
										<span class="tag-chip">
											{tag}
											<button class="tag-chip__x" type="button" aria-label={`Remove ${tag} tag`} disabled={actionBusy} onclick={() => removeCommonTag(tag)}>
												<Icon name="close" size={12} />
											</button>
										</span>
									{/each}
								</div>
								<form class="tag-add" onsubmit={(event) => addCommonTag(event)}>
									<input class="input" bind:value={tagDraft} maxlength="40" placeholder="New tag, e.g. Hosting" aria-label="New spending tag" disabled={actionBusy} />
									<button class="btn btn--outline btn--sm" type="submit" disabled={actionBusy || !tagDraft.trim()}>Add</button>
								</form>
								<p class="panel__meta">Removing a tag here doesn't change expenses already tagged with it.</p>
							</div>
						</section>

						<section class="group">
							<h3 class="group__title">This device</h3>
							<div class="panel">
								<div class="panel__row panel__row--stack">
									<div class="panel__body">
										<p class="panel__value">Offline copy is on</p>
										<p class="panel__meta">Records stay readable without a network. The copy isn't encrypted, and a normal sign-out leaves it here.</p>
									</div>
								</div>
								<div class="panel__row">
									<div class="panel__body">
										<p class="panel__value">Reload from the cloud</p>
										<p class="panel__meta">Fetch anything saved on the other phone.</p>
									</div>
									<button class="panel__action" type="button" disabled={actionBusy || pullingUpdates} onclick={() => void pullUpdates()}>
										{pullingUpdates ? 'Updating…' : 'Pull'}
									</button>
								</div>
							</div>
						</section>

						<section class="group">
							<h3 class="group__title">Account</h3>
							<div class="panel">
								<div class="panel__row">
									<div class="panel__body">
										<p class="panel__label">Signed in as</p>
										<p class="panel__value">{user.email}</p>
									</div>
								</div>
								<div class="panel__row">
									<div class="panel__body">
										<p class="panel__value">Sign out of Vault</p>
										<p class="panel__meta">Keeps this device's offline copy.</p>
									</div>
									<button class="panel__action" type="button" disabled={actionBusy || signingOutNow} onclick={() => void requestSignOut('keep')}>
										{signingOutNow ? 'Working…' : 'Sign out'}
									</button>
								</div>
								<div class="panel__row">
									<div class="panel__body">
										<p class="panel__value panel__value--danger">Sign out and clear local data</p>
										<p class="panel__meta">For a shared device. Removes the offline copy once everything has synced.</p>
									</div>
									<button class="panel__action panel__action--danger" type="button" disabled={actionBusy || signingOutNow} onclick={() => void requestSignOut('clear')}>
										Clear
									</button>
								</div>
							</div>
						</section>
					</div>
				{/if}
			</section>
					</div>
				</div>
			</div>
		{/if}
	</main>
	</div>

	<!-- Phone navigation: one button that blooms into a ring of sections. -->
	<nav
		class="dial"
		class:is-open={dialOpen}
		aria-label="Vault sections"
		onpointerdown={startSwipe}
		onpointermove={moveSwipe}
		onpointerup={endSwipe}
		onpointercancel={() => { if (swipeStart) swipeStart.active = false; swipeTarget = null; }}
	>
		<button class="dial__scrim" type="button" tabindex={-1} aria-label="Close sections" onclick={onScrimClick}></button>
		<div class="dial__ring" id="vault-dial" aria-hidden={!dialOpen}>
			<svg class="dial__track" viewBox="0 0 240 240" aria-hidden="true">
				<path d="M220.4 93.1A104 104 0 0 0 19.6 93.1" />
			</svg>
			{#each dialItems as item, index (item.id)}
				<button
					class="dial__item"
					class:is-on={activeTab === item.id}
					class:is-aimed={swipeTarget === item.id}
					style={`--a: ${item.angle}deg; --i: ${index}`}
					type="button"
					aria-current={activeTab === item.id}
					aria-label={item.label}
					tabindex={dialOpen ? 0 : -1}
					onclick={() => chooseSection(item.id)}
				>
					<Icon name={item.icon} size={19} />
				</button>
			{/each}
		</div>
		<button class="dial__fab" type="button" aria-expanded={dialOpen} aria-controls="vault-dial" onclick={onFabClick}>
			{#if dialOpen}
				<Icon name="close" size={22} />
			{:else}
				<Icon name={currentSection.icon} size={22} />
			{/if}
			<span class="sr-only">{dialOpen ? 'Close sections' : `Sections, currently ${currentSection.label}`}</span>
		</button>
	</nav>
</div>

<svelte:window onscroll={handleScroll} onkeydown={(event) => { if (event.key === 'Escape' && dialOpen) dialOpen = false; }} />

{#if composer !== 'none'}
	<Sheet
		closeLabel="Close form"
		busy={actionBusy}
		onClose={closeComposer}
		eyebrow={composer === 'client' ? 'Client' : composer === 'payment' ? 'Money in' : composer === 'project' ? 'Project' : 'Money out'}
		title={composer === 'client' ? editingClient ? 'Edit client' : 'New client' : composer === 'payment' ? editingPayment ? 'Edit payment' : 'Record a payment' : composer === 'project' ? editingProject ? 'Edit project' : 'New project' : editingExpense ? 'Edit expense' : 'Add an expense'}
	>
			{#if composer === 'client'}
				<form class="form" onsubmit={(event) => void saveClient(event)}>
					<label class="field">
						<span class="field__label">Client name</span>
						<input class="input" bind:value={clientName} maxlength="120" autocomplete="organization" placeholder="Who pays you" required disabled={actionBusy} />
					</label>
					<label class="field">
						<span class="field__label">Contact <em class="field__optional">optional</em></span>
						<input class="input" bind:value={clientContact} maxlength="320" placeholder="Email, phone or contact person" disabled={actionBusy} />
					</label>
					<label class="field">
						<span class="field__label">Notes <em class="field__optional">optional</em></span>
						<textarea class="textarea" bind:value={clientNotes} maxlength="1000" rows="3" placeholder="Project or billing note" disabled={actionBusy}></textarea>
					</label>
					<div class="sheet__foot">
						<button class="btn btn--primary btn--block" type="submit" disabled={actionBusy}>
						{actionBusy ? 'Saving…' : editingClient ? 'Save client' : 'Add client'}
					</button>
					</div>
				</form>
			{:else if composer === 'payment'}
				{#if !activeClients.length}
					<EmptyState icon="clients" title="Add a client first" message="A payment has to be linked to the client who paid it."><button class="btn btn--primary btn--sm" type="button" onclick={() => openClientComposer()}>Add a client</button></EmptyState>
				{:else}
					<form class="form" onsubmit={(event) => void savePayment(event)}>
						<div class="field">
							<span class="field__label">Amount received</span>
							<label class="amount-field">
								<span class="amount-field__sign" aria-hidden="true">₹</span>
								<input bind:value={paymentAmount} inputmode="decimal" autocomplete="off" placeholder="0" aria-label="Amount received in rupees" required disabled={actionBusy} />
							</label>
							<p class="hint">Enter what you received today, not the full project estimate. Add another payment whenever the next installment arrives.</p>
						</div>

						<div class="field">
							<span class="field__label">Client</span>
							{#if paymentClientOptions.length > 6}
								<input class="input" bind:value={paymentClientQuery} type="search" placeholder="Search clients" aria-label="Search clients" disabled={actionBusy} />
							{/if}
							<ChipGroup label="Client" options={shownPaymentClientOptions} value={paymentClientId} disabled={actionBusy} onChange={choosePaymentClient} />
						</div>

						{#if $vaultData.projects.length}
							<div class="field">
								<span class="field__label">Project <em class="field__optional">optional</em></span>
								{#if paymentClientProjects.length}
									<ChipGroup label="Project for this payment" options={[{ value: '', label: 'No project' }, ...paymentClientProjects.map((project) => ({ value: project.id, label: project.name }))]} value={selectedPaymentProject?.id ?? ''} disabled={actionBusy} onChange={choosePaymentProject} />
								{:else}
									<p class="hint">{selectedPaymentClient?.name ?? 'This client'} has no projects yet. You can still record a payment without a project.</p>
								{/if}
								{#if selectedPaymentProject}
									<p class="hint">
										Adds to {selectedPaymentProject.name} · {formatPaise(paidByProject[selectedPaymentProject.id] ?? 0)} received so far of {formatPaise(selectedPaymentProject.estimatedPaise)} estimated. Partial payments are welcome.
									</p>
								{/if}
							</div>
						{/if}

						<div class="field">
							<span class="field__label">Tags <em class="field__optional">optional</em></span>
							<ChipGroup
								label="Tags for this payment"
								options={composerTagOptions}
								multiple
								values={paymentTags}
								maxSelected={MAX_PAYMENT_TAGS}
								disabled={actionBusy}
								onChange={(tag) => toggleTag('payments', tag)}
							/>
							<div class="tag-add">
								<input
									class="input"
									bind:value={newPaymentTag}
									maxlength={MAX_TAG_LENGTH}
									placeholder="New tag, e.g. Retainer"
									aria-label="New payment tag"
									disabled={actionBusy}
									onkeydown={(event) => newTagKeydown(event, 'payments')}
								/>
								<button class="btn btn--outline btn--sm" type="button" disabled={actionBusy || !newPaymentTag.trim()} onclick={() => addInlineTag('payments')}>Add</button>
							</div>
							<p class="hint" role="status">
								{paymentTags.length} of {MAX_PAYMENT_TAGS} tags.
								{paymentTags.length === MAX_PAYMENT_TAGS ? ' Remove one to choose another.' : ' Tag now, or leave it blank — money can be tagged later.'}
							</p>
						</div>

						<div class="field">
							<span class="field__label">Received by</span>
							<ChipGroup label="Received by" options={partnerOptions} value={paymentPartner} disabled={actionBusy} onChange={(value) => (paymentPartner = value as PartnerKey)} />
						</div>

						<div class="field">
							<span class="field__label">Date</span>
							<ChipGroup label="Payment date" options={[{ value: 'today', label: 'Today' }, { value: 'yesterday', label: 'Yesterday' }, { value: 'custom', label: 'Another day' }]} value={paymentDateMode} disabled={actionBusy} onChange={(value) => pickDate(value as DateMode, 'payment')} />
							{#if paymentDateMode === 'custom'}
								<input class="input" bind:value={paymentDate} type="date" aria-label="Payment date" required disabled={actionBusy} />
							{:else}
								<p class="hint">Saving as {formatDateKey(paymentDate)}.</p>
							{/if}
						</div>

						<label class="field">
							<span class="field__label">Note <em class="field__optional">optional</em></span>
							<textarea class="textarea" bind:value={paymentNote} maxlength="1000" rows="3" placeholder="Invoice number or what the payment was for" disabled={actionBusy}></textarea>
						</label>

						<div class="sheet__foot">
							<button class="btn btn--primary btn--block" type="submit" disabled={actionBusy}>
							{actionBusy ? 'Saving…' : editingPayment ? 'Save payment' : 'Record payment'}
						</button>
						</div>
					</form>
				{/if}
			{:else if composer === 'project'}
				{#if !activeClients.length}
					<EmptyState icon="clients" title="Add a client first" message="A project belongs to the client who ordered the work."><button class="btn btn--primary btn--sm" type="button" onclick={() => openClientComposer()}>Add a client</button></EmptyState>
				{:else}
					<form class="form" onsubmit={(event) => void saveProject(event)}>
						<label class="field">
							<span class="field__label">Project name</span>
							<input class="input" bind:value={projectName} maxlength="120" placeholder="Website build" required disabled={actionBusy} />
						</label>

						<div class="field">
							<span class="field__label">Client</span>
							{#if paymentClientOptions.length > 6}
								<input class="input" bind:value={projectClientQuery} type="search" placeholder="Search clients" aria-label="Search clients" disabled={actionBusy} />
							{/if}
							<ChipGroup label="Client for this project" options={shownProjectClientOptions} value={projectClientId} disabled={actionBusy} onChange={(value) => (projectClientId = value)} />
						</div>

						<div class="field">
							<span class="field__label">Estimated price</span>
							<label class="amount-field">
								<span class="amount-field__sign" aria-hidden="true">₹</span>
								<input bind:value={projectEstimate} inputmode="decimal" autocomplete="off" placeholder="0" aria-label="Estimated price in rupees" required disabled={actionBusy} />
							</label>
							<p class="hint">Record each installment as it arrives. Vault adds them up against this estimate and shows “Fully paid” when the received total reaches it.</p>
						</div>

						<label class="field">
							<span class="field__label">Note <em class="field__optional">optional</em></span>
							<textarea class="textarea" bind:value={projectNote} maxlength="1000" rows="3" placeholder="Scope, milestones or what is left" disabled={actionBusy}></textarea>
						</label>

						{#if editingProject}
							<p class="tiny">Last edited by {editingProject.updatedBy} · {formatDateTime(editingProject.updatedAt)}</p>
						{/if}

						<div class="sheet__foot">
							<button class="btn btn--primary btn--block" type="submit" disabled={actionBusy}>
							{actionBusy ? 'Saving…' : editingProject ? 'Save project' : 'Add project'}
						</button>
						</div>
					</form>
				{/if}
			{:else}
				<form class="form" onsubmit={(event) => void saveExpense(event)}>
					<div class="field">
						<span class="field__label">Amount paid</span>
						<label class="amount-field">
							<span class="amount-field__sign" aria-hidden="true">₹</span>
							<input bind:value={expenseAmount} inputmode="decimal" autocomplete="off" placeholder="0" aria-label="Amount paid in rupees" required disabled={actionBusy} />
						</label>
					</div>

					<div class="field">
						<span class="field__label">What it was for</span>
						<ChipGroup
							label="Spending tags"
							options={composerTagOptions}
							multiple
							values={expenseTags}
							maxSelected={MAX_EXPENSE_TAGS}
							disabled={actionBusy}
							onChange={(tag) => toggleTag('expenses', tag)}
						/>
						<div class="tag-add">
							<input
								class="input"
								bind:value={newExpenseTag}
								maxlength={MAX_TAG_LENGTH}
								placeholder="New tag, e.g. Hosting"
								aria-label="New spending tag"
								disabled={actionBusy}
								onkeydown={(event) => newTagKeydown(event, 'expenses')}
							/>
							<button class="btn btn--outline btn--sm" type="button" disabled={actionBusy || !newExpenseTag.trim()} onclick={() => addInlineTag('expenses')}>Add</button>
						</div>
						<p class="hint" role="status">{expenseTags.length} of {MAX_EXPENSE_TAGS} tags selected. {expenseTags.length === MAX_EXPENSE_TAGS ? 'Remove one to choose another.' : 'Type a new tag above to create it as you record.'}</p>
					</div>

					<div class="field">
						<span class="field__label">Paid by</span>
						<ChipGroup label="Paid by" options={partnerOptions} value={expensePartner} disabled={actionBusy} onChange={(value) => (expensePartner = value as PartnerKey)} />
					</div>

					{#if activeClients.length}
						<div class="field">
							<span class="field__label">For a client <em class="field__optional">optional</em></span>
							{#if expenseClientOptions.length > 7}
								<input class="input" bind:value={expenseClientQuery} type="search" placeholder="Search clients" aria-label="Search clients" disabled={actionBusy} />
							{/if}
							<ChipGroup label="Client for this expense" options={shownExpenseClientOptions} value={expenseClientId} disabled={actionBusy} onChange={(value) => (expenseClientId = value)} />
						</div>
					{/if}

					<div class="field">
						<span class="field__label">Date</span>
						<ChipGroup label="Expense date" options={[{ value: 'today', label: 'Today' }, { value: 'yesterday', label: 'Yesterday' }, { value: 'custom', label: 'Another day' }]} value={expenseDateMode} disabled={actionBusy} onChange={(value) => pickDate(value as DateMode, 'expense')} />
						{#if expenseDateMode === 'custom'}
							<input class="input" bind:value={expenseDate} type="date" aria-label="Expense date" required disabled={actionBusy} />
						{:else}
							<p class="hint">Saving as {formatDateKey(expenseDate)}.</p>
						{/if}
					</div>

					<label class="field">
						<span class="field__label">Note <em class="field__optional">optional</em></span>
						<textarea class="textarea" bind:value={expenseNote} maxlength="1000" rows="3" placeholder="Why this cost came up" disabled={actionBusy}></textarea>
					</label>

					<div class="sheet__foot">
						<button class="btn btn--primary btn--block" type="submit" disabled={actionBusy || expenseTags.length === 0}>
						{actionBusy ? 'Saving…' : editingExpense ? 'Save expense' : 'Add expense'}
					</button>
					</div>
				</form>
			{/if}

			{#if actionError}
				<p class="notice notice--error" role="alert">{actionError}</p>
			{/if}
	</Sheet>
{/if}

{#if confirmation}
	<Sheet title={confirmation.title} variant="dialog" busy={actionBusy} onClose={() => (confirmation = null)}>
		<p class="lead">{confirmation.message}</p>
		<div class="grid-2">
			<button class="btn btn--outline" type="button" disabled={actionBusy} onclick={() => (confirmation = null)}>Keep it</button>
			<button class="btn btn--danger" type="button" disabled={actionBusy} onclick={() => void confirmAction()}>
				{actionBusy ? 'Working…' : confirmation.confirmLabel}
			</button>
		</div>
	</Sheet>
{/if}

{#if toast}
	<ToastMessage tone={toast.tone} text={toast.text} onDismiss={dismissToast} />
{/if}
