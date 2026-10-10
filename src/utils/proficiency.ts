// Pure Leitner-style proficiency and review scheduling. No storage or DOM access.

export const MASTER_LEVELS = [
  '1.1', '1.2', '1.3', '1.4', '1.5',
  '2.1', '2.2', '2.3', '2.4', '2.5',
  '3.1', '3.2', '3.3', '3.4', '3.5',
  '4.1', '4.2', '4.3', '4.4',
  '5.1', '5.2', '5.3',
] as const;

export const DEFAULT_PROFICIENCY = '1.1' as const;

const STAGE_INTERVALS_HOURS: Record<number, number> = {
  1: 8,
  2: 24,
  3: 48,
  4: 72,
  5: 168,
};

export function normalizeProficiency(proficiency: string | null | undefined): string {
  const trimmed = proficiency?.trim();
  return trimmed ? trimmed : DEFAULT_PROFICIENCY;
}

function getStage(proficiency: string | null | undefined): number {
  const normalized = normalizeProficiency(proficiency);
  const major = Number.parseInt(normalized.split('.')[0], 10);
  return Number.isFinite(major) ? major : 1;
}

export function formatProficiencyDisplay(proficiency: string | null | undefined): string {
  const normalized = normalizeProficiency(proficiency);
  const stage = getStage(normalized);
  const starCount = Math.max(1, stage);
  const stars = '⭐'.repeat(starCount);
  return `${stars} ${normalized}`;
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

export function formatRevisionTimestamp(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

export function formatNextRevisionTime(
  nextRevisionTime: string | null | undefined,
  now: Date = new Date()
): string {
  if (!nextRevisionTime) {
    return '—';
  }

  const targetTime = new Date(nextRevisionTime);
  const diffMs = targetTime.getTime() - now.getTime();

  if (diffMs <= 0) {
    return '0 mins';
  }

  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  if (diffMinutes < 60) {
    return `${Math.max(0, diffMinutes)} ${diffMinutes === 1 ? 'min' : 'mins'}`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} ${diffHours === 1 ? 'hr' : 'hrs'}`;
  }

  // For dates beyond a day, show a simple date string
  const targetDate = new Date(targetTime);
  const year = targetDate.getFullYear();
  const month = String(targetDate.getMonth() + 1).padStart(2, '0');
  const day = String(targetDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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

export function shouldAdvanceRevision(existingNextRevisionTime: string | null | undefined, retakeTime: string): boolean {
  if (!existingNextRevisionTime) {
    return true;
  }

  return new Date(retakeTime).getTime() >= new Date(existingNextRevisionTime).getTime();
}
