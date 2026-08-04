import test from 'node:test';
import assert from 'node:assert/strict';
import { handleWorkspaceTriggerClick } from './workspaceTrigger';

test('refreshes workspace history counts when the workspace trigger is clicked', async () => {
  let toggleCount = 0;
  let refreshCount = 0;

  const toggleMenu = () => {
    toggleCount += 1;
  };

  const refreshWorkspaceHistoryCounts = async () => {
    refreshCount += 1;
  };

  await handleWorkspaceTriggerClick({ toggleMenu, refreshWorkspaceHistoryCounts });

  assert.equal(toggleCount, 1);
  assert.equal(refreshCount, 1);
});
