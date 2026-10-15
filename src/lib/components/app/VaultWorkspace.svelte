<script lang="ts">
	import type { User } from 'firebase/auth';

	import Icon from '$lib/components/ui/Icon.svelte';
	import {
		createClient,
		createExpense,
		createPayment,
		deleteExpense,
		deletePayment,
		setClientArchived,
		updateClient,
		updateExpense,
		updatePayment,
		vaultDataErrorMessage
	} from '$lib/services/vault-data';
	import { vaultData } from '$lib/stores/vault-data';
	import type {
		ClientRecord,
		ExpenseRecord,
		PartnerKey,
		PaymentRecord,
		VaultMutation,
		VaultSummary
	} from '$lib/types/vault';
	import { expenseCategories } from '$lib/types/vault';
	import {
		formatDateKey,
		formatDateTime,
		formatRelativeDate,
		todayDateKey,
		yesterdayDateKey
	} from '$lib/utils/dates';
	import { formatPaise, formatPaiseInput, netPaise, parseMoneyToPaise } from '$lib/utils/money';

	type MainTab = 'home' | 'clients' | 'payments' | 'expenses' | 'more';
	type Composer = 'none' | 'client' | 'payment' | 'expense';
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

	let editingExpense: ExpenseRecord | null = null;
	let expenseClientId = '';
	let expenseAmount = '';
	let expensePartner: PartnerKey = 'a';
	let expenseCategory: (typeof expenseCategories)[number] = expenseCategories[0];
	let expenseDate = todayDateKey();
	let expenseDateMode: DateMode = 'today';
	let expenseNote = '';

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

	$: categoryOptions = expenseCategories.map((category) => ({ value: category, label: category }));

	$: paymentClientOptions = activeClients.map((client) => ({ value: client.id, label: client.name }));

	$: expenseClientOptions = [
		{ value: '', label: 'No client' },
		...activeClients.map((client) => ({ value: client.id, label: client.name }))
	];

	$: needle = query.trim().toLowerCase();
	$: filteredClients = needle ? shownClients.filter((client) => matches(needle, client.name, client.contact, client.notes)) : shownClients;
	$: filteredPayments = needle
		? $vaultData.payments.filter((payment) =>
				matches(needle, payment.clientName, payment.note, partnerName(payment.partner), formatPaise(payment.amountPaise))
			)
		: $vaultData.payments;
	$: filteredExpenses = needle
		? $vaultData.expenses.filter((expense) =>
				matches(needle, expense.category, expense.clientName, expense.note, partnerName(expense.partner), formatPaise(expense.amountPaise))
			)
		: $vaultData.expenses;

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
	}

	function openClientComposer(client: ClientRecord | null = null): void {
		actionError = null;
		editingClient = client;
		clientName = client?.name ?? '';
		clientContact = client?.contact ?? '';
		clientNotes = client?.notes ?? '';
		composer = 'client';
	}

	function openPaymentComposer(payment: PaymentRecord | null = null): void {
		actionError = null;

		if (!payment && activeClients.length === 0) {
			say('Add a client first — every payment is linked to one.', 'error');
			switchTab('clients');
			openClientComposer();
			return;
		}

		editingPayment = payment;
		paymentClientId = payment?.clientId ?? activeClients[0]?.id ?? '';
		paymentAmount = payment ? formatPaiseInput(payment.amountPaise) : '';
		paymentPartner = payment?.partner ?? ownPartner;
		paymentDate = payment?.occurredOn ?? todayDateKey();
		paymentDateMode = dateModeFor(paymentDate);
		paymentNote = payment?.note ?? '';
		composer = 'payment';
	}

	function openExpenseComposer(expense: ExpenseRecord | null = null): void {
		actionError = null;
		editingExpense = expense;
		expenseClientId = expense?.clientId ?? '';
		expenseAmount = expense ? formatPaiseInput(expense.amountPaise) : '';
		expensePartner = expense?.partner ?? ownPartner;
		expenseCategory = expense?.category ?? expenseCategories[0];
		expenseDate = expense?.occurredOn ?? todayDateKey();
		expenseDateMode = dateModeFor(expenseDate);
		expenseNote = expense?.note ?? '';
		composer = 'expense';
	}

	function closeComposer(): void {
		composer = 'none';
		actionError = null;
	}

	function closeOverlays(): void {
		if (confirmation) {
			confirmation = null;
			return;
		}

		closeComposer();
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

			const input = {
				clientId: selectedPaymentClient.id,
				clientName: selectedPaymentClient.name,
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
				category: expenseCategory,
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
			message: `${formatPaise(expense.amountPaise)} for ${expense.category} will be removed from the balance and history.`,
			confirmLabel: 'Delete expense',
			run: () => deleteExpense(vault, expense, user.email ?? '')
		};
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

<svelte:window
	onkeydown={(event) => {
		if (event.key === 'Escape') {
			closeOverlays();
		}
	}}
/>

<div class="shell">
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
				<span class="status status--offline"><span class="status__dot" aria-hidden="true"></span>Offline</span>
			{:else if isSyncing}
				<span class="status"><span class="status__dot" aria-hidden="true"></span>Saving</span>
			{:else}
				<span class="status status--live"><span class="status__dot" aria-hidden="true"></span>Synced</span>
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

	<main>
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
				<dl class="hero__split">
					<div>
						<dt>Money in</dt>
						<dd class="num">{formatPaise(vault.totals.earned)}</dd>
					</div>
					<div>
						<dt>Money out</dt>
						<dd class="num">{formatPaise(vault.totals.spent)}</dd>
					</div>
				</dl>
			</section>

			<section class="quick" aria-label="Add something new">
				<button class="quick__btn" type="button" onclick={() => openPaymentComposer()}>
					<span class="quick__icon" aria-hidden="true"><Icon name="money-in" size={19} /></span>
					Record payment
				</button>
				<button class="quick__btn" type="button" onclick={() => openExpenseComposer()}>
					<span class="quick__icon quick__icon--out" aria-hidden="true"><Icon name="money-out" size={19} /></span>
					Add expense
				</button>
				<button class="quick__btn" type="button" onclick={() => openClientComposer()}>
					<span class="quick__icon" aria-hidden="true"><Icon name="plus" size={19} /></span>
					New client
				</button>
			</section>

			<section class="section">
				<div class="section__head">
					<div class="section__title">
						<p class="eyebrow">Who handled what</p>
						<h2 class="h2">Split by partner</h2>
					</div>
				</div>
				<div class="grid-2">
					<article class="partner">
						<div class="partner__head">
							<span class="avatar" aria-hidden="true">{initial(vault.members.a.name)}</span>
							<span class="partner__name">{vault.members.a.name}</span>
						</div>
						<dl class="partner__figures">
							<div>
								<dt>Received</dt>
								<dd class="num">{formatPaise(vault.totals.a.received)}</dd>
							</div>
							<div>
								<dt>Spent</dt>
								<dd class="num">{formatPaise(vault.totals.a.spent)}</dd>
							</div>
						</dl>
					</article>
					<article class="partner">
						<div class="partner__head">
							<span class="avatar avatar--b" aria-hidden="true">{initial(vault.members.b.name)}</span>
							<span class="partner__name">{vault.members.b.name}</span>
						</div>
						<dl class="partner__figures">
							<div>
								<dt>Received</dt>
								<dd class="num">{formatPaise(vault.totals.b.received)}</dd>
							</div>
							<div>
								<dt>Spent</dt>
								<dd class="num">{formatPaise(vault.totals.b.spent)}</dd>
							</div>
						</dl>
					</article>
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
					<div class="empty">
						<span class="empty__icon" aria-hidden="true"><Icon name="history" size={22} /></span>
						<h3 class="h3">Nothing recorded yet</h3>
						<p>Every payment and expense you add shows up here, so you both always know what changed.</p>
						<button class="btn btn--primary btn--sm" type="button" onclick={() => openPaymentComposer()}>Record the first payment</button>
					</div>
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
				<div class="chips" role="radiogroup" aria-label="Which clients to show">
					<button class="chip" class:chip--on={clientFilter === 'active'} type="button" role="radio" aria-checked={clientFilter === 'active'} onclick={() => (clientFilter = 'active')}>
						Active · {activeClients.length}
					</button>
					<button class="chip" class:chip--on={clientFilter === 'all'} type="button" role="radio" aria-checked={clientFilter === 'all'} onclick={() => (clientFilter = 'all')}>
						All · {$vaultData.clients.length}
					</button>
				</div>
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
					<div class="empty">
						<span class="empty__icon" aria-hidden="true"><Icon name="search" size={22} /></span>
						<h3 class="h3">No clients match “{query}”</h3>
						<button class="btn btn--outline btn--sm" type="button" onclick={() => (query = '')}>Clear search</button>
					</div>
				{:else}
					<div class="empty">
						<span class="empty__icon" aria-hidden="true"><Icon name="clients" size={22} /></span>
						<h3 class="h3">No clients yet</h3>
						<p>Add the people or companies who pay you. You can record a payment as soon as one exists.</p>
						<button class="btn btn--primary btn--sm" type="button" onclick={() => openClientComposer()}>Add your first client</button>
					</div>
				{/if}
			</section>
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
								<p class="row__meta">{formatRelativeDate(payment.occurredOn)} · received by {partnerName(payment.partner)}</p>
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
				<div class="empty">
					<span class="empty__icon" aria-hidden="true"><Icon name="search" size={22} /></span>
					<h3 class="h3">No payments match “{query}”</h3>
					<button class="btn btn--outline btn--sm" type="button" onclick={() => (query = '')}>Clear search</button>
				</div>
			{:else}
				<div class="empty">
					<span class="empty__icon" aria-hidden="true"><Icon name="money-in" size={22} /></span>
					<h3 class="h3">No payments recorded</h3>
					<p>Record what a client paid, and the shared balance updates for both of you instantly.</p>
					<button class="btn btn--primary btn--sm" type="button" onclick={() => openPaymentComposer()}>Record payment</button>
				</div>
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
								<p class="row__title">{expense.category}</p>
								<p class="row__meta">
									{formatRelativeDate(expense.occurredOn)} · paid by {partnerName(expense.partner)}{expense.clientName ? ` · ${expense.clientName}` : ''}
								</p>
								{#if expense.note}<p class="row__note">{expense.note}</p>{/if}
							</div>
							<div class="row__side">
								<span class="row__amount row__amount--out num">−{formatPaise(expense.amountPaise)}</span>
								<div class="row__tools">
									<button class="tool" type="button" onclick={() => openExpenseComposer(expense)} aria-label={`Edit ${expense.category} expense`}>
										<Icon name="pencil" size={16} />
									</button>
									<button class="tool tool--danger" type="button" onclick={() => removeExpense(expense)} aria-label={`Delete ${expense.category} expense`}>
										<Icon name="trash" size={16} />
									</button>
								</div>
							</div>
						</article>
					{/each}
				</div>
			{:else if needle}
				<div class="empty">
					<span class="empty__icon" aria-hidden="true"><Icon name="search" size={22} /></span>
					<h3 class="h3">No expenses match “{query}”</h3>
					<button class="btn btn--outline btn--sm" type="button" onclick={() => (query = '')}>Clear search</button>
				</div>
			{:else}
				<div class="empty">
					<span class="empty__icon" aria-hidden="true"><Icon name="money-out" size={22} /></span>
					<h3 class="h3">No expenses recorded</h3>
					<p>Track what either of you paid out, so the profit split stays honest.</p>
					<button class="btn btn--primary btn--sm" type="button" onclick={() => openExpenseComposer()}>Add expense</button>
				</div>
			{/if}
		{:else}
			<section class="section__head">
				<div class="section__title">
					<p class="eyebrow">Vault</p>
					<h2 class="h1">More</h2>
				</div>
			</section>

			<div class="chips" role="radiogroup" aria-label="More sections">
				<button class="chip" class:chip--on={morePanel === 'history'} type="button" role="radio" aria-checked={morePanel === 'history'} onclick={() => (morePanel = 'history')}>
					<Icon name="history" size={17} /> History
				</button>
				<button class="chip" class:chip--on={morePanel === 'settings'} type="button" role="radio" aria-checked={morePanel === 'settings'} onclick={() => (morePanel = 'settings')}>
					<Icon name="info" size={17} /> Settings
				</button>
			</div>

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
						<div class="empty">
							<span class="empty__icon" aria-hidden="true"><Icon name="history" size={22} /></span>
							<h3 class="h3">No history yet</h3>
							<p>Every change is logged with who made it and when, so nothing is a mystery later.</p>
						</div>
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
	<button class="backdrop" type="button" aria-label="Close form" onclick={closeComposer}></button>

	<dialog open class="sheet" aria-labelledby="composer-title">
		<header class="sheet__head">
			<div>
				<p class="eyebrow">
					{composer === 'client' ? 'Client' : composer === 'payment' ? 'Money in' : 'Money out'}
				</p>
				<h2 class="h2" id="composer-title">
					{composer === 'client'
						? editingClient
							? 'Edit client'
							: 'New client'
						: composer === 'payment'
							? editingPayment
								? 'Edit payment'
								: 'Record a payment'
							: editingExpense
								? 'Edit expense'
								: 'Add an expense'}
				</h2>
			</div>
			<button class="icon-btn" type="button" aria-label="Close form" disabled={actionBusy} onclick={closeComposer}>
				<Icon name="close" size={20} />
			</button>
		</header>

		<div class="sheet__body">
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
					<div class="empty">
						<span class="empty__icon" aria-hidden="true"><Icon name="clients" size={22} /></span>
						<h3 class="h3">Add a client first</h3>
						<p>A payment has to be linked to the client who paid it.</p>
						<button class="btn btn--primary btn--sm" type="button" onclick={() => openClientComposer()}>Add a client</button>
					</div>
				{:else}
					<form class="form" onsubmit={(event) => void savePayment(event)}>
						<div class="field">
							<span class="field__label">Amount received</span>
							<label class="amount-field">
								<span class="amount-field__sign" aria-hidden="true">₹</span>
								<input bind:value={paymentAmount} inputmode="decimal" autocomplete="off" placeholder="0" aria-label="Amount received in rupees" required disabled={actionBusy} />
							</label>
						</div>

						<div class="field">
							<span class="field__label">Client</span>
							<div class="chips" role="radiogroup" aria-label="Client">
								{#each paymentClientOptions as option (option.value)}
									<button class="chip" class:chip--on={paymentClientId === option.value} type="button" role="radio" aria-checked={paymentClientId === option.value} disabled={actionBusy} onclick={() => (paymentClientId = option.value)}>
										{option.label}
									</button>
								{/each}
							</div>
						</div>

						<div class="field">
							<span class="field__label">Received by</span>
							<div class="chips" role="radiogroup" aria-label="Received by">
								{#each partnerOptions as option (option.value)}
									<button class="chip" class:chip--on={paymentPartner === option.value} type="button" role="radio" aria-checked={paymentPartner === option.value} disabled={actionBusy} onclick={() => (paymentPartner = option.value as PartnerKey)}>
										<span class="chip__dot" aria-hidden="true">{option.initial}</span>
										{option.label}
									</button>
								{/each}
							</div>
						</div>

						<div class="field">
							<span class="field__label">Date</span>
							<div class="chips" role="radiogroup" aria-label="Payment date">
								<button class="chip" class:chip--on={paymentDateMode === 'today'} type="button" role="radio" aria-checked={paymentDateMode === 'today'} disabled={actionBusy} onclick={() => pickDate('today', 'payment')}>Today</button>
								<button class="chip" class:chip--on={paymentDateMode === 'yesterday'} type="button" role="radio" aria-checked={paymentDateMode === 'yesterday'} disabled={actionBusy} onclick={() => pickDate('yesterday', 'payment')}>Yesterday</button>
								<button class="chip" class:chip--on={paymentDateMode === 'custom'} type="button" role="radio" aria-checked={paymentDateMode === 'custom'} disabled={actionBusy} onclick={() => pickDate('custom', 'payment')}>Another day</button>
							</div>
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
						<div class="chips" role="radiogroup" aria-label="Expense category">
							{#each categoryOptions as option (option.value)}
								<button class="chip" class:chip--on={expenseCategory === option.value} type="button" role="radio" aria-checked={expenseCategory === option.value} disabled={actionBusy} onclick={() => (expenseCategory = option.value as (typeof expenseCategories)[number])}>
									{option.label}
								</button>
							{/each}
						</div>
					</div>

					<div class="field">
						<span class="field__label">Paid by</span>
						<div class="chips" role="radiogroup" aria-label="Paid by">
							{#each partnerOptions as option (option.value)}
								<button class="chip" class:chip--on={expensePartner === option.value} type="button" role="radio" aria-checked={expensePartner === option.value} disabled={actionBusy} onclick={() => (expensePartner = option.value as PartnerKey)}>
									<span class="chip__dot" aria-hidden="true">{option.initial}</span>
									{option.label}
								</button>
							{/each}
						</div>
					</div>

					{#if activeClients.length}
						<div class="field">
							<span class="field__label">For a client <em class="field__optional">optional</em></span>
							<div class="chips" role="radiogroup" aria-label="Client for this expense">
								{#each expenseClientOptions as option (option.value)}
									<button class="chip" class:chip--on={expenseClientId === option.value} type="button" role="radio" aria-checked={expenseClientId === option.value} disabled={actionBusy} onclick={() => (expenseClientId = option.value)}>
										{option.label}
									</button>
								{/each}
							</div>
						</div>
					{/if}

					<div class="field">
						<span class="field__label">Date</span>
						<div class="chips" role="radiogroup" aria-label="Expense date">
							<button class="chip" class:chip--on={expenseDateMode === 'today'} type="button" role="radio" aria-checked={expenseDateMode === 'today'} disabled={actionBusy} onclick={() => pickDate('today', 'expense')}>Today</button>
							<button class="chip" class:chip--on={expenseDateMode === 'yesterday'} type="button" role="radio" aria-checked={expenseDateMode === 'yesterday'} disabled={actionBusy} onclick={() => pickDate('yesterday', 'expense')}>Yesterday</button>
							<button class="chip" class:chip--on={expenseDateMode === 'custom'} type="button" role="radio" aria-checked={expenseDateMode === 'custom'} disabled={actionBusy} onclick={() => pickDate('custom', 'expense')}>Another day</button>
						</div>
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

					<button class="btn btn--primary btn--block" type="submit" disabled={actionBusy}>
						{actionBusy ? 'Saving…' : editingExpense ? 'Save expense' : 'Add expense'}
					</button>
				</form>
			{/if}

			{#if actionError}
				<p class="notice notice--error" role="alert">{actionError}</p>
			{/if}
		</div>
	</dialog>
{/if}

{#if confirmation}
	<button class="backdrop" type="button" aria-label="Cancel" onclick={() => (confirmation = null)}></button>
	<dialog open class="sheet sheet--dialog" aria-labelledby="confirm-title">
		<header class="sheet__head">
			<h2 class="h2" id="confirm-title">{confirmation.title}</h2>
		</header>
		<div class="sheet__body">
			<p class="lead">{confirmation.message}</p>
			<div class="grid-2">
				<button class="btn btn--outline" type="button" disabled={actionBusy} onclick={() => (confirmation = null)}>Keep it</button>
				<button class="btn btn--danger" type="button" disabled={actionBusy} onclick={() => void confirmAction()}>
					{actionBusy ? 'Working…' : confirmation.confirmLabel}
				</button>
			</div>
		</div>
	</dialog>
{/if}

{#if toast}
	<p class="toast" class:toast--ok={toast.tone === 'ok'} class:toast--error={toast.tone === 'error'} role={toast.tone === 'error' ? 'alert' : 'status'}>
		<span class="toast__icon" aria-hidden="true"><Icon name={toast.tone === 'error' ? 'warning' : 'check'} size={18} /></span>
		<span>{toast.text}</span>
		<button class="toast__close" type="button" aria-label="Dismiss message" onclick={dismissToast}>
			<Icon name="close" size={16} />
		</button>
	</p>
{/if}
