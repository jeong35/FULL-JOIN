export type OutboxRecord = {
  event_id: string;
  enqueued_at: number;
  attempts: number;
};

export function compactOutbox<T extends OutboxRecord>(
  records: readonly T[],
  now: number,
  maximumRecords: number,
  ttlMs: number,
): T[] {
  const unique = new Map<string, T>();
  for (const record of records) {
    if (!record.event_id || !Number.isFinite(record.enqueued_at) || now - record.enqueued_at > ttlMs) continue;
    if (!unique.has(record.event_id)) unique.set(record.event_id, record);
  }
  return [...unique.values()].sort((left, right) => left.enqueued_at - right.enqueued_at)
    .slice(-maximumRecords);
}

export function acknowledgeOutbox<T extends OutboxRecord>(records: readonly T[], eventIds: ReadonlySet<string>): T[] {
  return records.filter((record) => !eventIds.has(record.event_id));
}

export function markOutboxFailed<T extends OutboxRecord>(records: readonly T[], eventIds: ReadonlySet<string>): T[] {
  return records.map((record) => eventIds.has(record.event_id)
    ? { ...record, attempts: Math.min(10, record.attempts + 1) }
    : record);
}

export function retryDelayMs(attempts: number): number {
  return Math.min(60_000, 2_000 * (2 ** Math.max(0, Math.min(5, attempts))));
}
