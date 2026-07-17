import { useEffect, useState } from 'react';
import { tests as availableTests } from './utils/contentCatalog';
import type { TestResultPayload } from './types';

interface TestsProps {
  selectedTestId?: string;
  onSelectedTestIdChange?: (id: string) => void;
}

function Tests({ selectedTestId, onSelectedTestIdChange }: TestsProps) {
  const [activeId, setActiveId] = useState(selectedTestId || availableTests[0]?.id || '');
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [lastScore, setLastScore] = useState<{ score: number; total: number } | null>(null);

  useEffect(() => {
    if (selectedTestId) {
      setActiveId(selectedTestId);
    }
  }, [selectedTestId]);

  const selected = availableTests.find((test) => test.id === activeId);

  const selectTest = (id: string) => {
    setActiveId(id);
    onSelectedTestIdChange?.(id);
    setAnswers({});
    setSubmitted(false);
    setSubmitError(null);
    setLastScore(null);
  };

  const handleSubmit = async () => {
    if (!selected) return;
    const unanswered = selected.questions.filter((q) => !answers[q.question_number]);
    if (unanswered.length > 0) {
      setSubmitError(`Please answer all questions (${unanswered.length} remaining).`);
      return;
    }

    const questionResults = selected.questions.map((q) => {
      const selectedAnswer = answers[q.question_number];
      const correct = selectedAnswer === q.correct_answer;
      return {
        question_number: q.question_number,
        question: q.question,
        selected_answer: selectedAnswer,
        correct_answer: q.correct_answer,
        correct,
      };
    });

    const score = questionResults.filter((r) => r.correct).length;
    const total = questionResults.length;
    const timestamp = new Date().toISOString();

    const payload: TestResultPayload = {
      testId: selected.id,
      quiz_title: selected.title,
      timestamp,
      questions: questionResults,
      score,
      total,
    };

    try {
      const response = await fetch('/api/save-test-result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) {
        throw new Error(result?.error || 'Failed to save test result');
      }
      setSubmitted(true);
      setLastScore({ score, total });
      setSubmitError(null);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Failed to save test result');
    }
  };

  return (
    <div className="tests-page">
      <aside className="tests-sidebar">
        <div className="tests-sidebar-title">Tests</div>
        {availableTests.length === 0 ? (
          <p className="tests-empty">Add YAML test files to <code>src/data/tests/</code>.</p>
        ) : (
          availableTests.map((test) => (
            <button
              key={test.id}
              type="button"
              className={activeId === test.id ? 'tests-item tests-item--selected' : 'tests-item'}
              onClick={() => selectTest(test.id)}
            >
              {test.title}
            </button>
          ))
        )}
      </aside>

      <div className="tests-content">
        {!selected ? (
          <p className="tests-empty">Select a test from the sidebar.</p>
        ) : (
          <>
            <header className="tests-header">
              <h1>{selected.title}</h1>
              <p className="tests-meta">{selected.questions.length} multiple-choice questions</p>
            </header>

            <div className="tests-questions">
              {selected.questions.map((q) => (
                <fieldset key={q.question_number} className="test-question">
                  <legend>
                    {q.question_number}. {q.question}
                  </legend>
                  {q.options.map((option) => (
                    <label key={option} className="test-option">
                      <input
                        type="radio"
                        name={`q-${selected.id}-${q.question_number}`}
                        value={option}
                        checked={answers[q.question_number] === option}
                        disabled={submitted}
                        onChange={() =>
                          setAnswers((prev) => ({ ...prev, [q.question_number]: option }))
                        }
                      />
                      <span>{option}</span>
                    </label>
                  ))}
                </fieldset>
              ))}
            </div>

            {submitError && <div className="tests-error">{submitError}</div>}

            {submitted && lastScore && (
              <div className="tests-score">
                Score: {lastScore.score} / {lastScore.total}
              </div>
            )}

            {!submitted && (
              <button type="button" className="tests-submit-btn" onClick={handleSubmit}>
                Submit Test
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default Tests;
