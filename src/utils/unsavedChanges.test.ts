import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldPromptBeforeNavigation } from './unsavedChanges';

test('prompts when leaving the roadmap page with unsaved changes', () => {
  assert.equal(shouldPromptBeforeNavigation(true, 'roadmap', 'lessons'), true);
});

test('does not prompt when staying on the same page', () => {
  assert.equal(shouldPromptBeforeNavigation(true, 'roadmap', 'roadmap'), false);
});

test('does not prompt when there are no unsaved changes', () => {
  assert.equal(shouldPromptBeforeNavigation(false, 'roadmap', 'lessons'), false);
});
