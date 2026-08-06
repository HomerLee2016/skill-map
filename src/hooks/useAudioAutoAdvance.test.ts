import test from 'node:test';
import assert from 'node:assert/strict';
import { createAudioAutoAdvanceManager } from './useAudioAutoAdvance';

test('handleAudioPlaybackEnd does not advance early if audio finishes before 1.5s timer', async () => {
  let firstTimeout: (() => void) | null = null;
  let timeoutCount = 0;
  const fakeSetTimeout = (cb: () => void) => {
    timeoutCount += 1;
    firstTimeout = cb;
    return timeoutCount as const;
  };
  const fakeClearTimeout = () => {
    firstTimeout = null;
  };

  const manager = createAudioAutoAdvanceManager({
    setTimeoutFn: fakeSetTimeout,
    clearTimeoutFn: fakeClearTimeout,
  });

  let fired = false;
  manager.scheduleAutoAdvance(() => {
    fired = true;
  }, true);

  manager.handleAudioPlaybackStart();
  assert.equal(firstTimeout !== null, true);

  manager.handleAudioPlaybackEnd();
  assert.equal(fired, false, 'Callback should not fire immediately when short audio ends');

  firstTimeout?.();
  assert.equal(fired, true, 'Callback fires when 1.5s timer completes');
});
