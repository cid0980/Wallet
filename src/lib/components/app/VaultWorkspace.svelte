<script lang="ts">
	import type { User } from 'firebase/auth';

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
	import { formatDateKey, formatDateTime, formatRelativeDate, todayDateKey } from '$lib/utils/dates';
	import { formatPaise, formatPaiseInput, netPaise, parseMoneyToPaise } from '$lib/utils/money';

	type MainTab = 'home' | 'clients' | 'payments' | 'expenses' | 'more';
	type Composer = 'none' | 'client' | 'payment' | 'expense';
	type MorePanel = 'history' | 'settings';

	export let vault: VaultSummary;
	export let user: User;
	export let onSignOut: () => Promise<void> | void;

	let activeTab: MainTab = 'home';
	let morePanel: MorePanel = 'history';
	let composer: Composer = 'none';
	let actionBusy = false;
	let actionError: string | null = null;
	let showArchivedClients = false;

	let editingClient: ClientRecord | null = null;
	let clientName = '';
	let clientContact = '';
	let clientNotes = '';

	let editingPayment: PaymentRecord | null = null;
	let paymentClientId = '';
	let paymentAmount = '';
	let paymentPartner: PartnerKey = 'a';
	let paymentDate = todayDateKey();
	let paymentNote = '';

	let editingExpense: ExpenseRecord | null = null;
	let expenseClientId = '';
	let expenseAmount = '';
	let expensePartner: PartnerKey = 'a';
	let expenseCategory: (typeof expenseCategories)[number] = expenseCategories[0];
	let ownPartner: PartnerKey = 'a';
	let expenseDate = todayDateKey();
	let expenseNote = '';

	$: activeClients = $vaultData.clients.filter((client) => !client.isArchived);
	$: shownClients = showArchivedClients ? $vaultData.clients : activeClients;
	$: balance = netPaise(vault.totals);
	$: ownPartner = user.email === vault.members.b.email ? 'b' : 'a';
	$: selectedPaymentClient = activeClients.find((client) => client.id === paymentClientId) ?? null;
	$: selectedExpenseClient = activeClients.find((client) => client.id === expenseClientId) ?? null;
	$: isSyncing = vault.pendingWrites || $vaultData.pendingWrites;
	$: isOffline = vault.fromCache && $vaultData.fromCache;

	function openClientComposer(client: ClientRecord | null = null): void {
		actionError = null;
		editingClient = client;
		clientName = client?.name ?? '';
		clientContact = client?.contact ?? '';
		clientNotes = client?.notes ?? '';
		composer = 'client';
	}

	function openPaymentComposer(payment: PaymentRecord | null = null): void {
		if (!payment && activeClients.length === 0) {
			actionError = 'Add a client before recording a payment.';
			activeTab = 'clients';
			openClientComposer();
			return;
		}

		actionError = null;
		editingPayment = payment;
		paymentClientId = payment?.clientId ?? activeClients[0]?.id ?? '';
		paymentAmount = payment ? formatPaiseInput(payment.amountPaise) : '';
		paymentPartner = payment?.partner ?? ownPartner;
		paymentDate = payment?.occurredOn ?? todayDateKey();
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
		expenseNote = expense?.note ?? '';
		composer = 'expense';
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
			} else {
				await createClient(vault.id, input, user.email ?? '');
			}
			closeComposer();
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
			} else {
				await createPayment(vault, input, user.email ?? '');
			}
			closeComposer();
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
			} else {
				await createExpense(vault, input, user.email ?? '');
			}
			closeComposer();
		});
	}

	async function archiveClient(client: ClientRecord): Promise<void> {
		const action = client.isArchived ? 'restore' : 'archive';
		if (!window.confirm(`Do you want to ${action} ${client.name}? Existing money records will stay unchanged.`)) {
			return;
		}

		await runAction(() => setClientArchived(vault.id, client, !client.isArchived, user.email ?? ''));
	}

	async function removePayment(payment: PaymentRecord): Promise<void> {
		if (!window.confirm(`Remove the ${formatPaise(payment.amountPaise)} payment from ${payment.clientName}?`)) {
			return;
		}

		await runAction(() => deletePayment(vault, payment, user.email ?? ''));
	}

	async function removeExpense(expense: ExpenseRecord): Promise<void> {
		if (!window.confirm(`Remove the ${formatPaise(expense.amountPaise)} expense?`)) {
			return;
		}

		await runAction(() => deleteExpense(vault, expense, user.email ?? ''));
	}

	function switchTab(tab: MainTab): void {
		activeTab = tab;
		composer = 'none';
		actionError = null;
	}

	function mutationAmount(mutation: VaultMutation): { amount: number; direction: 'in' | 'out' } {
		if (mutation.delta.earned !== 0) {
			return { amount: Math.abs(mutation.delta.earned), direction: mutation.delta.earned > 0 ? 'in' : 'out' };
		}

		return { amount: Math.abs(mutation.delta.spent), direction: mutation.delta.spent > 0 ? 'out' : 'in' };
	}
</script>

<div class="workspace">
	<header class="topbar">
		<div class="brand-wrap">
			<div class="brand-mark" aria-hidden="true">V</div>
			<div>
				<p class="overline">SHARED VAULT</p>
				<h1>{vault.name}</h1>
			</div>
		</div>
		<button class="avatar" type="button" aria-label="Open settings" onclick={() => switchTab('more')}>
			{user.displayName?.slice(0, 1).toUpperCase() ?? '•'}
		</button>
	</header>

	{#if isOffline}
		<p class="sync-banner offline" role="status">Offline view — showing encrypted-on-device Firestore cache.</p>
	{:else if isSyncing}
		<p class="sync-banner" role="status">Saving your changes securely…</p>
	{/if}

	<main>
		{#if activeTab === 'home'}
			<section class="welcome">
				<div>
					<p class="eyebrow">LIVE BUSINESS SNAPSHOT</p>
					<h2>Good to see you{user.displayName ? `, ${user.displayName.split(' ')[0]}` : ''}.</h2>
				</div>
				<button class="icon-button" type="button" aria-label="Record a payment" onclick={() => openPaymentComposer()}>
					+
				</button>
			</section>

			<section class:negative={balance < 0} class="balance-card">
				<p>Available balance</p>
				<strong>{formatPaise(Math.abs(balance))}</strong>
				<span>{balance < 0 ? 'Expenses are above recorded payments' : 'Payments minus expenses'}</span>
			</section>

			<section class="stat-grid" aria-label="Vault totals">
				<article class="stat-card income">
					<span class="stat-icon" aria-hidden="true">↗</span>
					<p>Payments received</p>
					<strong>{formatPaise(vault.totals.earned)}</strong>
				</article>
				<article class="stat-card expense">
					<span class="stat-icon" aria-hidden="true">↙</span>
					<p>Expenses paid</p>
					<strong>{formatPaise(vault.totals.spent)}</strong>
				</article>
			</section>

			<section class="section-block">
				<div class="section-heading">
					<div>
						<p class="eyebrow">PARTNER TOTALS</p>
						<h2>Who handled what</h2>
					</div>
				</div>
				<div class="partner-grid">
					<article class="partner-card">
						<div class="person-badge a">{vault.members.a.name.slice(0, 1).toUpperCase()}</div>
						<div>
							<p>{vault.members.a.name}</p>
							<span>Received {formatPaise(vault.totals.a.received)}</span>
							<span>Spent {formatPaise(vault.totals.a.spent)}</span>
						</div>
					</article>
					<article class="partner-card">
						<div class="person-badge b">{vault.members.b.name.slice(0, 1).toUpperCase()}</div>
						<div>
							<p>{vault.members.b.name}</p>
							<span>Received {formatPaise(vault.totals.b.received)}</span>
							<span>Spent {formatPaise(vault.totals.b.spent)}</span>
						</div>
					</article>
				</div>
			</section>

			<section class="section-block">
				<div class="section-heading">
					<div>
						<p class="eyebrow">RECENT ACTIVITY</p>
						<h2>Latest changes</h2>
					</div>
					<button class="link-button" type="button" onclick={() => switchTab('more')}>View all</button>
				</div>
				{#if $vaultData.mutations.length}
					<div class="activity-list">
						{#each $vaultData.mutations.slice(0, 5) as mutation (mutation.id)}
							{@const change = mutationAmount(mutation)}
							<article class="activity-item">
								<div class:out={change.direction === 'out'} class="activity-icon" aria-hidden="true">
									{mutation.recordType === 'payment' ? '₹' : '−'}
								</div>
								<div class="activity-copy">
									<strong>{mutation.summary}</strong>
									<span>{mutation.actorEmail} · {formatDateTime(mutation.createdAt)}</span>
								</div>
								<em class:out={change.direction === 'out'}>{change.direction === 'out' ? '−' : '+'}{formatPaise(change.amount)}</em>
							</article>
						{/each}
					</div>
				{:else}
					<div class="empty-inline">Your payment and expense history will appear here.</div>
				{/if}
			</section>
		{:else if activeTab === 'clients'}
			<section class="page-heading">
				<div>
					<p class="eyebrow">CLIENT DIRECTORY</p>
					<h2>Clients</h2>
					<p>Keep payment records connected to the work they came from.</p>
				</div>
				<button class="primary-action" type="button" onclick={() => openClientComposer()}>Add client</button>
			</section>

			<div class="filter-row">
				<label class="toggle-label">
					<input type="checkbox" bind:checked={showArchivedClients} />
					Show archived
				</label>
				<span>{activeClients.length} active</span>
			</div>

			{#if shownClients.length}
				<div class="records-list">
					{#each shownClients as client (client.id)}
						<article class:archived={client.isArchived} class="record-card client-card">
							<div class="record-main">
								<div class="client-icon" aria-hidden="true">{client.name.slice(0, 1).toUpperCase()}</div>
								<div>
									<strong>{client.name}</strong>
									{#if client.contact}<span>{client.contact}</span>{/if}
									{#if client.notes}<small>{client.notes}</small>{/if}
								</div>
							</div>
							<div class="record-actions">
								<button type="button" onclick={() => openClientComposer(client)}>Edit</button>
								<button type="button" onclick={() => void archiveClient(client)}>{client.isArchived ? 'Restore' : 'Archive'}</button>
							</div>
						</article>
					{/each}
				</div>
			{:else}
				<section class="empty-state">
					<div aria-hidden="true">◎</div>
					<h3>No clients yet</h3>
					<p>Add a client before you record your first payment.</p>
					<button class="primary-action" type="button" onclick={() => openClientComposer()}>Add your first client</button>
				</section>
			{/if}
		{:else if activeTab === 'payments'}
			<section class="page-heading">
				<div>
					<p class="eyebrow">PAYMENTS</p>
					<h2>Money in</h2>
					<p>{formatPaise(vault.totals.earned)} received across {$vaultData.payments.length} payment{$vaultData.payments.length === 1 ? '' : 's'}.</p>
				</div>
				<button class="primary-action" type="button" onclick={() => openPaymentComposer()}>Record payment</button>
			</section>

			{#if $vaultData.payments.length}
				<div class="records-list">
					{#each $vaultData.payments as payment (payment.id)}
						<article class="record-card money-card">
							<div class="record-main">
								<div class="money-symbol in" aria-hidden="true">↗</div>
								<div>
									<strong>{payment.clientName}</strong>
									<span>{formatRelativeDate(payment.occurredOn)} · Received by {payment.partner === 'a' ? vault.members.a.name : vault.members.b.name}</span>
									{#if payment.note}<small>{payment.note}</small>{/if}
								</div>
							</div>
							<div class="amount-wrap in">
								<strong>+{formatPaise(payment.amountPaise)}</strong>
								<div class="record-actions compact">
									<button type="button" onclick={() => openPaymentComposer(payment)}>Edit</button>
									<button class="danger-link" type="button" onclick={() => void removePayment(payment)}>Delete</button>
								</div>
							</div>
						</article>
					{/each}
				</div>
			{:else}
				<section class="empty-state">
					<div aria-hidden="true">↗</div>
					<h3>No payments recorded</h3>
					<p>Record a client payment to update the shared balance.</p>
					<button class="primary-action" type="button" onclick={() => openPaymentComposer()}>Record payment</button>
				</section>
			{/if}
		{:else if activeTab === 'expenses'}
			<section class="page-heading">
				<div>
					<p class="eyebrow">EXPENSES</p>
					<h2>Money out</h2>
					<p>{formatPaise(vault.totals.spent)} tracked across {$vaultData.expenses.length} expense{$vaultData.expenses.length === 1 ? '' : 's'}.</p>
				</div>
				<button class="primary-action" type="button" onclick={() => openExpenseComposer()}>Add expense</button>
			</section>

			{#if $vaultData.expenses.length}
				<div class="records-list">
					{#each $vaultData.expenses as expense (expense.id)}
						<article class="record-card money-card">
							<div class="record-main">
								<div class="money-symbol out" aria-hidden="true">↙</div>
								<div>
									<strong>{expense.category}</strong>
									<span>{formatRelativeDate(expense.occurredOn)} · Paid by {expense.partner === 'a' ? vault.members.a.name : vault.members.b.name}</span>
									{#if expense.clientName}<small>{expense.clientName}</small>{/if}
									{#if expense.note}<small>{expense.note}</small>{/if}
								</div>
							</div>
							<div class="amount-wrap out">
								<strong>−{formatPaise(expense.amountPaise)}</strong>
								<div class="record-actions compact">
									<button type="button" onclick={() => openExpenseComposer(expense)}>Edit</button>
									<button class="danger-link" type="button" onclick={() => void removeExpense(expense)}>Delete</button>
								</div>
							</div>
						</article>
					{/each}
				</div>
			{:else}
				<section class="empty-state">
					<div aria-hidden="true">↙</div>
					<h3>No expenses recorded</h3>
					<p>Track a business cost to keep the shared balance accurate.</p>
					<button class="primary-action" type="button" onclick={() => openExpenseComposer()}>Add expense</button>
				</section>
			{/if}
		{:else}
			<section class="page-heading more-heading">
				<div>
					<p class="eyebrow">VAULT DETAILS</p>
					<h2>More</h2>
				</div>
			</section>
			<div class="segmented" role="tablist" aria-label="More sections">
				<button class:active={morePanel === 'history'} type="button" role="tab" onclick={() => (morePanel = 'history')}>History</button>
				<button class:active={morePanel === 'settings'} type="button" role="tab" onclick={() => (morePanel = 'settings')}>Settings</button>
			</div>

			{#if morePanel === 'history'}
				<section class="section-block history">
					{#if $vaultData.mutations.length}
						<div class="activity-list full">
							{#each $vaultData.mutations as mutation (mutation.id)}
								{@const change = mutationAmount(mutation)}
								<article class="activity-item">
									<div class:out={change.direction === 'out'} class="activity-icon" aria-hidden="true">
										{mutation.recordType === 'payment' ? '₹' : '−'}
									</div>
									<div class="activity-copy">
										<strong>{mutation.summary}</strong>
										<span>{mutation.actorEmail} · {formatDateTime(mutation.createdAt)}</span>
									</div>
									<em class:out={change.direction === 'out'}>{change.direction === 'out' ? '−' : '+'}{formatPaise(change.amount)}</em>
								</article>
							{/each}
						</div>
					{:else}
						<div class="empty-state compact-empty">
							<div aria-hidden="true">◷</div>
							<h3>No history yet</h3>
							<p>Each payment or expense change creates an immutable entry here.</p>
						</div>
					{/if}
				</section>
			{:else}
				<section class="settings-list">
					<article class="settings-card">
						<span>Vault</span>
						<strong>{vault.name}</strong>
						<small>Created {formatDateTime(vault.createdAt)}</small>
					</article>
					<article class="settings-card">
						<span>Partner A</span>
						<strong>{vault.members.a.name}</strong>
						<small>{vault.members.a.email}</small>
					</article>
					<article class="settings-card">
						<span>Partner B</span>
						<strong>{vault.members.b.name}</strong>
						<small>{vault.members.b.email}</small>
					</article>
					<article class="settings-card privacy">
						<span>Device cache</span>
						<strong>Enabled for this browser</strong>
						<small>Vault data may remain cached for offline use. Sign out on shared devices.</small>
					</article>
					<button class="signout-button" type="button" disabled={actionBusy} onclick={() => void onSignOut()}>
						Sign out of Vault
					</button>
				</section>
			{/if}
		{/if}
	</main>

	<nav class="bottom-nav" aria-label="Vault navigation">
		<button class:active={activeTab === 'home'} type="button" onclick={() => switchTab('home')}><span aria-hidden="true">⌂</span>Home</button>
		<button class:active={activeTab === 'clients'} type="button" onclick={() => switchTab('clients')}><span aria-hidden="true">◎</span>Clients</button>
		<button class:active={activeTab === 'payments'} type="button" onclick={() => switchTab('payments')}><span aria-hidden="true">↗</span>Payments</button>
		<button class:active={activeTab === 'expenses'} type="button" onclick={() => switchTab('expenses')}><span aria-hidden="true">↙</span>Expenses</button>
		<button class:active={activeTab === 'more'} type="button" onclick={() => switchTab('more')}><span aria-hidden="true">•••</span>More</button>
	</nav>
</div>

{#if composer !== 'none'}
	<div class="sheet-backdrop" role="presentation" onclick={closeComposer}></div>
	<dialog open class="composer" aria-labelledby="composer-title">
		<header class="composer-header">
			<div>
				<p class="eyebrow">{composer === 'client' ? 'CLIENT' : composer === 'payment' ? 'PAYMENT' : 'EXPENSE'}</p>
				<h2 id="composer-title">
					{composer === 'client' ? (editingClient ? 'Edit client' : 'Add client') : composer === 'payment' ? (editingPayment ? 'Edit payment' : 'Record payment') : editingExpense ? 'Edit expense' : 'Add expense'}
				</h2>
			</div>
			<button class="close-button" type="button" aria-label="Close form" disabled={actionBusy} onclick={closeComposer}>×</button>
		</header>

		{#if composer === 'client'}
			<form onsubmit={(event) => void saveClient(event)}>
				<label>
					<span>Client name</span>
					<input bind:value={clientName} maxlength="120" autocomplete="organization" required disabled={actionBusy} />
				</label>
				<label>
					<span>Contact <em>optional</em></span>
					<input bind:value={clientContact} maxlength="320" autocomplete="email" placeholder="Email, phone, or contact person" disabled={actionBusy} />
				</label>
				<label>
					<span>Notes <em>optional</em></span>
					<textarea bind:value={clientNotes} maxlength="1000" rows="3" placeholder="Project or billing note" disabled={actionBusy}></textarea>
				</label>
				<button class="save-button" type="submit" disabled={actionBusy}>{actionBusy ? 'Saving…' : editingClient ? 'Save client' : 'Add client'}</button>
			</form>
		{:else if composer === 'payment'}
			<form onsubmit={(event) => void savePayment(event)}>
				{#if !activeClients.length}
					<p class="form-notice">Add an active client first.</p>
				{:else}
					<label>
						<span>Client</span>
						<select bind:value={paymentClientId} required disabled={actionBusy}>
							{#each activeClients as client (client.id)}
								<option value={client.id}>{client.name}</option>
							{/each}
						</select>
					</label>
					<label>
						<span>Amount in ₹</span>
						<input bind:value={paymentAmount} inputmode="decimal" autocomplete="off" placeholder="0.00" required disabled={actionBusy} />
					</label>
					<div class="two-fields">
						<label>
							<span>Received by</span>
							<select bind:value={paymentPartner} disabled={actionBusy}>
								<option value="a">{vault.members.a.name}</option>
								<option value="b">{vault.members.b.name}</option>
							</select>
						</label>
						<label>
							<span>Date</span>
							<input bind:value={paymentDate} type="date" required disabled={actionBusy} />
						</label>
					</div>
					<label>
						<span>Note <em>optional</em></span>
						<textarea bind:value={paymentNote} maxlength="1000" rows="3" placeholder="Invoice, project, or payment reference" disabled={actionBusy}></textarea>
					</label>
					<button class="save-button" type="submit" disabled={actionBusy}>{actionBusy ? 'Saving…' : editingPayment ? 'Save payment' : 'Record payment'}</button>
				{/if}
			</form>
		{:else}
			<form onsubmit={(event) => void saveExpense(event)}>
				<label>
					<span>Amount in ₹</span>
					<input bind:value={expenseAmount} inputmode="decimal" autocomplete="off" placeholder="0.00" required disabled={actionBusy} />
				</label>
				<div class="two-fields">
					<label>
						<span>Category</span>
						<select bind:value={expenseCategory} disabled={actionBusy}>
							{#each expenseCategories as category}
								<option value={category}>{category}</option>
							{/each}
						</select>
					</label>
					<label>
						<span>Paid by</span>
						<select bind:value={expensePartner} disabled={actionBusy}>
							<option value="a">{vault.members.a.name}</option>
							<option value="b">{vault.members.b.name}</option>
						</select>
					</label>
				</div>
				<div class="two-fields">
					<label>
						<span>Client <em>optional</em></span>
						<select bind:value={expenseClientId} disabled={actionBusy}>
							<option value="">Not linked to a client</option>
							{#each activeClients as client (client.id)}
								<option value={client.id}>{client.name}</option>
							{/each}
						</select>
					</label>
					<label>
						<span>Date</span>
						<input bind:value={expenseDate} type="date" required disabled={actionBusy} />
					</label>
				</div>
				<label>
					<span>Note <em>optional</em></span>
					<textarea bind:value={expenseNote} maxlength="1000" rows="3" placeholder="Why this cost was needed" disabled={actionBusy}></textarea>
				</label>
				<button class="save-button" type="submit" disabled={actionBusy}>{actionBusy ? 'Saving…' : editingExpense ? 'Save expense' : 'Add expense'}</button>
			</form>
		{/if}

		{#if actionError}
			<p class="form-error" role="alert">{actionError}</p>
		{/if}
	</dialog>
{/if}

{#if actionError && composer === 'none'}
	<p class="toast-error" role="alert">{actionError}</p>
{/if}

<style>
	.workspace {
		width: min(100%, 48rem);
		margin: 0 auto;
		padding: 12px 16px 96px;
	}

	.topbar,
	.welcome,
	.section-heading,
	.page-heading,
	.composer-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
	}

	.topbar {
		min-height: 58px;
		margin-bottom: 18px;
	}

	.brand-wrap,
	.record-main,
	.partner-card,
	.activity-item,
	.filter-row,
	.amount-wrap {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.brand-mark,
	.avatar,
	.person-badge,
	.client-icon,
	.money-symbol,
	.activity-icon,
	.icon-button {
		display: grid;
		place-items: center;
		flex: 0 0 auto;
	}

	.brand-mark {
		width: 38px;
		height: 38px;
		border-radius: 12px;
		background: linear-gradient(135deg, #19a157, #08723b);
		box-shadow: 0 7px 16px rgb(7 113 59 / 24%);
		color: white;
		font-size: 1.1rem;
		font-weight: 900;
	}

	.overline,
	.eyebrow {
		margin: 0;
		color: var(--green);
		font-size: 0.68rem;
		font-weight: 850;
		letter-spacing: 0.13em;
	}

	.topbar h1 {
		max-width: 13rem;
		margin: 2px 0 0;
		overflow: hidden;
		color: var(--text);
		font-size: 1rem;
		line-height: 1.15;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.avatar {
		width: 38px;
		height: 38px;
		border: 0;
		border-radius: 50%;
		background: #dff4e7;
		color: #08743b;
		font: inherit;
		font-weight: 850;
		cursor: pointer;
	}

	.sync-banner {
		margin: -6px 0 14px;
		padding: 9px 11px;
		border: 1px solid #bee8cf;
		border-radius: 10px;
		background: #eaf8f0;
		color: #257044;
		font-size: 0.78rem;
		line-height: 1.35;
	}

	.sync-banner.offline {
		border-color: #eed69b;
		background: #fff8e4;
		color: #755c17;
	}

	.welcome {
		align-items: flex-end;
		margin: 8px 0 18px;
	}

	h2,
	h3,
	p {
		margin-top: 0;
	}

	.welcome h2,
	.page-heading h2,
	.section-heading h2,
	.composer h2 {
		margin: 6px 0 0;
		color: var(--text);
		font-size: clamp(1.55rem, 7vw, 2.1rem);
		letter-spacing: -0.045em;
		line-height: 1.08;
	}

	.icon-button {
		width: 44px;
		height: 44px;
		border: 0;
		border-radius: 14px;
		background: var(--text);
		color: var(--surface);
		font-size: 1.7rem;
		font-weight: 350;
		line-height: 1;
		cursor: pointer;
	}

	.balance-card {
		position: relative;
		overflow: hidden;
		margin-bottom: 12px;
		padding: 25px 22px;
		border-radius: 24px;
		background:
			radial-gradient(circle at 100% 0%, rgb(122 239 161 / 25%), transparent 12rem),
			linear-gradient(135deg, #08743b, #07542e);
		box-shadow: 0 18px 32px rgb(8 104 52 / 21%);
		color: white;
	}

	.balance-card.negative {
		background: linear-gradient(135deg, #9b3f31, #702a22);
	}

	.balance-card p,
	.balance-card span {
		margin: 0;
		color: rgb(255 255 255 / 78%);
		font-size: 0.84rem;
	}

	.balance-card strong {
		display: block;
		margin: 8px 0 6px;
		font-size: clamp(2rem, 10vw, 3rem);
		letter-spacing: -0.06em;
		line-height: 1;
	}

	.stat-grid,
	.partner-grid,
	.two-fields {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 12px;
	}

	.stat-card,
	.partner-card,
	.record-card,
	.settings-card,
	.empty-inline,
	.empty-state {
		border: 1px solid var(--border);
		border-radius: 18px;
		background: var(--surface);
	}

	.stat-card {
		padding: 16px;
	}

	.stat-card p {
		min-height: 2.2em;
		margin: 9px 0 5px;
		color: var(--muted);
		font-size: 0.76rem;
		line-height: 1.25;
	}

	.stat-card strong {
		color: var(--text);
		font-size: 1rem;
		letter-spacing: -0.025em;
	}

	.stat-icon {
		display: inline-grid;
		width: 27px;
		height: 27px;
		place-items: center;
		border-radius: 9px;
		background: #dff4e8;
		color: #08743b;
		font-weight: 900;
	}

	.expense .stat-icon {
		background: #fce7e1;
		color: #ba4739;
	}

	.section-block {
		margin-top: 27px;
	}

	.section-heading {
		align-items: flex-end;
		margin-bottom: 12px;
	}

	.section-heading h2 {
		font-size: 1.18rem;
		letter-spacing: -0.025em;
	}

	.partner-card {
		align-items: flex-start;
		padding: 13px;
	}

	.person-badge,
	.client-icon {
		width: 32px;
		height: 32px;
		border-radius: 11px;
		background: #e5f5ea;
		color: #08743b;
		font-size: 0.82rem;
		font-weight: 850;
	}

	.person-badge.b {
		background: #e9ecff;
		color: #4f54a9;
	}

	.partner-card p {
		margin: 1px 0 4px;
		color: var(--text);
		font-size: 0.82rem;
		font-weight: 800;
	}

	.partner-card span {
		display: block;
		color: var(--muted);
		font-size: 0.69rem;
		line-height: 1.4;
	}

	.link-button,
	.record-actions button {
		border: 0;
		background: transparent;
		color: var(--green);
		font: inherit;
		font-size: 0.76rem;
		font-weight: 780;
		cursor: pointer;
	}

	.activity-list,
	.records-list,
	.settings-list {
		display: grid;
		gap: 9px;
	}

	.activity-item {
		align-items: flex-start;
		padding: 12px 1px;
		border-bottom: 1px solid var(--border);
	}

	.activity-item:last-child {
		border-bottom: 0;
	}

	.activity-icon,
	.money-symbol {
		width: 34px;
		height: 34px;
		border-radius: 11px;
		background: #e4f6eb;
		color: #08743b;
		font-size: 0.9rem;
		font-weight: 850;
	}

	.activity-icon.out,
	.money-symbol.out {
		background: #fce7e1;
		color: #b44437;
	}

	.activity-copy {
		display: grid;
		flex: 1;
		gap: 3px;
		min-width: 0;
	}

	.activity-copy strong {
		overflow: hidden;
		color: var(--text);
		font-size: 0.8rem;
		line-height: 1.25;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.activity-copy span,
	.record-main span,
	.record-main small,
	.settings-card small {
		color: var(--muted);
		font-size: 0.7rem;
		line-height: 1.35;
	}

	.activity-item em {
		margin-top: 2px;
		color: #08743b;
		font-size: 0.75rem;
		font-style: normal;
		font-weight: 850;
		white-space: nowrap;
	}

	.activity-item em.out {
		color: #b44437;
	}

	.empty-inline {
		padding: 16px;
		color: var(--muted);
		font-size: 0.82rem;
		line-height: 1.45;
	}

	.page-heading {
		align-items: flex-end;
		margin: 8px 0 19px;
	}

	.page-heading h2 {
		font-size: 2rem;
	}

	.page-heading p:not(.eyebrow) {
		max-width: 22rem;
		margin: 8px 0 0;
		color: var(--muted);
		font-size: 0.82rem;
		line-height: 1.45;
	}

	.primary-action,
	.save-button {
		min-height: 42px;
		border: 0;
		border-radius: 12px;
		background: linear-gradient(135deg, #14894a, #076233);
		color: white;
		font: inherit;
		font-size: 0.8rem;
		font-weight: 800;
		cursor: pointer;
		white-space: nowrap;
	}

	.primary-action {
		padding: 0 13px;
	}

	.filter-row {
		justify-content: space-between;
		margin-bottom: 13px;
		color: var(--muted);
		font-size: 0.77rem;
	}

	.toggle-label {
		display: flex;
		align-items: center;
		gap: 7px;
		color: var(--text);
		font-weight: 700;
	}

	.toggle-label input {
		width: 16px;
		height: 16px;
		accent-color: var(--green);
	}

	.record-card {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 13px;
	}

	.record-card.archived {
		opacity: 0.58;
	}

	.record-main {
		align-items: flex-start;
		min-width: 0;
	}

	.record-main > div:last-child {
		display: grid;
		min-width: 0;
		gap: 3px;
	}

	.record-main strong {
		overflow: hidden;
		color: var(--text);
		font-size: 0.86rem;
		line-height: 1.25;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.record-main small {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.record-actions {
		display: grid;
		justify-items: end;
		gap: 4px;
		flex: 0 0 auto;
	}

	.record-actions.compact {
		display: flex;
		gap: 2px;
		margin-top: 3px;
	}

	.record-actions .danger-link {
		color: #b44437;
	}

	.amount-wrap {
		align-items: flex-end;
		flex-direction: column;
		gap: 2px;
		white-space: nowrap;
	}

	.amount-wrap > strong {
		color: #08743b;
		font-size: 0.84rem;
	}

	.amount-wrap.out > strong {
		color: #b44437;
	}

	.empty-state {
		display: grid;
		justify-items: center;
		padding: 35px 22px;
		text-align: center;
	}

	.empty-state > div {
		display: grid;
		width: 44px;
		height: 44px;
		place-items: center;
		margin-bottom: 13px;
		border-radius: 15px;
		background: #e4f6eb;
		color: #08743b;
		font-size: 1.4rem;
	}

	.empty-state h3 {
		margin: 0;
		color: var(--text);
		font-size: 1rem;
	}

	.empty-state p {
		max-width: 17rem;
		margin: 8px 0 17px;
		color: var(--muted);
		font-size: 0.82rem;
		line-height: 1.45;
	}

	.segmented {
		display: grid;
		grid-template-columns: 1fr 1fr;
		padding: 4px;
		border: 1px solid var(--border);
		border-radius: 13px;
		background: var(--surface);
	}

	.segmented button {
		min-height: 36px;
		border: 0;
		border-radius: 9px;
		background: transparent;
		color: var(--muted);
		font: inherit;
		font-size: 0.8rem;
		font-weight: 780;
		cursor: pointer;
	}

	.segmented button.active {
		background: #e4f6eb;
		color: #08743b;
	}

	.history {
		margin-top: 16px;
	}

	.full {
		padding: 1px 12px;
		border: 1px solid var(--border);
		border-radius: 18px;
		background: var(--surface);
	}

	.compact-empty {
		padding: 24px 18px;
	}

	.settings-card {
		display: grid;
		gap: 4px;
		padding: 15px;
	}

	.settings-card span {
		color: var(--muted);
		font-size: 0.69rem;
		font-weight: 800;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.settings-card strong {
		color: var(--text);
		font-size: 0.88rem;
		word-break: break-word;
	}

	.settings-card.privacy {
		border-color: #d7e9dc;
		background: #f4faf5;
	}

	.signout-button {
		min-height: 48px;
		margin-top: 5px;
		border: 1px solid #efc3bc;
		border-radius: 13px;
		background: #fff7f5;
		color: #a93b2f;
		font: inherit;
		font-size: 0.85rem;
		font-weight: 800;
		cursor: pointer;
	}

	.bottom-nav {
		position: fixed;
		z-index: 5;
		right: 0;
		bottom: 0;
		left: 0;
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		padding: 7px max(10px, env(safe-area-inset-right)) calc(7px + env(safe-area-inset-bottom)) max(10px, env(safe-area-inset-left));
		border-top: 1px solid var(--border);
		background: color-mix(in srgb, var(--surface) 95%, transparent);
		backdrop-filter: blur(18px);
	}

	.bottom-nav button {
		display: grid;
		min-height: 48px;
		place-items: center;
		gap: 2px;
		border: 0;
		border-radius: 10px;
		background: transparent;
		color: var(--muted);
		font: inherit;
		font-size: 0.62rem;
		font-weight: 750;
		cursor: pointer;
	}

	.bottom-nav button span {
		font-size: 1.02rem;
		line-height: 1;
	}

	.bottom-nav button.active {
		background: #e4f6eb;
		color: #08743b;
	}

	.sheet-backdrop {
		position: fixed;
		z-index: 9;
		inset: 0;
		background: rgb(9 24 15 / 42%);
		backdrop-filter: blur(3px);
	}

	.composer {
		position: fixed;
		z-index: 10;
		right: 0;
		bottom: 0;
		left: 0;
		max-height: min(87dvh, 48rem);
		overflow-y: auto;
		padding: 22px 20px calc(24px + env(safe-area-inset-bottom));
		border: 0;
		border-radius: 25px 25px 0 0;
		background: var(--surface);
		box-shadow: 0 -14px 45px rgb(11 42 25 / 20%);
	}

	.composer-header {
		align-items: flex-start;
		margin-bottom: 21px;
	}

	.composer h2 {
		font-size: 1.55rem;
	}

	.close-button {
		display: grid;
		width: 34px;
		height: 34px;
		place-items: center;
		border: 0;
		border-radius: 50%;
		background: var(--surface-hover);
		color: var(--text);
		font-size: 1.45rem;
		line-height: 1;
		cursor: pointer;
	}

	.composer form {
		display: grid;
		gap: 15px;
	}

	.composer label {
		display: grid;
		gap: 7px;
		color: var(--text);
		font-size: 0.79rem;
		font-weight: 800;
	}

	.composer label span em {
		color: var(--muted);
		font-size: 0.7rem;
		font-style: normal;
		font-weight: 550;
	}

	.composer input,
	.composer select,
	.composer textarea {
		width: 100%;
		border: 1px solid var(--border-strong);
		border-radius: 11px;
		background: var(--input);
		color: var(--text);
		font: inherit;
		font-size: 0.94rem;
		font-weight: 500;
		outline: none;
		padding: 0 12px;
	}

	.composer input,
	.composer select {
		min-height: 46px;
	}

	.composer textarea {
		resize: vertical;
		padding-top: 11px;
	}

	.composer input:focus,
	.composer select:focus,
	.composer textarea:focus {
		border-color: var(--green);
		box-shadow: 0 0 0 3px rgb(31 158 88 / 18%);
	}

	.save-button {
		width: 100%;
		min-height: 50px;
		margin-top: 3px;
		font-size: 0.92rem;
	}

	.save-button:disabled,
	.signout-button:disabled,
	.close-button:disabled {
		cursor: wait;
		opacity: 0.64;
	}

	.form-error,
	.form-notice,
	.toast-error {
		margin: 15px 0 0;
		padding: 11px 12px;
		border-radius: 11px;
		font-size: 0.8rem;
		line-height: 1.42;
	}

	.form-error,
	.toast-error {
		border: 1px solid #efb9b3;
		background: #fff1ef;
		color: #a83228;
	}

	.form-notice {
		margin: 0;
		background: #fff8e4;
		color: #765e19;
	}

	.toast-error {
		position: fixed;
		z-index: 12;
		right: 16px;
		bottom: 83px;
		left: 16px;
		margin: 0;
		box-shadow: 0 10px 25px rgb(41 20 16 / 16%);
	}

	button:focus-visible {
		outline: 3px solid rgb(31 158 88 / 36%);
		outline-offset: 3px;
	}

	@media (min-width: 680px) {
		.workspace {
			padding: 22px 24px 32px;
		}

		.bottom-nav {
			position: sticky;
			bottom: 18px;
			width: min(100% - 48px, 44rem);
			margin: 24px auto 0;
			border: 1px solid var(--border);
			border-radius: 17px;
			box-shadow: 0 14px 35px rgb(15 48 29 / 10%);
		}

		.composer {
			right: max(24px, calc((100vw - 48rem) / 2));
			bottom: 24px;
			left: auto;
			width: min(100% - 48px, 34rem);
			border-radius: 24px;
		}
	}

	@media (prefers-color-scheme: dark) {
		.avatar,
		.person-badge,
		.client-icon,
		.stat-icon,
		.activity-icon,
		.money-symbol,
		.bottom-nav button.active,
		.segmented button.active {
			background: #173f27;
			color: #71e69d;
		}

		.activity-icon.out,
		.money-symbol.out {
			background: #48221e;
			color: #ff9d92;
		}

		.sync-banner {
			border-color: #285a3b;
			background: #163a25;
			color: #a9e4bd;
		}

		.sync-banner.offline,
		.form-notice {
			border-color: #625021;
			background: #382f17;
			color: #f2d980;
		}

		.settings-card.privacy {
			border-color: #285a3b;
			background: #13351f;
		}

		.signout-button {
			border-color: #70342e;
			background: #371b19;
			color: #ffb5ac;
		}

		.form-error,
		.toast-error {
			border-color: #75302e;
			background: #331b1a;
			color: #ffb8b2;
		}
	}
</style>
