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

const API_BASE = 'http://localhost:5178';

async function saveTestsStructure(structure: { revision: StructureTree; new_tests: StructureTree }) {
  const response = await fetch(`${API_BASE}/api/save-structure`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'tests', structure }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.ok) {
    throw new Error(result?.error || 'Failed to save test structure');
  }
}

async function saveQuestionResult(payload: {
  question_name: string;
  options: string[];
  correct_answer: string;
  selected_answer: string;
  correct: number;
  last_time: string;
  proficiency?: string;
  quiz_title: string;
}) {
  const response = await fetch(`${API_BASE}/api/save-question-result`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(err || 'Failed to save question result');
  }
}


function Tests({ selectedTestId, onSelectedTestIdChange }: TestsProps) {
  const [activeId, setActiveId] = useState(selectedTestId || availableTests[0]?.id || '');
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [correctMap, setCorrectMap] = useState<Record<number, boolean>>({});
  const [currentIdx, setCurrentIdx] = useState(0);
  const [finished, setFinished] = useState(false);
  const [score, setScore] = useState(0);
  const [total, setTotal] = useState(0);
  const [structure, setStructure] = useState(getInitialTestsStructure);
  const [structureError, setStructureError] = useState<string | null>(null);
  const { expandKey, collapseKey, expandAll, collapseAll } = useExpandCollapseState();
  // New states for revision feature
  const [completedRows, setCompletedRows] = useState<any[]>([]);
  const [revisionSelection, setRevisionSelection] = useState<Set<number>>(new Set());
  const [revisionMode, setRevisionMode] = useState(false);
  const [revisionQuestions, setRevisionQuestions] = useState<any[]>([]);
  const [showSummary, setShowSummary] = useState(false);


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

  useEffect(() => {
    if (selected) {
      setTotal(selected.questions.length);
      setScore(0);
      setCurrentIdx(0);
      setFinished(false);
      setAnswers({});
      setCorrectMap({});
    }
  }, [selected]);

  const selectTest = (id: string) => {
    setShowSummary(false);
    setRevisionMode(false);
    setActiveId(id);
    onSelectedTestIdChange?.(id);
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

  // Fetch completed questions for Learnt Summary (reusable)
  const fetchCompleted = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/completed-questions`);
      if (!res.ok) throw new Error('Failed to fetch completed questions');
      const json = await res.json();
      setCompletedRows(json.data);
    } catch (e) {
      console.error(e);
    }
  };
  // Initial load
  useEffect(() => {
    fetchCompleted();
  }, []);


  // Toggle selection of a question for revision
  const toggleRevisionSelection = (id: number) => {
    setRevisionSelection((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      return newSet;
    });
  };

  // Start revision test with selected questions
  const startRevision = () => {
    if (revisionSelection.size === 0) return;
    const selected = completedRows.filter((row: any) => revisionSelection.has(row.id));
    const revQuestions = selected.map((row: any) => ({
      question_number: row.id,
      question: row.question_name,
      options: row.options,
      correct_answer: row.correct_answer,
      proficiency: row.proficiency,
    }));
    setRevisionQuestions(revQuestions);
    setRevisionMode(true);
    // Reset test state for revision
    setTotal(revQuestions.length);
    setScore(0);
    setCurrentIdx(0);
    setFinished(false);
    setAnswers({});
    setCorrectMap({});
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

  const handleAnswerSelect = async (question: any, option: string) => {
    if (!selected) return;
    const isCorrect = option === question.correct_answer;
    setAnswers((prev) => ({ ...prev, [question.question_number]: option }));
    setCorrectMap((prev) => ({ ...prev, [question.question_number]: isCorrect }));
    try {
      await saveQuestionResult({
        question_name: question.question,
        options: question.options,
        correct_answer: question.correct_answer,
        selected_answer: option,
        correct: isCorrect ? 1 : 0,
        last_time: new Date().toISOString(),
        proficiency: question.proficiency,
        quiz_title: selected?.title ?? '',
      });
      // Refresh the Learnt Summary data after a successful save
      await fetchCompleted();
    } catch (e) {
      console.error('Failed to save question result', e);
    }
    if (isCorrect) {
      setScore((s) => s + 1);
      // Auto-advance after 1 second if not the last question
      setTimeout(() => {
        if (selected && currentIdx + 1 < selected.questions.length) {
          setCurrentIdx((i) => i + 1);
        } else {
          setFinished(true);
        }
      }, 1000);
    }
  };

  const handleNext = () => {
    if (selected && currentIdx + 1 < selected.questions.length) {
      setCurrentIdx((i) => i + 1);
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

          {/* Revision Section */}
          <CategorySection
            title="Revision"
            onAddFolder={() => handleAddFolder('revision')}
            onAssignItem={() => handleAssignItem('revision')}
          >
            {/* Learnt Summary button */}
            <button type="button" className="next-btn" onClick={() => { setShowSummary(true); setRevisionMode(false); setFinished(false); }}>
              Learnt Summary
            </button>
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
        {showSummary ? (
          <div className="summary-table-wrapper">
            <h2>Learnt Summary</h2>
            <table className="summary-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Test</th>
                  <th>Question</th>
                  <th>Correct Answer</th>
                  <th>Proficiency</th>
                </tr>
              </thead>
              <tbody>
                {completedRows.map((row: any) => (
                  <tr key={row.id}>
                    <td>{row.id}</td>
                    <td>{row.quiz_title}</td>
                    <td>{row.question_name}</td>
                    <td>{row.correct_answer}</td>
                    <td>{row.proficiency}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : revisionMode ? (
          <div className="test-question-container">
            {revisionQuestions.slice(currentIdx, currentIdx + 1).map((q) => (
              <fieldset key={q.question_number} className="test-question">
                <legend>{q.question_number}. {q.question}</legend>
                {q.options.map((opt: string) => {
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
              </fieldset>
            ))}
          </div>
        ) : !selected ? (
          <p className="tests-empty">Select a test from the sidebar.</p>
        ) : (
          <>
            <header className="tests-header">
              <h1>{selected.title}</h1>
              <p className="tests-meta">{selected.questions.length} multiple-choice questions</p>
            </header>

            {finished ? (
                <div className="tests-score">
                  <p>Finished! Score: {score} / {total}</p>
                </div>
              ) : (
                <div className="test-question-container">
                  {selected.questions.slice(currentIdx, currentIdx + 1).map((q) => (
                    <fieldset key={q.question_number} className="test-question">
                      <legend>{q.question_number}. {q.question}</legend>
                        {q.options.map((opt) => {
                          const chosen = answers[q.question_number] === opt;
                          const isCorrect = correctMap[q.question_number];
                          let className = 'option-box';
                          if (chosen) {
                            className += isCorrect ? ' correct' : ' incorrect';
                          } else if (answers[q.question_number] && opt === q.correct_answer) {
                            // Show correct answer in green when user answered incorrectly
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

                      {answers[q.question_number] && !correctMap[q.question_number] && currentIdx < selected.questions.length - 1 && (
                        <button type="button" className="next-btn" onClick={handleNext}>
                          Next Question
                        </button>
                      )}
                      {answers[q.question_number] && currentIdx === selected.questions.length - 1 && (
                        <button type="button" className="finish-btn" onClick={() => setFinished(true)}>
                          Finish Test
                        </button>
                      )}
                    </fieldset>
                  ))}
                </div>
              )}
          </>
        )}
      </div>
    </div>
  );
}

export default Tests;
