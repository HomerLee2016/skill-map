import { useEffect, useMemo, useState } from 'react';
import {
  addFolderToTree,
  assignItemToTree,
  buildNewTestTree,
  buildRevisionTestTree,
  getInitialTestsStructure,
  listFolderPaths,
  pathToSegments,
  tests as availableTests,
  type StructureTree,
} from './utils/contentCatalog';
import type { TestResultPayload } from './types';
import { CollapsibleSection, ContentTreeSidebar } from './components/ContentTreeSidebar';

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

function promptAssign(
  catalog: { id: string; title: string }[],
  sectionTree: StructureTree
): { itemId: string; parentPath: string[] } | null {
  const options = catalog.map((item) => `${item.id} — ${item.title}`).join('\n');
  const itemId = window.prompt(`Test id to place in a folder:\n${options}`);
  if (!itemId?.trim()) return null;
  if (!catalog.some((item) => item.id === itemId.trim())) {
    window.alert(`Unknown test id: ${itemId}`);
    return null;
  }

  const paths = listFolderPaths(sectionTree);
  if (paths.length === 0) {
    window.alert('Create a folder first, then assign items into it.');
    return null;
  }
  const choice = window.prompt(
    `Folder path (leave empty for root of this section).\nAvailable:\n${paths.join('\n')}`,
    paths[0]
  );
  if (choice === null) return null;
  return {
    itemId: itemId.trim(),
    parentPath: choice.trim() ? pathToSegments(choice) : [],
  };
}

function Tests({ selectedTestId, onSelectedTestIdChange }: TestsProps) {
  const [activeId, setActiveId] = useState(selectedTestId || availableTests[0]?.id || '');
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [lastScore, setLastScore] = useState<{ score: number; total: number } | null>(null);
  const [structure, setStructure] = useState(getInitialTestsStructure);
  const [structureError, setStructureError] = useState<string | null>(null);

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

  const handleAddFolder = async (section: 'revision' | 'new_tests') => {
    const name = window.prompt('New folder name');
    if (!name?.trim()) return;

    const sectionTree = structure[section];
    const paths = listFolderPaths(sectionTree);
    let parentPath: string[] = [];
    if (paths.length > 0) {
      const choice = window.prompt(
        `Parent folder path (leave empty for root).\nAvailable:\n${paths.join('\n')}`,
        ''
      );
      if (choice === null) return;
      parentPath = choice.trim() ? pathToSegments(choice) : [];
    }

    const nextSection = addFolderToTree(sectionTree, name, parentPath);
    const next = { ...structure, [section]: nextSection };
    try {
      await saveTestsStructure(next);
      setStructure(next);
      setStructureError(null);
    } catch (err) {
      setStructureError(err instanceof Error ? err.message : 'Failed to save structure');
    }
  };

  const handleAssignItem = async (section: 'revision' | 'new_tests') => {
    const assignment = promptAssign(
      availableTests.map(({ id, title }) => ({ id, title })),
      structure[section]
    );
    if (!assignment) return;
    const nextSection = assignItemToTree(
      structure[section],
      assignment.itemId,
      assignment.parentPath
    );
    const next = { ...structure, [section]: nextSection };
    try {
      await saveTestsStructure(next);
      setStructure(next);
      setStructureError(null);
    } catch (err) {
      setStructureError(err instanceof Error ? err.message : 'Failed to save structure');
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
        <div className="tests-sidebar-title">Tests</div>
        <p className="tree-structure-hint">
          Folders are stored in <code>src/data/tests/structure.yaml</code>
        </p>
        {structureError && <p className="tree-error">{structureError}</p>}

        <CollapsibleSection
          title="Revision"
          defaultOpen
          onAddFolder={() => handleAddFolder('revision')}
          onAssignItem={() => handleAssignItem('revision')}
        >
          <ContentTreeSidebar
            tree={revisionTree}
            selectedId={activeId}
            onSelect={selectTest}
            itemClassName="tests-item"
            selectedClassName="tests-item--selected"
          />
        </CollapsibleSection>

        <CollapsibleSection
          title="New Tests"
          defaultOpen
          onAddFolder={() => handleAddFolder('new_tests')}
          onAssignItem={() => handleAssignItem('new_tests')}
        >
          <ContentTreeSidebar
            tree={newTestsTree}
            selectedId={activeId}
            onSelect={selectTest}
            itemClassName="tests-item"
            selectedClassName="tests-item--selected"
          />
        </CollapsibleSection>
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
