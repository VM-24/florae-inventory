import type { Prisma } from '@prisma/client';

type Tx = Prisma.TransactionClient;

export interface AuditInput {
  userId: string | null;
  action: string;
  entity: 'item' | 'category' | 'user';
  entityId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}

function jsonSafe(value: unknown): unknown {
  if (value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  // Prisma.Decimal and anything else with a meaningful toString
  if (value && typeof value === 'object' && 'toFixed' in value) return Number(value);
  return value;
}

// Keep only fields whose value actually changed — the log answers "what changed", not "what was sent".
export function diff(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): { before: Record<string, unknown>; after: Record<string, unknown> } | null {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const key of Object.keys(after)) {
    const prev = jsonSafe(before[key]);
    const next = jsonSafe(after[key]);
    if (JSON.stringify(prev) !== JSON.stringify(next)) {
      b[key] = prev;
      a[key] = next;
    }
  }
  return Object.keys(a).length ? { before: b, after: a } : null;
}

function clean(obj: Record<string, unknown> | null | undefined) {
  if (!obj) return undefined;
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, jsonSafe(v)])) as Prisma.InputJsonObject;
}

export async function writeAudit(tx: Tx, input: AuditInput): Promise<void> {
  await tx.auditLog.create({
    data: {
      userId: input.userId,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId,
      before: clean(input.before),
      after: clean(input.after),
    },
  });
}
