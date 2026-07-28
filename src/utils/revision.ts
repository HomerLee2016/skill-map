export const MASTER_LEVELS = [
  '1.1','1.2','1.3','1.4','1.5',
  '2.1','2.2','2.3','2.4','2.5',
  '3.1','3.2','3.3','3.4','3.5',
  '4.1','4.2','4.3','4.4',
  '5.1','5.2','5.3',
] as const;

export const DEFAULT_PROFICIENCY = '1.1' as const;

export function normalizeProficiency(proficiency: string | null | undefined): string {
  const trimmed = proficiency?.trim();
  return trimmed ? trimmed : DEFAULT_PROFICIENCY;
}

const STAGE_INTERVALS_HOURS: Record<number, number> = {
  1: 8,
  2: 24,
  3: 48,
  4: 72,
  5: 168,
};

function getStage(proficiency: string | null | undefined): number {
  const normalized = normalizeProficiency(proficiency);
  const major = Number.parseInt(normalized.split('.')[0], 10);
  return Number.isFinite(major) ? major : 1;
}

function getLevelIndex(proficiency: string | null | undefined): number {
  const normalized = normalizeProficiency(proficiency);
  const index = MASTER_LEVELS.indexOf(normalized as (typeof MASTER_LEVELS)[number]);
  return index >= 0 ? index : MASTER_LEVELS.indexOf(DEFAULT_PROFICIENCY);
}

export function getNextProficiency(currentProficiency: string | null | undefined): string {
  const currentIndex = getLevelIndex(currentProficiency);
  if (currentIndex >= MASTER_LEVELS.length - 1) {
    return MASTER_LEVELS[MASTER_LEVELS.length - 1];
  }
  return MASTER_LEVELS[currentIndex + 1];
}

export function getDowngradedProficiency(currentProficiency: string | null | undefined): string {
  const stage = getStage(currentProficiency);
  if (stage <= 1) {
    return DEFAULT_PROFICIENCY;
  }
  return `${stage - 1}.1`;
}

export function getNextRevisionTime(lastTime: string | null | undefined, currentProficiency: string | null | undefined): string {
  const stage = getStage(currentProficiency);
  const intervalHours = STAGE_INTERVALS_HOURS[stage] ?? STAGE_INTERVALS_HOURS[1];
  const base = lastTime ? new Date(lastTime) : new Date();
  base.setHours(base.getHours() + intervalHours);
  return base.toISOString();
}

export function isQuestionDue(lastTime: string | null | undefined, currentProficiency: string | null | undefined, now: Date = new Date()): boolean {
  const nextRevisionTime = getNextRevisionTime(lastTime, currentProficiency);
  return new Date(nextRevisionTime).getTime() <= now.getTime();
}
