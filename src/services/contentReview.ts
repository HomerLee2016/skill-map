import type { ContentPlan, Hashes, ItemRef } from './contentSync';
import type { WorkspaceContent } from './workspaceTypes';

export type ReviewKind = 'lessons' | 'tests';

/** A lesson or test that exists on only one side; the user decides whether it stays in the synced workspace. */
export interface ReviewItem {
  ref: ItemRef;
  kind: ReviewKind;
  id: string;
  title: string;
  /** `cloud`: missing on this device. `device`: missing in the cloud. */
  origin: 'cloud' | 'device';
  keepByDefault: boolean;
}

function parseRef(ref: ItemRef): { kind: ReviewKind; id: string } | null {
  const index = ref.indexOf(':');
  const kind = ref.slice(0, index);
  return kind === 'lessons' || kind === 'tests' ? { kind, id: ref.slice(index + 1) } : null;
}

function titleOf(content: WorkspaceContent, kind: ReviewKind, id: string): string {
  const item = (kind === 'lessons' ? content.lessons : content.tests).find((x) => x.id === id);
  return item?.title || id;
}

/**
 * Lessons and tests the plan would copy to a side that does not have them yet. Cloud-only items default to kept.
 * Device-only items default to kept when they are new (not in the last agreed base) and to not kept when the base
 * says both sides once had them, i.e. the cloud dropped them.
 */
export function findReviewItems(plan: ContentPlan, local: WorkspaceContent, cloud: WorkspaceContent, base: Hashes | null): ReviewItem[] {
  const items: ReviewItem[] = [];
  const localRefs = new Set([...local.lessons.map((x) => `lessons:${x.id}`), ...local.tests.map((x) => `tests:${x.id}`)]);
  const cloudRefs = new Set([...cloud.lessons.map((x) => `lessons:${x.id}`), ...cloud.tests.map((x) => `tests:${x.id}`)]);
  for (const ref of plan.pull) {
    const parsed = parseRef(ref);
    if (!parsed || localRefs.has(ref)) continue;
    items.push({ ref, ...parsed, title: titleOf(cloud, parsed.kind, parsed.id), origin: 'cloud', keepByDefault: true });
  }
  for (const ref of plan.push) {
    const parsed = parseRef(ref);
    if (!parsed || cloudRefs.has(ref)) continue;
    items.push({ ref, ...parsed, title: titleOf(local, parsed.kind, parsed.id), origin: 'device', keepByDefault: base === null || base[ref] === undefined });
  }
  return items;
}

/** The plan minus the reviewed items; they are applied from the user's answer instead. */
export function withoutReviewItems(plan: ContentPlan, items: ReviewItem[]): ContentPlan {
  const reviewed = new Set(items.map((item) => item.ref));
  return { ...plan, push: plan.push.filter((ref) => !reviewed.has(ref)), pull: plan.pull.filter((ref) => !reviewed.has(ref)) };
}

export interface ReviewOutcome {
  push: ItemRef[];
  pull: ItemRef[];
  removeFromDevice: ItemRef[];
  removeFromCloud: ItemRef[];
}

/** `keep` holds the refs the user left on the Keeping side. */
export function resolveReview(items: ReviewItem[], keep: ReadonlySet<ItemRef>): ReviewOutcome {
  const outcome: ReviewOutcome = { push: [], pull: [], removeFromDevice: [], removeFromCloud: [] };
  for (const item of items) {
    const kept = keep.has(item.ref);
    if (item.origin === 'device') (kept ? outcome.push : outcome.removeFromDevice).push(item.ref);
    else (kept ? outcome.pull : outcome.removeFromCloud).push(item.ref);
  }
  return outcome;
}

/** "5 tests, 2 lessons" for the removal warning. */
export function countLabel(items: ReviewItem[]): string {
  const tests = items.filter((item) => item.kind === 'tests').length;
  const lessons = items.length - tests;
  const parts = [];
  if (tests) parts.push(`${tests} test${tests === 1 ? '' : 's'}`);
  if (lessons) parts.push(`${lessons} lesson${lessons === 1 ? '' : 's'}`);
  return parts.join(', ');
}
