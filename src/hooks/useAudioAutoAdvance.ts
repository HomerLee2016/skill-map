import { useEffect, useRef } from 'react';

export interface AudioAutoAdvanceControls {
  scheduleAutoAdvance: (callback: () => void, pendingAudio?: boolean) => void;
  handleAudioPlaybackStart: () => void;
  handleAudioPlaybackEnd: () => void;
  handleAudioPlaybackError: () => void;
}

export interface AudioAutoAdvanceManagerOptions {
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
}

type AudioAutoAdvanceManager = AudioAutoAdvanceControls & {
  dispose: () => void;
};

export function createAudioAutoAdvanceManager({
  setTimeoutFn = globalThis.setTimeout.bind(globalThis),
  clearTimeoutFn = globalThis.clearTimeout.bind(globalThis),
}: AudioAutoAdvanceManagerOptions = {}): AudioAutoAdvanceManager {
  type TimerId = ReturnType<typeof setTimeout>;
  let advanceTimer: TimerId | null = null;
  let audioPlaying = false;
  let audioPending = false;
  let audioEndedBeforeTimer = false;
  let waitForAudioEnd = false;
  let autoAdvanceCallback: (() => void) | null = null;

  const clearAdvanceTimer = () => {
    if (advanceTimer != null) {
      clearTimeoutFn(advanceTimer);
      advanceTimer = null;
    }
  };

  const scheduleAutoAdvance = (callback: () => void, pendingAudio = false) => {
    autoAdvanceCallback = callback;
    clearAdvanceTimer();
    waitForAudioEnd = false;
    audioEndedBeforeTimer = false;
    audioPending = pendingAudio;
    advanceTimer = setTimeoutFn(() => {
      if (audioPlaying || audioPending) {
        waitForAudioEnd = true;
        audioPending = false;
        advanceTimer = null;
        return;
      }

      if (audioEndedBeforeTimer) {
        waitForAudioEnd = false;
        audioEndedBeforeTimer = false;
        advanceTimer = setTimeoutFn(() => {
          autoAdvanceCallback = null;
          callback();
        }, 500);
        return;
      }

      autoAdvanceCallback = null;
      callback();
    }, 1500);
  };

  const handleAudioPlaybackStart = () => {
    audioPlaying = true;
    audioPending = false;
  };

  const handleAudioPlaybackEnd = () => {
    audioPlaying = false;

    if (waitForAudioEnd) {
      clearAdvanceTimer();
      const callback = autoAdvanceCallback;
      if (callback) {
        waitForAudioEnd = false;
        advanceTimer = setTimeoutFn(() => {
          autoAdvanceCallback = null;
          callback();
        }, 500);
      }
      return;
    }

    if (advanceTimer != null) {
      audioPending = false;
      audioEndedBeforeTimer = true;
    }
  };

  const handleAudioPlaybackError = () => {
    audioPlaying = false;
  };

  const dispose = () => {
    clearAdvanceTimer();
    autoAdvanceCallback = null;
  };

  return {
    scheduleAutoAdvance,
    handleAudioPlaybackStart,
    handleAudioPlaybackEnd,
    handleAudioPlaybackError,
    dispose,
  };
}

export function useAudioAutoAdvance(resetDeps: readonly unknown[] = []): AudioAutoAdvanceControls {
  const managerRef = useRef<AudioAutoAdvanceManager | null>(null);
  if (managerRef.current === null) {
    managerRef.current = createAudioAutoAdvanceManager();
  }

  useEffect(() => {
    return () => {
      managerRef.current?.dispose();
      managerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...resetDeps]);

  return managerRef.current;
}
