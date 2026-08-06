import { useEffect, useRef } from 'react';

export interface AudioAutoAdvanceControls {
  scheduleAutoAdvance: (callback: () => void, expectsAudio?: boolean) => void;
  handleAudioPlaybackStart: () => void;
  handleAudioPlaybackEnd: () => void;
  handleAudioPlaybackError: () => void;
  resetAutoAdvance: () => void;
}

export interface AudioAutoAdvanceManagerOptions {
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
}

type TimerId = ReturnType<typeof setTimeout>;

/**
 * Manager used by the hook and also exported for unit tests.
 */
export function createAudioAutoAdvanceManager({
  setTimeoutFn = globalThis.setTimeout.bind(globalThis),
  clearTimeoutFn = globalThis.clearTimeout.bind(globalThis),
}: AudioAutoAdvanceManagerOptions = {}): AudioAutoAdvanceControls & { dispose: () => void } {
  let advanceTimer: TimerId | null = null;
  let expectsAudio = false;
  // Indicates whether audio playback has begun at least once.
  let audioSeen = false;
  let audioPlaying = false;
  let autoAdvanceCallback: (() => void) | null = null;

  const clearAdvanceTimer = () => {
    if (advanceTimer !== null) {
      clearTimeoutFn(advanceTimer);
      advanceTimer = null;
    }
  };

  // Configurable values – can be tweaked if needed.
  const POLL_INTERVAL = 500; // 0.5 s
  const MAX_WAIT_TIME = 10000; // 10 s fallback
  const MIN_WAIT_TIME = 1500; // 2 s

  const scheduleAutoAdvance = (callback: () => void, expectsAudioParam = false) => {
    expectsAudio = expectsAudioParam;
    // If audio is already playing, mark it as seen.
    audioSeen = audioPlaying;
    // Do not reset audioPlaying here; keep the current playback state.
    autoAdvanceCallback = callback;
    clearAdvanceTimer();



    const startTime = Date.now();
    const poll = () => {
      const elapsed = Date.now() - startTime;
  
        if (expectsAudio) {
          // Wait until we have observed audio start (audioSeen) or timeout.
          if (!audioSeen) {
            if (elapsed >= MAX_WAIT_TIME) {
          
              expectsAudio = false;
              const cb = autoAdvanceCallback;
              autoAdvanceCallback = null;
              if (cb) cb();
              return;
            }
            // Still waiting for audio to start.
            advanceTimer = setTimeoutFn(poll, POLL_INTERVAL);
            return;
          }
          // Audio has started; wait for it to finish.
          if (!audioPlaying) {
            const cb = autoAdvanceCallback;
            autoAdvanceCallback = null;
            if (cb) cb();
            return;
          }
          // Audio still playing; enforce max wait.
          if (elapsed >= MAX_WAIT_TIME) {
        
            const cb = autoAdvanceCallback;
            autoAdvanceCallback = null;
            if (cb) cb();
            return;
          }
          // Continue polling.
          advanceTimer = setTimeoutFn(poll, POLL_INTERVAL);
          return;
        }
      
      advanceTimer = setTimeoutFn(poll, POLL_INTERVAL);

      // No audio expected: apply min wait time
      if (elapsed >= MIN_WAIT_TIME) {
        const cb = autoAdvanceCallback;
        autoAdvanceCallback = null;
        if (cb) cb();
        return;
      }
    };

    // Initial poll after the first interval.
    advanceTimer = setTimeoutFn(poll, POLL_INTERVAL);
  };

  const handleAudioPlaybackStart = () => {

    audioPlaying = true;
    audioSeen = true;
  };

  const handleAudioPlaybackEnd = () => {

    audioPlaying = false;
  };

  const handleAudioPlaybackError = () => {

    audioPlaying = false;
    audioSeen = false;
    // Stop waiting for audio start if it never started.
    expectsAudio = false;
  };

  const resetAutoAdvance = () => {
    // Called when user manually changes question while audio is playing.
    // Cancel any pending auto‑advance without invoking the callback.
    expectsAudio = false;
    audioSeen = false;
    audioPlaying = false;
    clearAdvanceTimer();
    autoAdvanceCallback = null;
  };

  const dispose = () => {
    resetAutoAdvance();
  };

  return {
    scheduleAutoAdvance,
    handleAudioPlaybackStart,
    handleAudioPlaybackEnd,
    handleAudioPlaybackError,
    resetAutoAdvance,
    dispose,
  };
}

/** Hook wrapper that creates a manager per resetDeps set. */
export function useAudioAutoAdvance(): AudioAutoAdvanceControls {
  const managerRef = useRef<ReturnType<typeof createAudioAutoAdvanceManager> | null>(null);

  if (managerRef.current === null) {
    managerRef.current = createAudioAutoAdvanceManager();
  }

  useEffect(() => {
    return () => {
      managerRef.current?.dispose();
    };
  }, []);

  return managerRef.current as AudioAutoAdvanceControls;
}
