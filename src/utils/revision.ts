import Dexie, { type Table } from 'dexie';

export const MASTER_LEVELS = [
  '1.1', '1.2', '1.3', '1.4', '1.5',
  '2.1', '2.2', '2.3', '2.4', '2.5',
  '3.1', '3.2', '3.3', '3.4', '3.5',
  '4.1', '4.2', '4.3', '4.4',
  '5.1', '5.2', '5.3',
] as const;

export const DEFAULT_PROFICIENCY = '1.1' as const;

export interface CompletedQuestionRecord {
  id?: number;
  question_name: string;
  options: string[];
  correct_answer: string;
  selected_answer?: string | null;
  correct?: number;
  last_time: string;
  next_revision_time?: string | null;
  proficiency?: string | null;
  quiz_title: string;
  hash: string;
}

export interface CompletedQuestionInsert {
  question_name: string;
  options: string[];
  correct_answer: string;
  last_time: string;
  proficiency?: string;
  quiz_title: string;
  selected_answer?: string;
  correct?: number;
  question_id?: number;
}

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

export function shouldAdvanceRevision(existingNextRevisionTime: string | null | undefined, retakeTime: string): boolean {
  if (!existingNextRevisionTime) {
    return true;
  }

  return new Date(retakeTime).getTime() >= new Date(existingNextRevisionTime).getTime();
}

function simpleHash(input: string): string {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index);
    hash |= 0;
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function deriveWorkspaceStorageKey(workspacePath: string | null | undefined): string {
  const normalized = (workspacePath ?? '').trim().toLowerCase();
  const seed = normalized || 'default-workspace';
  return `workspace-${simpleHash(seed)}`;
}

class RevisionDexieStore extends Dexie {
  completed_questions!: Table<CompletedQuestionRecord, number>;

  constructor(storageKey: string) {
    super(`skill-map-revision-db-${storageKey}`);
    this.version(1).stores({
      completed_questions: '++id, hash, quiz_title, next_revision_time, last_time, proficiency',
    });
  }
}

let activeWorkspaceStorageKey = deriveWorkspaceStorageKey(null);
export let revisionStore = new RevisionDexieStore(activeWorkspaceStorageKey);

export function setActiveWorkspaceStorageKey(workspacePath: string | null | undefined): void {
  const nextStorageKey = deriveWorkspaceStorageKey(workspacePath);
  if (nextStorageKey === activeWorkspaceStorageKey) {
    return;
  }

  activeWorkspaceStorageKey = nextStorageKey;
  revisionStore = new RevisionDexieStore(nextStorageKey);
}

function createQuestionHash(questionName: string, options: string[]) {
  const encoder = new TextEncoder();
  const data = encoder.encode(`${questionName}:${options.join('|')}`);
  return Array.from(data, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function insertCompletedQuestion(entry: CompletedQuestionInsert): Promise<CompletedQuestionRecord> {
  const hash = createQuestionHash(entry.question_name, entry.options);

  const existing = entry.question_id != null
    ? await revisionStore.completed_questions.get(entry.question_id)
    : await revisionStore.completed_questions.where('hash').equals(hash).first();

  const isCorrect = entry.correct === 1;
  const currentProficiency = normalizeProficiency(existing?.proficiency ?? entry.proficiency);
  const shouldAdvance = shouldAdvanceRevision(existing?.next_revision_time ?? null, entry.last_time);
  const resolvedProficiency = normalizeProficiency(
    isCorrect && shouldAdvance
      ? getNextProficiency(currentProficiency)
      : isCorrect
        ? currentProficiency
        : getDowngradedProficiency(currentProficiency)
  );
  const nextRevisionTime = shouldAdvance
    ? getNextRevisionTime(entry.last_time, resolvedProficiency)
    : existing?.next_revision_time ?? getNextRevisionTime(entry.last_time, resolvedProficiency);

  const record: CompletedQuestionRecord = {
    id: existing?.id,
    question_name: entry.question_name,
    options: entry.options,
    correct_answer: entry.correct_answer,
    selected_answer: entry.selected_answer ?? null,
    correct: entry.correct ?? 0,
    last_time: entry.last_time,
    next_revision_time: nextRevisionTime,
    proficiency: resolvedProficiency,
    quiz_title: entry.quiz_title,
    hash,
  };

  if (existing?.id != null) {
    const updatedRecord = { ...record, id: existing.id } as CompletedQuestionRecord;
    await revisionStore.completed_questions.put(updatedRecord);
    return updatedRecord;
  }

  const newId = await revisionStore.completed_questions.add(record);
  return { ...record, id: newId };
}

export async function getCompletedQuestionsByQuiz(quizTitle: string): Promise<CompletedQuestionRecord[]> {
  return revisionStore.completed_questions.where('quiz_title').equals(quizTitle).toArray();
}

export async function getAllCompletedQuestions(): Promise<CompletedQuestionRecord[]> {
  return revisionStore.completed_questions.orderBy('last_time').reverse().toArray();
}

export async function getDueRevisionQuestions(now: string = new Date().toISOString()): Promise<CompletedQuestionRecord[]> {
  return revisionStore.completed_questions.where('next_revision_time').belowOrEqual(now).toArray();
}

export async function exportRevisionData(): Promise<string> {
  const records = await getAllCompletedQuestions();
  return JSON.stringify({
    version: 1,
    exportedAt: new Date().toISOString(),
    records,
  }, null, 2);
}

export async function importRevisionData(json: string): Promise<number> {
  const parsed = JSON.parse(json) as { records?: CompletedQuestionRecord[] };
  const records = Array.isArray(parsed.records) ? parsed.records : [];

  await revisionStore.transaction('rw', revisionStore.completed_questions, async () => {
    await revisionStore.completed_questions.clear();
    for (const record of records) {
      await revisionStore.completed_questions.put(record);
    }
  });

  return records.length;
}
