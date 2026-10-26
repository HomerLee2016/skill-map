import { useEffect, useRef, useState } from 'react';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { exportRevisionData, getDueRevisionQuestions, insertCompletedQuestion } from '../services/revisionDb';
import { formatRevisionTimestamp, getDowngradedProficiency, getNextProficiency } from '../utils/proficiency';
import { buildRevisionQuestions, upsertCompletedRow } from '../utils/revisionSession';
import { useAudioAutoAdvance } from './useAudioAutoAdvance';

interface RevisionSessionDeps {
  completedRows: any[];
  setCompletedRows: React.Dispatch<React.SetStateAction<any[]>>;
  fetchCompleted: () => Promise<void>;
  fetchDueCount: () => Promise<number>;
}

export function useRevisionSession({ completedRows, setCompletedRows, fetchCompleted, fetchDueCount }: RevisionSessionDeps) {
  const { selectedDirectoryHandle, workspaceVersion } = useWorkspace();
  const [revisionMode, setRevisionMode] = useState(false);
  const [revisionQuestions, setRevisionQuestions] = useState<any[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [correctMap, setCorrectMap] = useState<Record<number, boolean>>({});
  const [currentIdx, setCurrentIdx] = useState(0);
  const { scheduleAutoAdvance, handleAudioPlaybackStart, handleAudioPlaybackEnd, handleAudioPlaybackError, resetAutoAdvance } = useAudioAutoAdvance();
  const prevIdxRef = useRef<number>(currentIdx);
  useEffect(() => {
    if (prevIdxRef.current !== currentIdx) {
      // User changed question manually; stop any pending auto‑advance.
      resetAutoAdvance();
    }
    prevIdxRef.current = currentIdx;
  }, [currentIdx, resetAutoAdvance]);
  const [finished, setFinished] = useState(false);
  const [showIncorrectReview, setShowIncorrectReview] = useState(false);
  const [score, setScore] = useState(0);
  const [autoAdvanceOnCorrect, setAutoAdvanceOnCorrect] = useState(true);
  const [audioTrackEnabled, setAudioTrackEnabled] = useState(true);
  const [showSummary, setShowSummary] = useState(true);
  const [backupCompleted, setBackupCompleted] = useState(false);

  // A session belongs to one workspace's records; leaving it for another workspace starts from the summary.
  useEffect(() => {
    setRevisionMode(false);
    setRevisionQuestions([]);
    setAnswers({});
    setCorrectMap({});
    setCurrentIdx(0);
    setFinished(false);
    setShowIncorrectReview(false);
    setScore(0);
    setShowSummary(true);
    setBackupCompleted(false);
  }, [workspaceVersion]);

  const totalQuestions = revisionQuestions.length;
  const isLastQuestion = currentIdx + 1 >= totalQuestions;

  const saveRevisionBackup = async () => {
    if (!selectedDirectoryHandle || backupCompleted) {
      return;
    }

    try {
      const data = await exportRevisionData();
      const revisionDirectory = await selectedDirectoryHandle.getDirectoryHandle('revision', { create: true });
      const fileName = `revision-data-${formatRevisionTimestamp()}.json`;
      const fileHandle = await revisionDirectory.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(data);
      await writable.close();
      setBackupCompleted(true);
    } catch (error) {
      console.error('Failed to save revision backup', error);
    }
  };

  const startRevision = async () => {
    try {
      const data = await getDueRevisionQuestions();
      setRevisionQuestions(buildRevisionQuestions(data));
      setRevisionMode(true);
      setShowSummary(false);
      setCurrentIdx(0);
      setFinished(false);
      setShowIncorrectReview(false);
      setScore(0);
      setAnswers({});
      setCorrectMap({});
      setBackupCompleted(false);
    } catch (error) {
      console.error(error);
    }
  };

  const showLearntSummary = async () => {
    setShowSummary(true);
    setRevisionMode(false);
    setFinished(false);
    await fetchCompleted();
    await fetchDueCount();
  };

  const finishIncorrectReview = () => {
    setShowIncorrectReview(false);
    setFinished(false);
    setCurrentIdx(0);
    setAnswers({});
    setCorrectMap({});
    setScore(0);
    setShowSummary(true);
    setRevisionMode(false);
  };

  const startIncorrectReview = () => {
    setShowIncorrectReview(true);
    setFinished(false);
    setCurrentIdx(0);
  };

  const advanceToNextQuestion = () => {
    if (currentIdx + 1 < totalQuestions) {
      setCurrentIdx((value) => value + 1);
    } else {
      setFinished(true);
    }
  };

  const jumpToQuestion = (index: number) => {
    if (index < 0 || index >= totalQuestions || index === currentIdx) return;
    resetAutoAdvance();
    setCurrentIdx(index);
  };

  const handleNextQuestionOrFinish = () => {
    if (isLastQuestion && !autoAdvanceOnCorrect) {
      setFinished(true);
      return;
    }

    advanceToNextQuestion();
  };

  const handleAnswerSelect = async (question: any, option: string) => {
    const isCorrect = option === question.correct_answer;
    const currentProficiency = question.proficiency ?? '1.1';
    const nextProficiency = isCorrect ? getNextProficiency(currentProficiency) : getDowngradedProficiency(currentProficiency);
    const existingRow = completedRows.find((row: any) => row.id === question.record_id);
    const quizTitle = existingRow?.quiz_title || question.quiz_title || 'Revision';
    const audioTrackUrl = question.audio_track_url ?? existingRow?.audio_track_url;
    setAnswers((prev) => ({ ...prev, [question.question_number]: option }));
    setCorrectMap((prev) => ({ ...prev, [question.question_number]: isCorrect }));

    try {
      await insertCompletedQuestion({
        question_name: question.question,
        options: question.options,
        correct_answer: question.correct_answer,
        selected_answer: option,
        correct: isCorrect ? 1 : 0,
        explanation: question.explanation,
        last_time: new Date().toISOString(),
        proficiency: currentProficiency,
        quiz_title: quizTitle,
        question_id: question.record_id,
        audio_track_url: audioTrackUrl,
      });

      const optimisticRow = {
        id: question.record_id,
        question_name: question.question,
        correct_answer: question.correct_answer,
        quiz_title: quizTitle,
        proficiency: nextProficiency,
        explanation: question.explanation,
        last_time: new Date().toISOString(),
        correct: isCorrect ? 1 : 0,
        audio_track_url: audioTrackUrl,
      };
      setCompletedRows((prev) => upsertCompletedRow(prev, optimisticRow));
      await fetchCompleted();
      const nextDueCount = await fetchDueCount();
      if (!backupCompleted && isLastQuestion && nextDueCount === 0) {
        await saveRevisionBackup();
      }
    } catch (error) {
      console.error('Failed to save question result', error);
    }

    if (isCorrect) {
      setScore((value) => value + 1);
      if (autoAdvanceOnCorrect) {
        scheduleAutoAdvance(
          () => {
            if (isLastQuestion) {
              setFinished(true);
            } else {
              advanceToNextQuestion();
            }
          },
          !!(question.audio_track_url && audioTrackEnabled),
        );
      }
    } else if (isLastQuestion) {
      setTimeout(() => {
        setFinished(true);
      }, 0);
    }
  };

  return {
    revisionMode, revisionQuestions, answers, correctMap, currentIdx, finished, showIncorrectReview, score,
    autoAdvanceOnCorrect, setAutoAdvanceOnCorrect, audioTrackEnabled, setAudioTrackEnabled, showSummary,
    totalQuestions, isLastQuestion,
    handleAudioPlaybackStart, handleAudioPlaybackEnd, handleAudioPlaybackError,
    startRevision, showLearntSummary, finishIncorrectReview, startIncorrectReview,
    jumpToQuestion, handleNextQuestionOrFinish, handleAnswerSelect,
  };
}
