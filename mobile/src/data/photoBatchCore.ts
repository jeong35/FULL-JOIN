export type BatchSaveState = {
  id: string;
  saveStatus: 'pending' | 'saving' | 'saved' | 'failed';
  savedWardrobeId: string | null;
  saveError: string | null;
};

export function batchClock(): number {
  return Date.now();
}

export type BatchSaveDependencies<T extends BatchSaveState> = {
  create: (item: T) => Promise<{ id: string }>;
  persistPhoto: (wardrobeItemId: string, item: T) => boolean;
  rollback: (wardrobeItemId: string) => Promise<boolean>;
  errorMessage: (error: unknown) => string;
  onChange?: (items: readonly T[]) => void;
};

export type BatchSaveResult<T extends BatchSaveState> = {
  items: T[];
  attempted: number;
  saved: number;
  failed: number;
};

export function appendUniqueBatchValues<T>(
  existing: readonly T[],
  candidates: readonly T[],
  keyFor: (value: T) => string,
  maximum: number,
): T[] {
  const keys = new Set(existing.map(keyFor));
  const result = [...existing];
  for (const candidate of candidates) {
    const key = keyFor(candidate);
    if (result.length >= maximum) break;
    if (keys.has(key)) continue;
    keys.add(key);
    result.push(candidate);
  }
  return result;
}

export function removeBatchValue<T>(values: readonly T[], index: number): T[] {
  if (values.length <= 1 || index < 0 || index >= values.length) return [...values];
  return values.filter((_, valueIndex) => valueIndex !== index);
}

export function canAddBatchItem(totalItems: number, photoItems: number, maximumTotal: number, maximumPerPhoto: number): boolean {
  return totalItems < maximumTotal && photoItems < maximumPerPhoto;
}

export function findRecoveredBatchValue<T extends { id: string }>(
  values: readonly T[],
  knownIds: ReadonlySet<string>,
  matches: (value: T) => boolean,
): T | undefined {
  return values.find((value) => !knownIds.has(value.id) && matches(value));
}

function replace<T extends BatchSaveState>(items: readonly T[], id: string, patch: Partial<T>): T[] {
  return items.map((item) => item.id === id ? { ...item, ...patch } : item);
}

// 이미 saved인 항목은 건너뛴다. 서버 저장 뒤 사진 저장이 실패하면 rollback하고,
// rollback도 실패한 경우 savedWardrobeId를 보존해 재시도 때 새 옷을 만들지 않는다.
export async function savePhotoBatch<T extends BatchSaveState>(
  input: readonly T[],
  dependencies: BatchSaveDependencies<T>,
): Promise<BatchSaveResult<T>> {
  let items = [...input];
  const targets = items.filter((item) => item.saveStatus !== 'saved');
  let saved = 0;
  let failed = 0;

  const update = (id: string, patch: Partial<T>) => {
    items = replace(items, id, patch);
    dependencies.onChange?.(items);
  };

  for (const original of targets) {
    let current = items.find((item) => item.id === original.id)!;
    update(current.id, { saveStatus: 'saving', saveError: null } as Partial<T>);
    current = items.find((item) => item.id === original.id)!;
    let wardrobeItemId = current.savedWardrobeId;
    try {
      if (wardrobeItemId === null) {
        wardrobeItemId = (await dependencies.create(current)).id;
        update(current.id, { savedWardrobeId: wardrobeItemId } as Partial<T>);
        current = items.find((item) => item.id === original.id)!;
      }
      if (!dependencies.persistPhoto(wardrobeItemId, current)) {
        const rolledBack = await dependencies.rollback(wardrobeItemId);
        update(current.id, {
          saveStatus: 'failed',
          savedWardrobeId: rolledBack ? null : wardrobeItemId,
          saveError: rolledBack
            ? '사진 저장 공간이 부족해 옷 등록을 취소했어요'
            : '사진 저장에 실패했어요. 다시 시도하면 같은 옷에 사진만 저장해요',
        } as Partial<T>);
        failed += 1;
        continue;
      }
      update(current.id, { saveStatus: 'saved', savedWardrobeId: wardrobeItemId, saveError: null } as Partial<T>);
      saved += 1;
    } catch (error) {
      update(current.id, { saveStatus: 'failed', saveError: dependencies.errorMessage(error) } as Partial<T>);
      failed += 1;
    }
  }
  return { items, attempted: targets.length, saved, failed };
}
