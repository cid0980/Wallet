<script lang="ts">
	import type { User } from 'firebase/auth';

	import Icon from '$lib/components/ui/Icon.svelte';
	import ChipGroup from '$lib/components/ui/ChipGroup.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import Progress from '$lib/components/ui/Progress.svelte';
	import Sheet from '$lib/components/ui/Sheet.svelte';
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
		updateVaultTags,
		vaultDataErrorMessage
	} from '$lib/services/vault-data';
	import { vaultData } from '$lib/stores/vault-data';
	import type {
		ClientRecord,
		ExpenseRecord,
		PartnerKey,
		PaymentRecord,
		ProjectRecord,
		VaultMutation,
		VaultSummary
	} from '$lib/types/vault';
	import { MAX_EXPENSE_TAGS, MAX_VAULT_TAGS } from '$lib/types/vault';
	import {
		formatDateKey,
		formatDateTime,
		formatRelativeDate,
		todayDateKey,
		yesterdayDateKey
	} from '$lib/utils/dates';
	import { formatPaise, formatPaiseInput, netPaise, parseMoneyToPaise } from '$lib/utils/money';
	import { projectIdForClient, projectsForClient } from '$lib/utils/project-picker';

	type MainTab = 'home' | 'clients' | 'projects' | 'payments' | 'expenses' | 'more';
	type Composer = 'none' | 'client' | 'project' | 'payment' | 'expense';
	type MorePanel = 'history' | 'settings';
	type DateMode = 'today' | 'yesterday' | 'custom';

	type ChipOption = { value: string; label: string; initial?: string };
	type Toast = { tone: 'ok' | 'error'; text: string };
	type Confirmation = { title: string; message: string; confirmLabel: string; run: () => Promise<void> };

	export let vault: VaultSummary;
	export let user: User;
	export let onSignOut: () => Promise<void> | void;

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

	let paymentProjectId = '';
	let tagDraft = '';

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
	$: ownFirst = ownName.trim().split(/\s+/)[0] || 'there';
	$: selectedPaymentClient = activeClients.find((client) => client.id === paymentClientId) ?? null;
	$: selectedExpenseClient = activeClients.find((client) => client.id === expenseClientId) ?? null;

	$: partnerOptions = [
		{ value: 'a', label: vault.members.a.name, initial: initial(vault.members.a.name) },
		{ value: 'b', label: vault.members.b.name, initial: initial(vault.members.b.name) }
	] satisfies ChipOption[];

	$: vaultTagOptions = vault.tags.map((tag) => ({ value: tag, label: tag }));

	$: tagOptions = (() => {
		const seen = new Set<string>();
		const list: string[] = [];
		for (const tag of [...vault.tags, ...expenseTags]) {
			const key = tag.toLowerCase();
			if (!seen.has(key)) {
				seen.add(key);
				list.push(tag);
			}
		}
		return list;
	})();

	$: activeProjects = $vaultData.projects.filter((project) => project.status === 'active');
	$: paymentClientProjects = projectsForClient($vaultData.projects, paymentClientId);
	$: selectedPaymentProject = paymentClientProjects.find((project) => project.id === paymentProjectId) ?? null;

	$: paidByProject = (() => {
		const paid: Record<string, number> = {};
		for (const payment of $vaultData.payments) {
			if (payment.projectId) {
				paid[payment.projectId] = (paid[payment.projectId] ?? 0) + payment.amountPaise;
			}
		}
		return paid;
	})();

	$: paymentClientOptions = activeClients.map((client) => ({ value: client.id, label: client.name }));

	$: expenseClientOptions = [
		{ value: '', label: 'No client' },
		...activeClients.map((client) => ({ value: client.id, label: client.name }))
	];

	$: needle = query.trim().toLowerCase();
	$: filteredClients = needle ? shownClients.filter((client) => matches(needle, client.name, client.contact, client.notes)) : shownClients;
	$: filteredPayments = $vaultData.payments.filter((payment) =>
		(!paymentProjectFilter || payment.projectId === paymentProjectFilter.id) &&
		(!needle || matches(needle, payment.clientName, payment.projectName, payment.note, partnerName(payment.partner), formatPaise(payment.amountPaise)))
	);
	$: filteredExpenses = needle
		? $vaultData.expenses.filter((expense) =>
				matches(needle, expense.tags.join(' '), expense.clientName, expense.note, partnerName(expense.partner), formatPaise(expense.amountPaise))
			)
		: $vaultData.expenses;
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

			if (input.projectId) {
				const paidAfter =
					$vaultData.payments
						.filter((payment) => payment.projectId === input.projectId && payment.id !== editingPayment?.id)
						.reduce((sum, payment) => sum + payment.amountPaise, 0) + input.amountPaise;
				await completeProjectIfCovered(input.projectId, paidAfter);
			}
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
			message: `${formatPaise(payment.amountPaise)} from ${payment.clientName} will be removed from the balance and history.`,
			confirmLabel: 'Delete payment',
			run: () => deletePayment(vault, payment, user.email ?? '')
		};
	}

	function removeExpense(expense: ExpenseRecord): void {
		confirmation = {
			title: 'Delete this expense?',
			message: `${formatPaise(expense.amountPaise)} for ${expense.tags.join(' / ')} will be removed from the balance and history.`,
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
				await completeProjectIfCovered(editingProject.id, paidByProject[editingProject.id] ?? 0);
			} else {
				await createProject(vault.id, input, user.email ?? '');
				closeComposer();
				say(`Project added · estimate ${formatPaise(input.estimatedPaise)}.`);
			}
		});
	}

	/** When payments reach the estimated price, the project completes itself. */
	async function completeProjectIfCovered(projectId: string, paidPaise: number): Promise<void> {
		const project = $vaultData.projects.find((entry) => entry.id === projectId);
		if (!project || project.status !== 'active' || project.estimatedPaise <= 0) {
			return;
		}

		if (paidPaise >= project.estimatedPaise) {
			await runAction(async () => {
				await setProjectStatus(vault.id, projectId, 'done', user.email ?? '');
				say(`${project.name} is complete — the estimate is fully received.`);
			});
		}
	}

	function removeProject(project: ProjectRecord): void {
		const linked = $vaultData.payments.filter((payment) => payment.projectId === project.id).length;
		if (linked > 0) {
			say(`${project.name} has ${linked} payment${linked === 1 ? '' : 's'} linked to it. Remove those first.`, 'error');
			return;
		}

		confirmation = {
			title: `Delete ${project.name}?`,
			message: `The project and its ${formatPaise(project.estimatedPaise)} estimate go away. Its payments and expenses are kept.`,
			confirmLabel: 'Delete project',
			run: () => deleteProject(vault.id, project.id, user.email ?? '')
		};
	}

	function toggleExpenseTag(tag: string): void {
		if (expenseTags.includes(tag)) {
			expenseTags = expenseTags.filter((entry) => entry !== tag);
		} else if (expenseTags.length >= MAX_EXPENSE_TAGS) {
			say(`Choose at most ${MAX_EXPENSE_TAGS} tags.`, 'error');
		} else {
			expenseTags = [...expenseTags, tag];
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
	<header class="app-head">
		<div class="app-head__brand">
			<span class="app-head__logo" aria-hidden="true">{vault.name.trim().slice(0, 1).toUpperCase() || 'V'}</span>
			<div>
				<p class="eyebrow">Shared vault</p>
				<p class="app-head__vault">{vault.name}</p>
			</div>
		</div>
		<div class="app-head__side">
			{#if isOffline}
				<span class="status status--offline" role="status"><span class="status__dot" aria-hidden="true"></span>Offline</span>
			{:else if isSyncing}
				<span class="status" role="status"><span class="status__dot" aria-hidden="true"></span>Saving</span>
			{:else}
				<span class="status status--live" role="status"><span class="status__dot" aria-hidden="true"></span>Synced</span>
			{/if}
			<button
				class="avatar"
				class:avatar--b={ownPartner === 'b'}
				type="button"
				aria-label="Open vault settings"
				onclick={() => {
					switchTab('more');
					morePanel = 'settings';
				}}
			>
				{ownInitial}
			</button>
		</div>
	</header>

	<nav class="tabs" aria-label="Vault sections">
		<button class="tab" class:tab--on={activeTab === 'home'} type="button" aria-current={activeTab === 'home'} onclick={() => switchTab('home')}>
			<Icon name="home" size={21} />
			<span class="tab__label">Home</span>
		</button>
		<button class="tab" class:tab--on={activeTab === 'projects'} type="button" aria-current={activeTab === 'projects'} onclick={() => switchTab('projects')}>
			<Icon name="target" size={19} />
			<span class="tab__label">Projects</span>
		</button>
		<button class="tab" class:tab--on={activeTab === 'clients'} type="button" aria-current={activeTab === 'clients'} onclick={() => switchTab('clients')}>
			<Icon name="clients" size={21} />
			<span class="tab__label">Clients</span>
		</button>
		<button class="tab" class:tab--on={activeTab === 'payments'} type="button" aria-current={activeTab === 'payments'} onclick={() => switchTab('payments')}>
			<Icon name="money-in" size={21} />
			<span class="tab__label">Payments</span>
		</button>
		<button class="tab" class:tab--on={activeTab === 'expenses'} type="button" aria-current={activeTab === 'expenses'} onclick={() => switchTab('expenses')}>
			<Icon name="money-out" size={21} />
			<span class="tab__label">Expenses</span>
		</button>
		<button class="tab" class:tab--on={activeTab === 'more'} type="button" aria-current={activeTab === 'more'} onclick={() => switchTab('more')}>
			<Icon name="more" size={21} />
			<span class="tab__label">More</span>
		</button>
	</nav>

	<main id="vault-main" tabindex="-1">
		{#if activeTab === 'home'}
			<section class="between">
				<div class="section__title">
					<p class="eyebrow">Shared with {otherName}</p>
					<h2 class="h1">Hi {ownFirst}.</h2>
				</div>
			</section>

			<section class="hero" class:hero--negative={balance < 0}>
				<p class="hero__label">Available balance</p>
				<p class="hero__value num">{formatPaise(Math.abs(balance))}</p>
				<p class="hero__note">
					{balance < 0 ? 'Expenses are above recorded payments' : 'Payments received minus expenses paid'}
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
				<button class="quick__primary" type="button" onclick={() => openPaymentComposer()}>
					<span class="quick__icon" aria-hidden="true"><Icon name="money-in" size={21} /></span>
					<span class="quick__text"><strong>Record a payment</strong><small>Money received for your work</small></span>
					<Icon name="arrow-right" size={19} />
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

			<section class="section">
				<div class="section__head">
					<div class="section__title">
						<p class="eyebrow">Work in progress</p>
						<h2 class="h2">Your projects</h2>
					</div>
					{#if $vaultData.projects.length}
						<button class="btn btn--quiet btn--sm" type="button" onclick={() => switchTab('projects')}>See all</button>
					{/if}
				</div>

				{#if $vaultData.projects.length}
					<div class="list">
						{#each $vaultData.projects.slice(0, 3) as project (project.id)}
							{@const paid = paidByProject[project.id] ?? 0}
							{@const covered = project.estimatedPaise > 0 && paid >= project.estimatedPaise}
							<article class="row row--flat">
								<span class="row__icon" class:row__icon--in={covered || project.status === 'done'} aria-hidden="true"><Icon name="target" size={19} /></span>
								<div class="row__body">
									<p class="row__title">{project.name}</p>
									<p class="row__meta">{project.clientName}</p>
									<Progress value={paid} max={project.estimatedPaise} label={`${formatPaise(paid)} received of ${formatPaise(project.estimatedPaise)}`} />
									<p class="tiny num">{formatPaise(paid)} received of {formatPaise(project.estimatedPaise)}</p>
									{#if !covered && project.estimatedPaise > 0}
										<p class="project-remaining num">{formatPaise(Math.max(0, project.estimatedPaise - paid))} still to collect</p>
									{/if}
								</div>
								<div class="row__side">
									{#if covered || project.status === 'done'}
										<span class="badge">Complete</span>
									{:else}
										<span class="badge badge--soft">Active</span>
									{/if}
								</div>
							</article>
						{/each}
					</div>
				{:else}
					<EmptyState icon="target" title="No projects yet" message="Add a project with an estimated price. When payments reach it, Vault marks the project complete."><button class="btn btn--primary btn--sm" type="button" onclick={() => openProjectComposer()}>Add a project</button></EmptyState>
				{/if}
			</section>

			<section class="section">
				<div class="section__head">
					<div class="section__title">
						<p class="eyebrow">Who handled what</p>
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
						<p class="eyebrow">Recent activity</p>
						<h2 class="h2">Latest changes</h2>
					</div>
					{#if $vaultData.mutations.length}
						<button class="btn btn--quiet btn--sm" type="button" onclick={() => switchTab('more')}>See all</button>
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
									<p class="row__title">{mutation.summary}</p>
									<p class="row__meta">{mutation.actorEmail} · {formatDateTime(mutation.createdAt)}</p>
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
		{:else if activeTab === 'clients'}
			<section class="section__head">
				<div class="section__title">
					<p class="eyebrow">Client list</p>
					<h2 class="h1">Clients</h2>
					<p class="lead">Payments are linked to a client, so income stays traceable.</p>
				</div>
				<button class="btn btn--primary btn--sm" type="button" onclick={() => openClientComposer()}>
					<Icon name="plus" size={17} /> Add
				</button>
			</section>

			<div class="between">
				<ChipGroup label="Which clients to show" options={[{ value: 'active', label: `Active · ${activeClients.length}` }, { value: 'all', label: `All · ${$vaultData.clients.length}` }]} value={clientFilter} onChange={(value) => (clientFilter = value as 'active' | 'all')} />
			</div>

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
		{:else if activeTab === 'projects'}
			<section class="section__head">
				<div class="section__title">
					<p class="eyebrow">Projects</p>
					<h2 class="h1">Projects</h2>
					<p class="lead">Each project has an estimated price. Payments against it show how close it is to done.</p>
				</div>
				<button class="btn btn--primary btn--sm" type="button" onclick={() => openProjectComposer()}>
					<Icon name="plus" size={17} /> Add
				</button>
			</section>

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
						{@const covered = project.estimatedPaise > 0 && paid >= project.estimatedPaise}
						<article class="row">
							<span class="row__icon" class:row__icon--in={covered || project.status === 'done'} aria-hidden="true"><Icon name="target" size={19} /></span>
							<div class="row__body">
								<p class="row__title">{project.name}</p>
								<p class="row__meta">{project.clientName} · estimated {formatPaise(project.estimatedPaise)}</p>
								<Progress value={paid} max={project.estimatedPaise} label={`${formatPaise(paid)} received of ${formatPaise(project.estimatedPaise)}`} />
								<p class="tiny num">{formatPaise(paid)} received of {formatPaise(project.estimatedPaise)}</p>
								{#if project.estimatedPaise > 0 && !covered}
									<p class="project-remaining num">{formatPaise(Math.max(0, project.estimatedPaise - paid))} still to collect</p>
								{/if}
								<div class="project-actions">
									{#if !covered}
										<button class="btn btn--outline btn--sm" type="button" onclick={() => openPaymentComposer(null, project)}><Icon name="plus" size={16} /> Add payment</button>
									{/if}
									{#if paymentCount > 0}
										<button class="btn btn--quiet btn--sm" type="button" onclick={() => viewProjectPayments(project)}>View {paymentCount} payment{paymentCount === 1 ? '' : 's'}</button>
									{/if}
								</div>
								{#if project.note}<p class="row__note">{project.note}</p>{/if}
								<p class="tiny">Last edited by {project.updatedBy} · {formatDateTime(project.updatedAt)}</p>
							</div>
							<div class="row__side">
								{#if covered || project.status === 'done'}
									<span class="badge">Complete</span>
								{:else}
									<span class="badge badge--soft">Active</span>
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
		{:else if activeTab === 'payments'}
			<section class="section__head">
				<div class="section__title">
					<p class="eyebrow">Money in</p>
					<h2 class="h1">Payments</h2>
					<p class="lead">
						{formatPaise(vault.totals.earned)} received across {$vaultData.payments.length} payment{$vaultData.payments.length === 1 ? '' : 's'}.
					</p>
				</div>
				<button class="btn btn--primary btn--sm" type="button" onclick={() => openPaymentComposer()}>
					<Icon name="plus" size={17} /> Add
				</button>
			</section>

			{#if paymentProjectFilter}
				<div class="payment-filter" role="status">
					<span>Payments for <strong>{paymentProjectFilter.name}</strong></span>
					<button class="btn btn--quiet btn--sm" type="button" onclick={() => (paymentProjectFilter = null)}>Show all payments</button>
				</div>
			{/if}

			{#if $vaultData.payments.length > 4}
				<label class="search mt-14">
					<Icon name="search" size={18} />
					<input bind:value={query} type="search" placeholder="Search payments" aria-label="Search payments" />
				</label>
			{/if}

			{#if filteredPayments.length}
				<div class="list">
					{#each filteredPayments as payment (payment.id)}
						<article class="row">
							<span class="row__icon" aria-hidden="true"><Icon name="money-in" size={19} /></span>
							<div class="row__body">
								<p class="row__title">{payment.clientName}</p>
								<p class="row__meta">
									{formatRelativeDate(payment.occurredOn)} · received by {partnerName(payment.partner)}{payment.projectName ? ` · ${payment.projectName}` : ''}
								</p>
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
			{:else}
				<EmptyState icon="money-in" title="No payments recorded" message="Record what a client paid, and the shared balance updates for both of you instantly."><button class="btn btn--primary btn--sm" type="button" onclick={() => openPaymentComposer()}>Record payment</button></EmptyState>
			{/if}
		{:else if activeTab === 'expenses'}
			<section class="section__head">
				<div class="section__title">
					<p class="eyebrow">Money out</p>
					<h2 class="h1">Expenses</h2>
					<p class="lead">
						{formatPaise(vault.totals.spent)} tracked across {$vaultData.expenses.length} expense{$vaultData.expenses.length === 1 ? '' : 's'}.
					</p>
				</div>
				<button class="btn btn--primary btn--sm" type="button" onclick={() => openExpenseComposer()}>
					<Icon name="plus" size={17} /> Add
				</button>
			</section>

			{#if $vaultData.expenses.length > 4}
				<label class="search mt-14">
					<Icon name="search" size={18} />
					<input bind:value={query} type="search" placeholder="Search expenses" aria-label="Search expenses" />
				</label>
			{/if}

			{#if filteredExpenses.length}
				<div class="list">
					{#each filteredExpenses as expense (expense.id)}
						<article class="row">
							<span class="row__icon row__icon--out" aria-hidden="true"><Icon name="money-out" size={19} /></span>
							<div class="row__body">
								<p class="row__title">{expense.tags.join(' · ')}</p>
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
			{:else}
				<EmptyState icon="money-out" title="No expenses recorded" message="Track what either of you paid out, so the profit split stays honest."><button class="btn btn--primary btn--sm" type="button" onclick={() => openExpenseComposer()}>Add expense</button></EmptyState>
			{/if}
		{:else}
			<section class="section__head">
				<div class="section__title">
					<p class="eyebrow">Vault</p>
					<h2 class="h1">More</h2>
				</div>
			</section>

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
										<p class="row__title">{mutation.summary}</p>
										<p class="row__meta">{mutation.actorEmail} · {formatDateTime(mutation.createdAt)}</p>
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
					<div class="list">
						<article class="settings-row">
							<span>Vault</span>
							<strong>{vault.name}</strong>
							<small>Created {formatDateTime(vault.createdAt)}</small>
						</article>
						<article class="settings-row">
							<span>Partner A</span>
							<strong>{vault.members.a.name}{ownPartner === 'a' ? ' (you)' : ''}</strong>
							<small>{vault.members.a.email}</small>
						</article>
						<article class="settings-row">
							<span>Partner B</span>
							<strong>{vault.members.b.name}{ownPartner === 'b' ? ' (you)' : ''}</strong>
							<small>{vault.members.b.email}</small>
						</article>
						<article class="settings-row">
							<span>Spending tags</span>
							<strong>{vault.tags.length} tags</strong>
							<small>Shown when you add an expense. Add the things you usually spend on — both of you share this list.</small>
						</article>
						<div class="tag-block">
							<div class="chips" aria-label="Common spending tags">
								{#each vault.tags as tag (tag)}
									<span class="chip chip--on chip--tag">
										<Icon name="tag" size={15} /> {tag}
										<button class="chip__x" type="button" aria-label={`Remove ${tag} tag`} disabled={actionBusy} onclick={() => removeCommonTag(tag)}>
											<Icon name="close" size={13} />
										</button>
									</span>
								{/each}
							</div>
							<form class="tag-add" onsubmit={(event) => addCommonTag(event)}>
								<input class="input" bind:value={tagDraft} maxlength="40" placeholder="New tag, e.g. Hosting" aria-label="New spending tag" disabled={actionBusy} />
								<button class="btn btn--outline btn--sm" type="submit" disabled={actionBusy || !tagDraft.trim()}>Add tag</button>
							</form>
							<p class="tiny">Tags stay on past expenses even after you remove them from this list.</p>
						</div>
						<article class="settings-row settings-row--note">
							<span>This device</span>
							<strong>Offline copy is on</strong>
							<small>Vault data stays cached in this browser so it opens without a network. Sign out on a device you do not control.</small>
						</article>
					</div>

					<button class="btn btn--danger btn--block mt-14" type="button" disabled={actionBusy} onclick={() => void onSignOut()}>
						<Icon name="sign-out" size={18} /> Sign out of Vault
					</button>
					<p class="tiny mt-10">
						Signed in as {user.email}. Signing out keeps the records safe in the cloud.
					</p>
				{/if}
			</section>
		{/if}
	</main>
</div>

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
					<button class="btn btn--primary btn--block" type="submit" disabled={actionBusy}>
						{actionBusy ? 'Saving…' : editingClient ? 'Save client' : 'Add client'}
					</button>
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
							<ChipGroup label="Client" options={paymentClientOptions} value={paymentClientId} disabled={actionBusy} onChange={choosePaymentClient} />
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

						<button class="btn btn--primary btn--block" type="submit" disabled={actionBusy}>
							{actionBusy ? 'Saving…' : editingPayment ? 'Save payment' : 'Record payment'}
						</button>
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
							<ChipGroup label="Client for this project" options={activeClients.map((client) => ({ value: client.id, label: client.name }))} value={projectClientId} disabled={actionBusy} onChange={(value) => (projectClientId = value)} />
						</div>

						<div class="field">
							<span class="field__label">Estimated price</span>
							<label class="amount-field">
								<span class="amount-field__sign" aria-hidden="true">₹</span>
								<input bind:value={projectEstimate} inputmode="decimal" autocomplete="off" placeholder="0" aria-label="Estimated price in rupees" required disabled={actionBusy} />
							</label>
							<p class="hint">Record each installment as it arrives. Vault adds them up and marks the project complete when the received total reaches this estimate.</p>
						</div>

						<label class="field">
							<span class="field__label">Note <em class="field__optional">optional</em></span>
							<textarea class="textarea" bind:value={projectNote} maxlength="1000" rows="3" placeholder="Scope, milestones or what is left" disabled={actionBusy}></textarea>
						</label>

						{#if editingProject}
							<p class="tiny">Last edited by {editingProject.updatedBy} · {formatDateTime(editingProject.updatedAt)}</p>
						{/if}

						<button class="btn btn--primary btn--block" type="submit" disabled={actionBusy}>
							{actionBusy ? 'Saving…' : editingProject ? 'Save project' : 'Add project'}
						</button>
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
						<ChipGroup label="Spending tags" options={tagOptions.map((tag) => ({ value: tag, label: tag }))} multiple values={expenseTags} maxSelected={MAX_EXPENSE_TAGS} disabled={actionBusy} onChange={toggleExpenseTag} />
						<p class="hint" role="status">{expenseTags.length} of {MAX_EXPENSE_TAGS} tags selected. {expenseTags.length === MAX_EXPENSE_TAGS ? 'Remove one to choose another.' : 'Choose at least one. Add more tags in More → Settings.'}</p>
					</div>

					<div class="field">
						<span class="field__label">Paid by</span>
						<ChipGroup label="Paid by" options={partnerOptions} value={expensePartner} disabled={actionBusy} onChange={(value) => (expensePartner = value as PartnerKey)} />
					</div>

					{#if activeClients.length}
						<div class="field">
							<span class="field__label">For a client <em class="field__optional">optional</em></span>
							<ChipGroup label="Client for this expense" options={expenseClientOptions} value={expenseClientId} disabled={actionBusy} onChange={(value) => (expenseClientId = value)} />
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

					<button class="btn btn--primary btn--block" type="submit" disabled={actionBusy || expenseTags.length === 0}>
						{actionBusy ? 'Saving…' : editingExpense ? 'Save expense' : 'Add expense'}
					</button>
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
