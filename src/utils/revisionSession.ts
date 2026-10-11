export function calcTotalStars(rows: any[]): number {
  return rows.reduce((sum, row) => {
    const level = parseInt(row.proficiency, 10);
    return sum + (isNaN(level) ? 0 : level);
  }, 0);
}

export function countStarLevels(rows: any[]): Record<number, number> {
  const starCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  rows.forEach((row) => {
    const level = parseInt(row.proficiency, 10);
    if (level >= 1 && level <= 5) {
      starCounts[level] = (starCounts[level] || 0) + 1;
    }
  });
  return starCounts;
}

export function getNextRevisionIso(rows: any[]): string | null {
  const times = rows
    .map((row) => row.next_revision_time)
    .filter((t) => !!t) as string[];
  if (times.length === 0) return null;
  // ISO strings can be compared lexicographically
  return times.reduce((a, b) => (a < b ? a : b));
}

export function buildRevisionQuestions(rows: any[]): any[] {
  return rows.map((row: any, index: number) => ({
    record_id: row.id,
    question_number: index + 1,
    displayQuestionNumber: index + 1,
    question: row.question_name,
    options: row.options,
    correct_answer: row.correct_answer,
    proficiency: row.proficiency,
    quiz_title: row.quiz_title,
    explanation: row.explanation,
    audio_track_url: row.audio_track_url,
  }));
}

export function upsertCompletedRow(prev: any[], row: any): any[] {
  if (prev.some((existing) => existing.id === row.id)) {
    return prev.map((existing) => (existing.id === row.id ? { ...existing, ...row } : existing));
  }
  return [row, ...prev];
}
