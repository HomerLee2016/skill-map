// src/components/AnswerQuestion.tsx
import React, { useMemo, useEffect, useRef } from 'react';
import { getAudioSource } from '../utils/audioProxy';

interface Question {
  question_number: number;
  question: string;
  options: string[];
  correct_answer: string;
  audio_track_url?: string;
  displayQuestionNumber?: number;
  explanation?: string | null;
}

interface Props {
  q: Question;
  answers: Record<number, string>;
  correctMap: Record<number, boolean>;
  handleAnswerSelect: (question: any, selectedOption: string) => void;
  onNextQuestion?: () => void;
  showNextButton?: boolean;
  autoAdvanceOnCorrect?: boolean;
  onAutoAdvanceChange?: (value: boolean) => void;
  showAutoAdvanceToggle?: boolean;
  onAudioPlaybackStart?: () => void;
  onAudioPlaybackEnd?: () => void;
  onAudioPlaybackError?: () => void;
}

export function shouldAutoAdvanceOnCorrect({
  hasAnswered,
  isCorrectAnswer,
  autoAdvanceOnCorrect,
}: {
  hasAnswered: boolean;
  isCorrectAnswer: boolean;
  autoAdvanceOnCorrect?: boolean;
}) {
  return hasAnswered && isCorrectAnswer && !!autoAdvanceOnCorrect;
}

export function shouldShowNextButton({
  hasAnswered,
  isCorrectAnswer,
  autoAdvanceOnCorrect,
  showNextButton,
}: {
  hasAnswered: boolean;
  isCorrectAnswer: boolean;
  autoAdvanceOnCorrect?: boolean;
  showNextButton?: boolean;
}) {
  return !!hasAnswered && !!showNextButton && (!isCorrectAnswer || !autoAdvanceOnCorrect);
}

export function shouldShowAutoAdvanceToggle(showAutoAdvanceToggle?: boolean) {
  return showAutoAdvanceToggle !== false;
}

// Fisher-Yates shuffle returning a new array
function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const AnswerQuestion: React.FC<Props> = ({
  q,
  answers,
  correctMap,
  handleAnswerSelect,
  onNextQuestion,
  showNextButton,
  autoAdvanceOnCorrect,
  onAutoAdvanceChange,
  showAutoAdvanceToggle,
  onAudioPlaybackStart,
  onAudioPlaybackEnd,
  onAudioPlaybackError,
}) => {
  // Shuffle once per question instance, and recompute when the question content changes.
  const shuffledOptions = useMemo(() => shuffleArray(q.options), [q.question, q.correct_answer, q.options.join('\u0000')]);
  const hasAnswered = !!answers[q.question_number];
  const isCorrectAnswer = hasAnswered && correctMap[q.question_number];
  const shouldShowManualNext = shouldShowNextButton({
    hasAnswered,
    isCorrectAnswer,
    autoAdvanceOnCorrect,
    showNextButton,
  });
  const showToggle = shouldShowAutoAdvanceToggle(showAutoAdvanceToggle);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const prevHasAnsweredRef = useRef<boolean>(hasAnswered);
  const audioSource = useMemo(() => q.audio_track_url ? getAudioSource(q.audio_track_url) : undefined, [q.audio_track_url]);
  // Play audio after the user answers (if audio exists)
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      prevHasAnsweredRef.current = hasAnswered;
      return undefined;
    }

    const handleEnded = () => {
      console.log('[Audio] Playback ended for question', q.question_number);
      onAudioPlaybackEnd?.();
    };

    const handleError = () => {
      console.log('[Audio] Playback error for question', q.question_number);
      onAudioPlaybackError?.();
    };

    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    // Start playback only once after answer
    if (hasAnswered && audioSource && !prevHasAnsweredRef.current) {
      console.log('[Audio] Starting playback after answer for question', q.question_number);
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        void playPromise
          .then(() => {
            console.log('[Audio] Playback started for question', q.question_number);
            onAudioPlaybackStart?.();
          })
          .catch(() => {
            console.log('[Audio] Playback failed for question', q.question_number);
            onAudioPlaybackError?.();
          });
      }
    }

    // Update flag for next render
    prevHasAnsweredRef.current = hasAnswered;

    return () => {
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
    };
  }, [hasAnswered, audioSource, q.question_number, onAudioPlaybackEnd, onAudioPlaybackError, onAudioPlaybackStart]);

  return (
    <div className="test-question">
      <div className="test-question__legend">
        <span className="test-question__prompt">{q.question}</span>
      </div>
      {shuffledOptions.map((opt) => {
        const chosen = answers[q.question_number] === opt;
        const isCorrect = correctMap[q.question_number];
        let className = 'option-box';
        if (chosen) {
          className += isCorrect ? ' correct' : ' incorrect';
        } else if (answers[q.question_number] && opt === q.correct_answer) {
          className += ' correct';
        }
        const disabled = !!answers[q.question_number];
        return (
          <div
            key={opt}
            className={className}
            onClick={() => !disabled && handleAnswerSelect(q, opt)}
            role="button"
          >
            <span>{opt}</span>
          </div>
        );
      })}
      {hasAnswered && q.explanation && (
        <div className="test-question__explanation">
          <div className="test-question__explanation-title">Explanation:</div>
          <div className="test-question__explanation-body">{q.explanation}</div>
        </div>
      )}
      {q.audio_track_url && (
        <div className="test-question__audio-player">
          <audio
            ref={audioRef}
            controls
            preload="metadata"
            src={audioSource}
            aria-label="Question audio playback"
            style={hasAnswered ? {} : { display: 'none' }}
          >
            Your browser does not support the audio element.
          </audio>
        </div>
      )}
      <div className="test-question__footer">
        {showToggle && (
          <label className="toggle-switch test-question__toggle">
            <span className="test-question__toggle-label">Auto-next on correct</span>
            <span className={`toggle-track ${autoAdvanceOnCorrect ? 'toggle-track--on' : ''}`} aria-hidden="true">
              <span className="toggle-knob" />
            </span>
            <input
              type="checkbox"
              checked={!!autoAdvanceOnCorrect}
              onChange={(event) => onAutoAdvanceChange?.(event.target.checked)}
              className="toggle-input"
            />
          </label>
        )}
        {hasAnswered && shouldShowManualNext && onNextQuestion && (
          <button type="button" className="toolbar-btn test-question__next-button" onClick={onNextQuestion}>
            Next Question
          </button>
        )}
      </div>
    </div>
  );
};

export default AnswerQuestion;
