export type PartnerKey = 'a' | 'b';

export interface VaultMember {
	name: string;
	email: string;
}

export interface PartnerTotals {
	received: number;
	spent: number;
}

export interface VaultTotals {
	earned: number;
	spent: number;
	a: PartnerTotals;
	b: PartnerTotals;
}

export interface VaultSetupInput {
	name: string;
	members: {
		a: VaultMember;
		b: VaultMember;
	};
}

export interface VaultSummary {
	id: string;
	name: string;
	members: {
		a: VaultMember;
		b: VaultMember;
	};
	fromCache: boolean;
	pendingWrites: boolean;
}
