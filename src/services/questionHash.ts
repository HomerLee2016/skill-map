/** Identity of a question in revision records: its text plus options, so editing either makes a "new" question. */
export function createQuestionHash(questionName: string, options: string[]): string {
  const encoder = new TextEncoder();
  const data = encoder.encode(`${questionName}:${options.join('|')}`);
  return Array.from(data, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
