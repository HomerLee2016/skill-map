import test from 'node:test';
import assert from 'node:assert/strict';
import { createAudioAutoAdvanceManager } from './useAudioAutoAdvance';

test('scheduleAutoAdvance uses the fallback timeout when audio is not playing', async () => {
  let timeoutCallback: (() => void) | null = null;
  const fakeSetTimeout = (cb: () => void) => {
    timeoutCallback = cb;
    return 1 as const;
  };
  const fakeClearTimeout = () => {
    timeoutCallback = null;
  };

  const manager = createAudioAutoAdvanceManager({
    setTimeoutFn: fakeSetTimeout,
    clearTimeoutFn: fakeClearTimeout,
  });

  let fired = false;
  manager.scheduleAutoAdvance(() => {
    fired = true;
  });

  assert.equal(typeof timeoutCallback, 'function');
  timeoutCallback?.();
  assert.equal(fired, true);
});

test('handleAudioPlaybackEnd continues pending auto-advance after audio ends', async () => {
  let firstTimeout: (() => void) | null = null;
  let secondTimeout: (() => void) | null = null;
  let timeoutCount = 0;
  const fakeSetTimeout = (cb: () => void) => {
    timeoutCount += 1;
    if (timeoutCount === 1) {
      firstTimeout = cb;
    } else {
      secondTimeout = cb;
    }
    return timeoutCount as const;
  };
  const fakeClearTimeout = () => {
    firstTimeout = null;
    secondTimeout = null;
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

  firstTimeout?.();
  assert.equal(fired, false, 'First timer should defer if audio is playing');
  assert.equal(secondTimeout, null, 'Second timer should not be scheduled before audio end');

  manager.handleAudioPlaybackEnd();
  assert.equal(fired, false, 'Callback should not fire until the second timer runs');
  assert.equal(secondTimeout !== null, true, 'Second timer should be scheduled after audio end');

  secondTimeout?.();
  assert.equal(fired, true);
});

test('auto-advance waits for long audio playback before continuing', async () => {
  let firstTimeout: (() => void) | null = null;
  let secondTimeout: (() => void) | null = null;
  let timeoutCount = 0;
  const fakeSetTimeout = (cb: () => void) => {
    timeoutCount += 1;
    if (timeoutCount === 1) {
      firstTimeout = cb;
    } else {
      secondTimeout = cb;
    }
    return timeoutCount as const;
  };
  const fakeClearTimeout = () => {
    firstTimeout = null;
    secondTimeout = null;
  };

  const manager = createAudioAutoAdvanceManager({
    setTimeoutFn: fakeSetTimeout,
    clearTimeoutFn: fakeClearTimeout,
  });

  let fired = false;
  manager.scheduleAutoAdvance(() => {
    fired = true;
  }, true);

  assert.equal(firstTimeout !== null, true);
  firstTimeout?.();
  assert.equal(fired, false, 'Should not fire during long audio playback');
  assert.equal(secondTimeout, null, 'Should not schedule the followup timer until audio ends');

  manager.handleAudioPlaybackStart();
  manager.handleAudioPlaybackEnd();
  assert.equal(secondTimeout !== null, true, 'Should schedule followup timer when long audio ends');
  assert.equal(fired, false, 'Callback should still be pending after long audio ends');

  secondTimeout?.();
  assert.equal(fired, true);
});
