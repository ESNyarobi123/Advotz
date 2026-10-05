import {
  prisma,
  type Journal,
  type LedgerAccountType,
  type LedgerOwnerType,
  type NormalBalance,
  type Prisma,
} from "@advo/db";

type Tx = Prisma.TransactionClient;

export const NORMAL_BALANCE: Record<LedgerAccountType, NormalBalance> = {
  PROVIDER_CLEARING: "DEBIT",
  PROVIDER_FEE_EXPENSE: "DEBIT",
  COMMISSION_EXPENSE: "DEBIT",
  PAYOUT_CLEARING: "DEBIT",
  PLATFORM_SUBSCRIPTION_REVENUE: "CREDIT",
  PLATFORM_SALE_FEE_REVENUE: "CREDIT",
  PLATFORM_WITHDRAWAL_FEE_REVENUE: "CREDIT",
  OVERPAYMENT_LIABILITY: "CREDIT",
  RESELLER_PAYABLE: "CREDIT",
  RESELLER_PENDING_SETTLEMENT: "CREDIT",
  AGENT_PENDING_PAYABLE: "CREDIT",
  AGENT_AVAILABLE_PAYABLE: "CREDIT",
  WITHDRAWAL_RESERVE: "CREDIT",
};

export const PLATFORM_OWNER = "platform";

export type AccountRef = {
  ownerType: LedgerOwnerType;
  ownerId: string;
  type: LedgerAccountType;
};

export type PostingLine = {
  account: AccountRef;
  debit?: bigint;
  credit?: bigint;
};

export function platformAccount(type: LedgerAccountType): AccountRef {
  return { ownerType: "PLATFORM", ownerId: PLATFORM_OWNER, type };
}

export function resellerAccount(resellerId: string, type: LedgerAccountType): AccountRef {
  return { ownerType: "RESELLER", ownerId: resellerId, type };
}

export function agentAccount(agentId: string, type: LedgerAccountType): AccountRef {
  return { ownerType: "AGENT", ownerId: agentId, type };
}

export class LedgerImbalanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LedgerImbalanceError";
  }
}

export async function ensureAccount(tx: Tx, ref: AccountRef) {
  return tx.ledgerAccount.upsert({
    where: {
      ownerType_ownerId_type_currency: {
        ownerType: ref.ownerType,
        ownerId: ref.ownerId,
        type: ref.type,
        currency: "TZS",
      },
    },
    create: {
      ownerType: ref.ownerType,
      ownerId: ref.ownerId,
      type: ref.type,
      currency: "TZS",
      normalBalance: NORMAL_BALANCE[ref.type],
    },
    update: {},
  });
}

/**
 * Posts one balanced journal. The sourceKey is the business idempotency key: posting the
 * same source twice returns the existing journal instead of duplicating money movement.
 * A deferred database trigger independently rejects unbalanced journals at commit.
 */
export async function postJournal(
  tx: Tx | typeof prisma,
  input: {
    sourceKey: string;
    sourceType: string;
    description: string;
    lines: PostingLine[];
    actorUserId?: string | null;
    reversesJournalId?: string | null;
  },
): Promise<{ journal: Journal; created: boolean }> {
  if ("$transaction" in tx && typeof (tx as { $transaction?: unknown }).$transaction === "function") {
    return (tx as typeof prisma).$transaction((inner) => postJournal(inner, input));
  }
  const existing = await tx.journal.findUnique({ where: { sourceKey: input.sourceKey } });
  if (existing) return { journal: existing, created: false as const };

  const lines = input.lines.filter((l) => (l.debit ?? 0n) !== 0n || (l.credit ?? 0n) !== 0n);
  let debits = 0n;
  let credits = 0n;
  for (const line of lines) {
    const d = line.debit ?? 0n;
    const c = line.credit ?? 0n;
    if (d < 0n || c < 0n) throw new LedgerImbalanceError("Negative posting amount");
    if (d > 0n && c > 0n) throw new LedgerImbalanceError("A line cannot both debit and credit");
    debits += d;
    credits += c;
  }
  if (lines.length < 2 || debits !== credits) {
    throw new LedgerImbalanceError(
      `Journal ${input.sourceKey} unbalanced: debits=${debits} credits=${credits}`,
    );
  }

  const journal = await tx.journal.create({
    data: {
      sourceKey: input.sourceKey,
      sourceType: input.sourceType,
      description: input.description,
      actorUserId: input.actorUserId ?? null,
      reversesJournalId: input.reversesJournalId ?? null,
    },
  });
  for (const line of lines) {
    const account = await ensureAccount(tx, line.account);
    await tx.journalLine.create({
      data: {
        journalId: journal.id,
        accountId: account.id,
        debitTzs: line.debit ?? 0n,
        creditTzs: line.credit ?? 0n,
      },
    });
  }
  return { journal, created: true as const };
}

export async function accountBalance(tx: Tx | typeof prisma, ref: AccountRef): Promise<bigint> {
  const account = await tx.ledgerAccount.findUnique({
    where: {
      ownerType_ownerId_type_currency: {
        ownerType: ref.ownerType,
        ownerId: ref.ownerId,
        type: ref.type,
        currency: "TZS",
      },
    },
  });
  if (!account) return 0n;
  const sums = await tx.journalLine.aggregate({
    where: { accountId: account.id },
    _sum: { debitTzs: true, creditTzs: true },
  });
  const d = sums._sum.debitTzs ?? 0n;
  const c = sums._sum.creditTzs ?? 0n;
  return account.normalBalance === "DEBIT" ? d - c : c - d;
}

/** Serializes concurrent debits against one beneficiary account (SELECT … FOR UPDATE). */
export async function lockAccount(tx: Tx, ref: AccountRef) {
  const account = await ensureAccount(tx, ref);
  await tx.$queryRaw`SELECT id FROM "LedgerAccount" WHERE id = ${account.id}::uuid FOR UPDATE`;
  return account;
}

export async function walletSummary(ownerType: "RESELLER" | "AGENT", ownerId: string) {
  if (ownerType === "RESELLER") {
    const [available, pendingSettlement, reserved] = await Promise.all([
      accountBalance(prisma, resellerAccount(ownerId, "RESELLER_PAYABLE")),
      accountBalance(prisma, resellerAccount(ownerId, "RESELLER_PENDING_SETTLEMENT")),
      accountBalance(prisma, resellerAccount(ownerId, "WITHDRAWAL_RESERVE")),
    ]);
    return { availableTzs: available, pendingTzs: pendingSettlement, reservedTzs: reserved };
  }
  const [available, pending, reserved] = await Promise.all([
    accountBalance(prisma, agentAccount(ownerId, "AGENT_AVAILABLE_PAYABLE")),
    accountBalance(prisma, agentAccount(ownerId, "AGENT_PENDING_PAYABLE")),
    accountBalance(prisma, agentAccount(ownerId, "WITHDRAWAL_RESERVE")),
  ]);
  return { availableTzs: available, pendingTzs: pending, reservedTzs: reserved };
}

export async function accountHistory(ownerType: LedgerOwnerType, ownerId: string, take = 50) {
  const accounts = await prisma.ledgerAccount.findMany({ where: { ownerType, ownerId } });
  if (accounts.length === 0) return [];
  const lines = await prisma.journalLine.findMany({
    where: { accountId: { in: accounts.map((a) => a.id) } },
    include: { journal: true, account: true },
    orderBy: { createdAt: "desc" },
    take: Math.min(take, 200),
  });
  return lines.map((l) => ({
    id: l.id,
    at: l.createdAt,
    account: l.account.type,
    debitTzs: l.debitTzs,
    creditTzs: l.creditTzs,
    description: l.journal.description,
    sourceType: l.journal.sourceType,
  }));
}

/** Trial balance across all accounts: total debits must equal total credits. */
export async function trialBalance() {
  const sums = await prisma.journalLine.aggregate({ _sum: { debitTzs: true, creditTzs: true } });
  const debits = sums._sum.debitTzs ?? 0n;
  const credits = sums._sum.creditTzs ?? 0n;
  const accounts = await prisma.ledgerAccount.findMany();
  const balances = await Promise.all(
    accounts.map(async (a) => ({
      ownerType: a.ownerType,
      ownerId: a.ownerId,
      type: a.type,
      balanceTzs: await accountBalance(prisma, {
        ownerType: a.ownerType,
        ownerId: a.ownerId,
        type: a.type,
      }),
    })),
  );
  return { debitsTzs: debits, creditsTzs: credits, balanced: debits === credits, balances };
}

// ───────────────────────────── Admin ledger board ──────────────────────────────

/**
 * The chart of accounts in the order an operator reads it: money in transit
 * first, then costs, then what the platform owes a beneficiary, then what it
 * earned. Declared here rather than in the UI so a new account type shows up on
 * the board the moment it is added to the enum.
 */
export const LEDGER_ACCOUNT_TYPES = [
  "PROVIDER_CLEARING",
  "PAYOUT_CLEARING",
  "PROVIDER_FEE_EXPENSE",
  "COMMISSION_EXPENSE",
  "OVERPAYMENT_LIABILITY",
  "RESELLER_PAYABLE",
  "RESELLER_PENDING_SETTLEMENT",
  "AGENT_PENDING_PAYABLE",
  "AGENT_AVAILABLE_PAYABLE",
  "WITHDRAWAL_RESERVE",
  "PLATFORM_SALE_FEE_REVENUE",
  "PLATFORM_WITHDRAWAL_FEE_REVENUE",
  "PLATFORM_SUBSCRIPTION_REVENUE",
] as const;

export const LEDGER_OWNER_TYPES = ["PLATFORM", "RESELLER", "AGENT"] as const;

/** Coarse grouping so thirteen account types read as four business questions. */
export type AccountFamily = "CLEARING" | "OBLIGATION" | "REVENUE" | "COST";

export const ACCOUNT_FAMILY: Record<string, AccountFamily> = {
  PROVIDER_CLEARING: "CLEARING",
  PAYOUT_CLEARING: "CLEARING",
  OVERPAYMENT_LIABILITY: "OBLIGATION",
  RESELLER_PAYABLE: "OBLIGATION",
  RESELLER_PENDING_SETTLEMENT: "OBLIGATION",
  AGENT_PENDING_PAYABLE: "OBLIGATION",
  AGENT_AVAILABLE_PAYABLE: "OBLIGATION",
  WITHDRAWAL_RESERVE: "OBLIGATION",
  PLATFORM_SALE_FEE_REVENUE: "REVENUE",
  PLATFORM_WITHDRAWAL_FEE_REVENUE: "REVENUE",
  PLATFORM_SUBSCRIPTION_REVENUE: "REVENUE",
  PROVIDER_FEE_EXPENSE: "COST",
  COMMISSION_EXPENSE: "COST",
};

export const ACCOUNT_FAMILIES: AccountFamily[] = ["CLEARING", "OBLIGATION", "REVENUE", "COST"];

/**
 * Historical spellings that earlier code wrote for a journal event.
 *
 * `Journal` is append-only — a database trigger rejects `UPDATE` — so a
 * mislabelled event can never be renamed after the fact; it can only be
 * interpreted. Two commission events were seeded as `commission_accrued` /
 * `commission_released` while `commissions.service.ts` writes
 * `commission_accrual` / `commission_release`. Grouping by the canonical event
 * keeps one business event from reading as two buckets, while the raw value
 * stays untouched on the row and visible in the journal detail.
 */
export const LEDGER_EVENT_ALIASES: Record<string, string> = {
  commission_accrued: "commission_accrual",
  commission_released: "commission_release",
};

/** The name the board groups and labels a journal event by. */
export const canonicalEvent = (sourceType: string) => LEDGER_EVENT_ALIASES[sourceType] ?? sourceType;

/**
 * Every raw value the database may hold for one canonical event, so a filter
 * built from the board still finds the rows written under the older spelling.
 */
export const sourceTypesForEvent = (event: string) => [
  event,
  ...Object.keys(LEDGER_EVENT_ALIASES).filter((raw) => LEDGER_EVENT_ALIASES[raw] === event),
];

/**
 * The same four families as a lookup, so the admin route validates a `family`
 * filter against the exact list the summary groups by instead of a copy that can
 * drift.
 */
export const ACCOUNT_FAMILY_VALUES: Record<AccountFamily, AccountFamily> = {
  CLEARING: "CLEARING",
  OBLIGATION: "OBLIGATION",
  REVENUE: "REVENUE",
  COST: "COST",
};

export type LedgerAccountRow = {
  id: string;
  ownerType: LedgerOwnerType;
  ownerId: string;
  type: LedgerAccountType;
  currency: string;
  normalBalance: NormalBalance;
  debitTzs: bigint;
  creditTzs: bigint;
  /** Signed by the account's own side, so a positive number means "as expected". */
  balanceTzs: bigint;
  lineCount: number;
  lastLineAt: Date | null;
};

/**
 * Every account with its legs already summed, in two queries.
 *
 * Reading one balance at a time (an aggregate per account) is what the first
 * version of this screen did; that is N round trips for one page and grows with
 * the chart of accounts. Grouping the lines once keeps the board at a constant
 * cost, and it also gives the account table the debit and credit legs it needs
 * without a second pass.
 */
export async function ledgerAccountRows(): Promise<LedgerAccountRow[]> {
  const [accounts, sums] = await Promise.all([
    prisma.ledgerAccount.findMany({
      orderBy: [{ ownerType: "asc" }, { type: "asc" }],
      include: { _count: { select: { lines: true } } },
    }),
    prisma.journalLine.groupBy({
      by: ["accountId"],
      _sum: { debitTzs: true, creditTzs: true },
      _max: { createdAt: true },
    }),
  ]);

  const byAccount = new Map(sums.map((row) => [row.accountId, row]));

  return accounts.map((account) => {
    const sum = byAccount.get(account.id);
    const debitTzs = sum?._sum.debitTzs ?? 0n;
    const creditTzs = sum?._sum.creditTzs ?? 0n;
    return {
      id: account.id,
      ownerType: account.ownerType,
      ownerId: account.ownerId,
      type: account.type,
      currency: account.currency,
      normalBalance: account.normalBalance,
      debitTzs,
      creditTzs,
      balanceTzs: account.normalBalance === "DEBIT" ? debitTzs - creditTzs : creditTzs - debitTzs,
      lineCount: account._count.lines,
      lastLineAt: sum?._max.createdAt ?? null,
    };
  });
}

export type LedgerOwnerInfo = { type: LedgerOwnerType; name: string; handle: string; status: string };

/**
 * Resolves the human behind a ledger owner. A trial balance of bare uuids is
 * technically correct and operationally useless, so every account and posting
 * on the board carries the Reseller business name or the Agent's own name.
 */
export async function ledgerOwnerIndex(
  refs: ReadonlyArray<{ ownerType: LedgerOwnerType; ownerId: string }>,
): Promise<Map<string, LedgerOwnerInfo>> {
  const resellerIds = [...new Set(refs.filter((r) => r.ownerType === "RESELLER").map((r) => r.ownerId))];
  const agentIds = [...new Set(refs.filter((r) => r.ownerType === "AGENT").map((r) => r.ownerId))];

  const [resellers, agents] = await Promise.all([
    prisma.reseller.findMany({
      where: { id: { in: resellerIds } },
      select: { id: true, businessName: true, slug: true, status: true },
    }),
    prisma.agent.findMany({
      where: { id: { in: agentIds } },
      select: { id: true, referralCode: true, status: true, user: { select: { name: true } } },
    }),
  ]);

  const index = new Map<string, LedgerOwnerInfo>();
  for (const r of resellers) {
    index.set(`RESELLER:${r.id}`, { type: "RESELLER", name: r.businessName, handle: r.slug, status: r.status });
  }
  for (const a of agents) {
    index.set(`AGENT:${a.id}`, {
      type: "AGENT",
      name: a.user.name,
      handle: a.referralCode,
      status: a.status,
    });
  }
  return index;
}

/** Sums one numeric field of a list, keeping BigInt out of `reduce` on an empty list. */
const total = <T>(rows: readonly T[], pick: (row: T) => bigint) => rows.reduce((sum, row) => sum + pick(row), 0n);

/**
 * Folds raw `sourceType` rows into one bucket per canonical event.
 *
 * `sources` is kept on the bucket so the board's filter can still name the exact
 * values to look for — the journal is append-only, so both spellings live in the
 * table and a filter that only knew the canonical name would silently return
 * fewer rows than the card counted.
 */
function foldEvents(rows: ReadonlyArray<{ sourceType: string; journals: bigint; amountTzs: bigint }>) {
  const buckets = new Map<string, { event: string; sources: string[]; journals: number; amountTzs: bigint }>();
  for (const row of rows) {
    const event = canonicalEvent(row.sourceType);
    const bucket = buckets.get(event) ?? { event, sources: [], journals: 0, amountTzs: 0n };
    bucket.sources.push(row.sourceType);
    bucket.journals += Number(row.journals);
    bucket.amountTzs += row.amountTzs;
    buckets.set(event, bucket);
  }
  return buckets;
}

/**
 * The counts and money behind every tile, card and filter on the ledger board.
 *
 * Debits and credits are reported independently rather than netted, because the
 * whole point of this screen is that those two numbers agree. Nothing here
 * infers a state: an out-of-balance book is surfaced as a difference an operator
 * must chase, never rounded away.
 */
export async function ledgerSummary() {
  const since = new Date(Date.now() - 24 * 3_600_000);
  const [accounts, legs, journalCount, bySourceRows, oldest, newest, reversals, last24h] = await Promise.all([
    ledgerAccountRows(),
    prisma.journalLine.aggregate({ _sum: { debitTzs: true, creditTzs: true }, _count: true }),
    prisma.journal.count(),
    prisma.$queryRaw<Array<{ sourceType: string; journals: bigint; amountTzs: bigint }>>`
      SELECT j."sourceType" AS "sourceType",
             COUNT(DISTINCT j.id)::bigint AS "journals",
             COALESCE(SUM(l."debitTzs"), 0)::bigint AS "amountTzs"
      FROM "Journal" j
      JOIN "JournalLine" l ON l."journalId" = j.id
      GROUP BY j."sourceType"
    `,
    prisma.journal.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    prisma.journal.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    prisma.journal.count({ where: { reversesJournalId: { not: null } } }),
    prisma.journal.count({ where: { createdAt: { gte: since } } }),
  ]);

  const debitsTzs = legs._sum.debitTzs ?? 0n;
  const creditsTzs = legs._sum.creditTzs ?? 0n;

  const bySource = [...foldEvents(bySourceRows).values()].sort((a, b) => Number(b.amountTzs - a.amountTzs));

  const byType = LEDGER_ACCOUNT_TYPES.flatMap((type) => {
    const rows = accounts.filter((account) => account.type === type);
    const sample = rows[0];
    if (!sample) return [];
    return [
      {
        type,
        normalBalance: sample.normalBalance,
        family: ACCOUNT_FAMILY[type] ?? "CLEARING",
        accounts: rows.length,
        debitTzs: total(rows, (r) => r.debitTzs),
        creditTzs: total(rows, (r) => r.creditTzs),
        balanceTzs: total(rows, (r) => r.balanceTzs),
        lineCount: total(rows, (r) => BigInt(r.lineCount)),
      },
    ];
  });

  const byFamily = ACCOUNT_FAMILIES.map((family) => {
    const rows = accounts.filter((account) => (ACCOUNT_FAMILY[account.type] ?? "CLEARING") === family);
    return {
      family,
      accounts: rows.length,
      balanceTzs: total(rows, (r) => r.balanceTzs),
      lineCount: total(rows, (r) => BigInt(r.lineCount)),
    };
  });

  const byOwner = LEDGER_OWNER_TYPES.map((ownerType) => {
    const rows = accounts.filter((account) => account.ownerType === ownerType);
    // Balances are only additive within one side of the book: adding a
    // debit-normal asset to a credit-normal liability produces a number that
    // means nothing. `balanceTzs` is the whole book, `owedTzs` is the one
    // question a finance operator actually asks of an owner.
    const owed = rows.filter((account) => ACCOUNT_FAMILY[account.type] === "OBLIGATION");
    return {
      ownerType,
      accounts: rows.length,
      balanceTzs: total(rows, (r) => r.balanceTzs),
      owedTzs: total(owed, (r) => r.balanceTzs),
      owedAccounts: owed.length,
      debitTzs: total(rows, (r) => r.debitTzs),
      creditTzs: total(rows, (r) => r.creditTzs),
      lineCount: total(rows, (r) => BigInt(r.lineCount)),
    };
  });

  const bySide = (["DEBIT", "CREDIT"] as const).map((normalBalance) => {
    const rows = accounts.filter((account) => account.normalBalance === normalBalance);
    return {
      normalBalance,
      accounts: rows.length,
      balanceTzs: total(rows, (r) => r.balanceTzs),
      debitTzs: total(rows, (r) => r.debitTzs),
      creditTzs: total(rows, (r) => r.creditTzs),
    };
  });

  return {
    totals: {
      debitsTzs,
      creditsTzs,
      differenceTzs: debitsTzs - creditsTzs,
      balanced: debitsTzs === creditsTzs,
      journalLines: legs._count,
    },
    journals: {
      total: journalCount,
      reversals,
      last24h,
      oldestAt: oldest?.createdAt ?? null,
      newestAt: newest?.createdAt ?? null,
      bySource,
    },
    accounts: {
      total: accounts.length,
      funded: accounts.filter((account) => account.balanceTzs !== 0n).length,
      byType,
      byFamily,
      byOwner,
      bySide,
    },
  };
}

/**
 * One row per ledger account for the accounts table, with the owner resolved.
 *
 * Search runs over the resolved owner name and handle, so it happens after the
 * owner lookup. The chart of accounts is bounded (account types × owners), so
 * filtering it in memory is cheaper than a second round trip per filter.
 */
export async function listLedgerAccounts(filter: {
  ownerType?: LedgerOwnerType;
  type?: LedgerAccountType;
  family?: AccountFamily;
  normalBalance?: NormalBalance;
  q?: string;
}) {
  const all = await ledgerAccountRows();
  const owners = await ledgerOwnerIndex(all);
  const needle = filter.q?.trim().toLowerCase();

  const rows = all
    .filter((account) => {
      if (filter.ownerType && account.ownerType !== filter.ownerType) return false;
      if (filter.type && account.type !== filter.type) return false;
      if (filter.normalBalance && account.normalBalance !== filter.normalBalance) return false;
      if (filter.family && (ACCOUNT_FAMILY[account.type] ?? "CLEARING") !== filter.family) return false;
      if (!needle) return true;
      const owner = owners.get(`${account.ownerType}:${account.ownerId}`);
      return [owner?.name, owner?.handle, account.type, account.ownerType, account.ownerId]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    })
    .map((account) => {
      const owner = owners.get(`${account.ownerType}:${account.ownerId}`) ?? null;
      return { ...account, owner };
    })
    // Money first: an account with a balance is what an operator came to read.
    .sort((a, b) => {
      const aZero = a.balanceTzs === 0n ? 1 : 0;
      const bZero = b.balanceTzs === 0n ? 1 : 0;
      if (aZero !== bZero) return aZero - bZero;
      const diff = b.balanceTzs - a.balanceTzs;
      if (diff !== 0n) return diff > 0n ? 1 : -1;
      return a.type.localeCompare(b.type);
    });

  return {
    rows,
    total: all.length,
    /** Every account with a non-zero balance, so a zero account can be dimmed. */
    funded: all.filter((account) => account.balanceTzs !== 0n).length,
  };
}

type JournalLineView = {
  id: string;
  accountId: string;
  ownerType: LedgerOwnerType;
  ownerId: string;
  ownerName: string | null;
  accountType: LedgerAccountType;
  normalBalance: NormalBalance;
  /**
   * The account's balance immediately after this line. Only the detail view
   * computes it (walking that account's later lines backwards); the list leaves
   * it null rather than shipping a zero that would read as a real balance.
   */
  balanceAfterTzs: bigint | null;
  debitTzs: bigint;
  creditTzs: bigint;
};

const serialiseJournal = (
  journal: {
    id: string;
    sourceKey: string;
    sourceType: string;
    description: string;
    reversesJournalId: string | null;
    actorUserId: string | null;
    createdAt: Date;
  },
  lines: JournalLineView[],
) => ({
  id: journal.id,
  sourceKey: journal.sourceKey,
  sourceType: journal.sourceType,
  /** The business event this posting belongs to, with legacy spellings folded in. */
  event: canonicalEvent(journal.sourceType),
  description: journal.description,
  reversesJournalId: journal.reversesJournalId,
  actorUserId: journal.actorUserId,
  createdAt: journal.createdAt,
  debitTzs: lines.reduce((sum, line) => sum + line.debitTzs, 0n),
  creditTzs: lines.reduce((sum, line) => sum + line.creditTzs, 0n),
  lines,
});

/**
 * The posted journals, newest first, with each journal's legs.
 *
 * `reversesJournalId` is returned as a bare id rather than an expanded object:
 * the detail view resolves the counterpart journal it points at, and the list
 * only needs to mark the row so an operator can see a correction at a glance.
 *
 * `event` filters by canonical event and is expanded to every raw spelling that
 * event was ever written under, so a filter built from a card cannot miss rows.
 */
export async function listJournals(filter: { event?: string; q?: string; take?: number; skip?: number }) {
  const needle = filter.q?.trim();
  const where: Prisma.JournalWhereInput = {
    sourceType: filter.event ? { in: sourceTypesForEvent(filter.event) } : undefined,
    ...(needle
      ? {
          OR: [
            { description: { contains: needle, mode: "insensitive" } },
            { sourceKey: { contains: needle, mode: "insensitive" } },
            { sourceType: { contains: needle, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const take = Math.min(Math.max(filter.take ?? 50, 1), 200);
  const [journals, count] = await Promise.all([
    prisma.journal.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: Math.max(filter.skip ?? 0, 0),
      take,
      include: { lines: { include: { account: true } } },
    }),
    prisma.journal.count({ where }),
  ]);

  const owners = await ledgerOwnerIndex(journals.flatMap((j) => j.lines.map((l) => l.account)));

  const rows = journals.map((journal) =>
    serialiseJournal(
      journal,
      journal.lines.map((line) => ({
        id: line.id,
        accountId: line.accountId,
        ownerType: line.account.ownerType,
        ownerId: line.account.ownerId,
        ownerName: owners.get(`${line.account.ownerType}:${line.account.ownerId}`)?.name ?? null,
        accountType: line.account.type,
        normalBalance: line.account.normalBalance,
        balanceAfterTzs: null,
        debitTzs: line.debitTzs,
        creditTzs: line.creditTzs,
      })),
    ),
  );

  return { rows, total: count, take, skip: Math.max(filter.skip ?? 0, 0) };
}

/**
 * One journal with everything needed to audit it: every leg with its owner, the
 * admin who posted it, and the journal it reverses or was reversed by.
 */
export async function journalDetail(journalId: string) {
  const journal = await prisma.journal.findUnique({
    where: { id: journalId },
    include: { lines: { include: { account: true }, orderBy: { debitTzs: "desc" } } },
  });
  if (!journal) return null;

  const accountIds = journal.lines.map((line) => line.accountId);
  const [owners, actor, counterpart, running] = await Promise.all([
    ledgerOwnerIndex(journal.lines.map((line) => line.account)),
    journal.actorUserId
      ? prisma.user.findUnique({ where: { id: journal.actorUserId }, select: { name: true, email: true, role: true } })
      : null,
    journal.reversesJournalId
      ? prisma.journal.findUnique({
          where: { id: journal.reversesJournalId },
          select: { id: true, sourceKey: true, description: true, createdAt: true },
        })
      : null,
    // Lines that came after this journal on the same accounts, newest first, so a
    // running balance can be walked backwards without an N+1 query per line.
    prisma.journalLine.findMany({
      where: { accountId: { in: accountIds }, createdAt: { gte: journal.createdAt } },
      orderBy: [{ accountId: "asc" }, { createdAt: "desc" }],
      select: { id: true, accountId: true, debitTzs: true, creditTzs: true },
    }),
  ]);

  const reversal = await prisma.journal.findFirst({
    where: { reversesJournalId: journal.id },
    select: { id: true, sourceKey: true, description: true, createdAt: true },
  });

  // Walk each account's later lines backwards from the current balance to the
  // balance this journal left behind.
  const balances = new Map<string, bigint>();
  for (const row of await ledgerAccountRows()) {
    if (accountIds.includes(row.id)) balances.set(row.id, row.balanceTzs);
  }

  const lineBalances = new Map<string, bigint>();
  for (const line of running) {
    const current = balances.get(line.accountId);
    if (current === undefined) continue;
    lineBalances.set(line.id, current);
    const account = journal.lines.find((l) => l.accountId === line.accountId)?.account;
    const signed =
      account?.normalBalance === "DEBIT" ? line.debitTzs - line.creditTzs : line.creditTzs - line.debitTzs;
    balances.set(line.accountId, current - signed);
  }

  const lines: JournalLineView[] = journal.lines.map((line) => ({
    id: line.id,
    accountId: line.accountId,
    ownerType: line.account.ownerType,
    ownerId: line.account.ownerId,
    ownerName: owners.get(`${line.account.ownerType}:${line.account.ownerId}`)?.name ?? null,
    accountType: line.account.type,
    normalBalance: line.account.normalBalance,
    balanceAfterTzs: lineBalances.get(line.id) ?? 0n,
    debitTzs: line.debitTzs,
    creditTzs: line.creditTzs,
  }));

  return { ...serialiseJournal(journal, lines), actor, reverses: counterpart, reversedBy: reversal };
}
