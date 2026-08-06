export function shouldPromptBeforeNavigation(
  hasUnsavedChanges: boolean,
  currentPage: string,
  nextPage: string
): boolean {
  return hasUnsavedChanges && currentPage === 'roadmap' && nextPage !== 'roadmap';
}
