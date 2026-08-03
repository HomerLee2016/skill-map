export function countCorrectAnswers(correctMap: Record<number, boolean>): number {
  return Object.values(correctMap).filter(Boolean).length;
}
