import { useEffect, useRef, useState } from 'react';
import { CategorySection } from './components/ContentTreeSidebar';
import AnswerQuestion from './components/AnswerQuestion';
import QuestionTracker from './components/QuestionTracker';
import { useWorkspace } from './contexts/WorkspaceContext';
import { getInitialTestsStructure } from './utils/contentCatalog';
import {
  exportRevisionData,
  formatRevisionTimestamp,
  getAllCompletedQuestions,
  getDueRevisionQuestions,
  getDowngradedProficiency,
  getNextProficiency,
  importRevisionData,
  insertCompletedQuestion,
  normalizeProficiency,
} from './utils/revision';

async function saveQuestionResult(payload: {
  question_name: string;
  options: string[];
  correct_answer: string;
  selected_answer: string;
  correct: number;
  explanation?: string | null;
  last_time: string;
  proficiency?: string;
  quiz_title: string;
  question_id?: number;
}) {
  await insertCompletedQuestion(payload);
}

function Revision() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { selectedDirectoryHandle, workspaceSelectionLabel, workspaceVersion } = useWorkspace();
  useState(getInitialTestsStructure);
  useState<string | null>(null);
  const [completedRows, setCompletedRows] = useState<any[]>([]);
  const [revisionMode, setRevisionMode] = useState(false);
  const [revisionQuestions, setRevisionQuestions] = useState<any[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [correctMap, setCorrectMap] = useState<Record<number, boolean>>({});
  const [currentIdx, setCurrentIdx] = useState(0);
  const [finished, setFinished] = useState(false);
  const [score, setScore] = useState(0);
  const [dueCount, setDueCount] = useState(0);
  const [showSummary, setShowSummary] = useState(true);
  const [backupCompleted, setBackupCompleted] = useState(false);

  const totalQuestions = revisionQuestions.length;
  const isLastQuestion = currentIdx + 1 >= totalQuestions;

  const fetchCompleted = async () => {
    try {
      const data = await getAllCompletedQuestions();
      setCompletedRows(data);
    } catch (error) {
      console.error(error);
    }
  };

  const fetchDueCount = async () => {
    try {
      const data = await getDueRevisionQuestions();
      setDueCount(data.length);
      return data.length;
    } catch (error) {
      console.error(error);
      return 0;
    }
  };

  useEffect(() => {
    setCompletedRows([]);
    setRevisionQuestions([]);
    setAnswers({});
    setCorrectMap({});
    setCurrentIdx(0);
    setFinished(false);
    setScore(0);
    setDueCount(0);
    setShowSummary(true);
    setBackupCompleted(false);
  }, [workspaceVersion]);

  useEffect(() => {
    void fetchCompleted();
    void fetchDueCount();
  }, [workspaceVersion, selectedDirectoryHandle?.name, workspaceSelectionLabel]);

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
      const revQuestions = data.map((row: any, index: number) => ({
        record_id: row.id,
        question_number: index + 1,
        displayQuestionNumber: index + 1,
        question: row.question_name,
        options: row.options,
        correct_answer: row.correct_answer,
        proficiency: row.proficiency,
        quiz_title: row.quiz_title,
        explanation: row.explanation,
      }));
      setRevisionQuestions(revQuestions);
      setRevisionMode(true);
      setShowSummary(false);
      setCurrentIdx(0);
      setFinished(false);
      setScore(0);
      setAnswers({});
      setCorrectMap({});
      setBackupCompleted(false);
    } catch (error) {
      console.error(error);
    }
  };

  const advanceToNextQuestion = () => {
    if (currentIdx + 1 < totalQuestions) {
      setCurrentIdx((value) => value + 1);
    } else {
      setFinished(true);
    }
  };

  const handleAnswerSelect = async (question: any, option: string) => {
    const isCorrect = option === question.correct_answer;
    const currentProficiency = question.proficiency ?? '1.1';
    const nextProficiency = isCorrect ? getNextProficiency(currentProficiency) : getDowngradedProficiency(currentProficiency);
    const existingRow = completedRows.find((row: any) => row.id === question.record_id);
    const quizTitle = existingRow?.quiz_title || question.quiz_title || 'Revision';
    setAnswers((prev) => ({ ...prev, [question.question_number]: option }));
    setCorrectMap((prev) => ({ ...prev, [question.question_number]: isCorrect }));

    try {
      await saveQuestionResult({
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
      });

      setCompletedRows((prev) => {
        const optimisticRow = {
          id: question.record_id,
          question_name: question.question,
          correct_answer: question.correct_answer,
          quiz_title: quizTitle,
          proficiency: nextProficiency,
          explanation: question.explanation,
          last_time: new Date().toISOString(),
          correct: isCorrect ? 1 : 0,
        };

        const exists = prev.some((row: any) => row.id === question.record_id);
        if (exists) {
          return prev.map((row: any) => (row.id === question.record_id ? { ...row, ...optimisticRow } : row));
        }

        return [optimisticRow, ...prev];
      });
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
      setTimeout(() => {
        advanceToNextQuestion();
      }, 1000);
    } else if (isLastQuestion) {
      setTimeout(() => {
        setFinished(true);
      }, 0);
    }
  };

  return (
    <div className="tests-page">
      <aside className="tests-sidebar">
        <div className="tests-sidebar-header">
          <div className="tests-sidebar-title">Revision</div>
        </div>
        <CategorySection title="Revision Actions">
          <div className="revision-action-list">
            <button type="button" className="toolbar-btn toolbar-btn--full" onClick={async () => {
              setShowSummary(true);
              setRevisionMode(false);
              setFinished(false);
              await fetchCompleted();
              await fetchDueCount();
            }}>
              Learnt Summary
            </button>
            <button type="button" className="toolbar-btn toolbar-btn--full" onClick={() => { void startRevision(); }}>
              Start Revision
            </button>
          </div>
        </CategorySection>

      </aside>

      <div className="tests-content">
        {showSummary && !revisionMode ? (
          <div className="revision-page-shell">
            <div className="revision-header-card">
              <div>
                <h1>Revision</h1>
                <p>You have {dueCount} question{dueCount !== 1 ? 's' : ''} due for review.</p>
              </div>
              <button type="button" className="toolbar-btn" onClick={() => { void startRevision(); }}>
                Start revision
              </button>
            </div>
            <div className="summary-table-wrapper">
              <div className="summary-table-header">
                <div>
                  <h2>Learnt Summary</h2>
                </div>
                <div className="summary-table-header-buttons">
                  <button
                    type="button"
                    className="toolbar-btn"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Import Revision Data
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/json"
                    style={{ display: 'none' }}
                    onChange={async (event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      try {
                        const text = await file.text();
                        const imported = await importRevisionData(text);
                        await fetchCompleted();
                        await fetchDueCount();
                        window.alert(`Imported ${imported} revision records.`);
                      } catch (error) {
                        console.error(error);
                        window.alert('Failed to import revision data.');
                      } finally {
                        event.target.value = '';
                      }
                    }}
                  />
                  <button type="button" className="toolbar-btn" onClick={async () => {
                    try {
                      const data = await exportRevisionData();
                      const blob = new Blob([data], { type: 'application/json' });
                      const url = URL.createObjectURL(blob);
                      const link = document.createElement('a');
                      link.href = url;
                      link.download = `revision-data-${formatRevisionTimestamp()}.json`;
                      link.click();
                      URL.revokeObjectURL(url);
                    } catch (error) {
                      console.error(error);
                      window.alert('Failed to export revision data.');
                    }
                  }}>
                    Export Revision Data
                  </button>
                </div>
              </div>
              <table className="summary-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Test</th>
                    <th>Question</th>
                    <th>Correct Answer</th>
                    <th>Proficiency</th>
                    <th>Next Revision Time</th>
                  </tr>
                </thead>
                <tbody>
                  {completedRows.map((row: any) => (
                    <tr key={row.id}>
                      <td>{row.id}</td>
                      <td>{row.quiz_title}</td>
                      <td>{row.question_name}</td>
                      <td>{row.correct_answer}</td>
                      <td>
                        <span className="revision-proficiency-badge">
                          {normalizeProficiency(row.proficiency)}
                        </span>
                      </td>
                      <td>{row.next_revision_time}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : revisionMode ? (
          <div className="test-question-container">
            {revisionQuestions.length === 0 ? (
              <div className="tests-score">
                <p>No questions are due for review right now. Come back later.</p>
              </div>
            ) : (
              <>
                <QuestionTracker
                  totalQuestions={revisionQuestions.length}
                  answers={answers}
                  correctMap={correctMap}
                  currentIndex={currentIdx}
                  limit={15}
                  disabled
                  questionNumbers={revisionQuestions.map((question) => question.displayQuestionNumber ?? question.question_number)}
                  slidingWindow
                />
                {revisionQuestions.slice(currentIdx, currentIdx + 1).map((q) => (
                  <AnswerQuestion
                    key={`${q.question_number}-${q.question}`}
                    q={q}
                    answers={answers}
                    correctMap={correctMap}
                    handleAnswerSelect={handleAnswerSelect}
                    onNextQuestion={advanceToNextQuestion}
                    showNextButton={!!answers[q.question_number] && !finished && !isLastQuestion}
                  />
                ))}
                {finished && (
                  <div className="tests-score">
                    <p>Finished! Score: {score} / {totalQuestions}</p>
                  </div>
                )}
              </>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default Revision;
