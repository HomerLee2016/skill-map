import { useEffect, useMemo, useState } from 'react';
import {
  buildNewTestTree,
  buildRevisionTestTree,
  getInitialTestsStructure,
  promptAddFolder,
  promptAssignItem,
  tests as availableTests,
  type StructureTree,
} from './utils/contentCatalog';
import type { TestResultPayload } from './types';
import {
  CategorySection,
  ContentTreeSidebar,
  TreeGlobalActions,
} from './components/ContentTreeSidebar';
import { useExpandCollapseState } from './hooks/useExpandCollapseState';

interface TestsProps {
  selectedTestId?: string;
  onSelectedTestIdChange?: (id: string) => void;
}

async function saveTestsStructure(structure: { revision: StructureTree; new_tests: StructureTree }) {
  const response = await fetch('/api/save-structure', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'tests', structure }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.ok) {
    throw new Error(result?.error || 'Failed to save test structure');
  }
}

function Tests({ selectedTestId, onSelectedTestIdChange }: TestsProps) {
  const [activeId, setActiveId] = useState(selectedTestId || availableTests[0]?.id || '');
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [lastScore, setLastScore] = useState<{ score: number; total: number } | null>(null);
  const [structure, setStructure] = useState(getInitialTestsStructure);
  const [structureError, setStructureError] = useState<string | null>(null);
  const { expandKey, collapseKey, expandAll, collapseAll } = useExpandCollapseState();

  const revisionTree = useMemo(
    () => buildRevisionTestTree(structure.revision),
    [structure.revision]
  );
  const newTestsTree = useMemo(
    () => buildNewTestTree(structure.new_tests, structure.revision),
    [structure.new_tests, structure.revision]
  );

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

  const persist = async (next: { revision: StructureTree; new_tests: StructureTree }) => {
    try {
      await saveTestsStructure(next);
      setStructure(next);
      setStructureError(null);
    } catch (err) {
      setStructureError(err instanceof Error ? err.message : 'Failed to save structure');
    }
  };

  const handleAddFolder = (section: 'revision' | 'new_tests') => {
    const nextSection = promptAddFolder(structure[section]);
    if (nextSection) {
      persist({ ...structure, [section]: nextSection });
    }
  };

  const handleAssignItem = (section: 'revision' | 'new_tests') => {
    const nextSection = promptAssignItem(
      availableTests.map(({ id, title }) => ({ id, title })),
      structure[section],
      'Test'
    );
    if (nextSection) {
      persist({ ...structure, [section]: nextSection });
    }
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
        <div className="tests-sidebar-header">
          <div className="tests-sidebar-title">Tests</div>
        </div>
        <TreeGlobalActions onExpandAll={expandAll} onCollapseAll={collapseAll} />
        <p className="tree-structure-hint">
          Folders are stored in <code>src/data/tests/structure.yaml</code>
        </p>
        {structureError && <p className="tree-error">{structureError}</p>}

        <CategorySection
          title="Revision"
          onAddFolder={() => handleAddFolder('revision')}
          onAssignItem={() => handleAssignItem('revision')}
        >
          <ContentTreeSidebar
            tree={revisionTree}
            selectedId={activeId}
            onSelect={selectTest}
            itemClassName="tests-item"
            selectedClassName="tests-item--selected"
            expandKey={expandKey}
            collapseKey={collapseKey}
            itemIcon="📝"
          />
        </CategorySection>

        <CategorySection
          title="New Tests"
          onAddFolder={() => handleAddFolder('new_tests')}
          onAssignItem={() => handleAssignItem('new_tests')}
        >
          <ContentTreeSidebar
            tree={newTestsTree}
            selectedId={activeId}
            onSelect={selectTest}
            itemClassName="tests-item"
            selectedClassName="tests-item--selected"
            expandKey={expandKey}
            collapseKey={collapseKey}
            itemIcon="📝"
          />
        </CategorySection>
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
