import { useEffect, useState } from 'react';
import { CategorySection, ContentTreeSidebar, TreeGlobalActions } from './components/ContentTreeSidebar';
import { useExpandCollapseState } from './hooks/useExpandCollapseState';
import AnswerQuestion from './components/AnswerQuestion';
import { buildNewTestTree, getInitialTestsStructure, promptAddFolder, promptAssignItem, tests as availableTests, type StructureTree } from './utils/contentCatalog';

const API_BASE = 'http://localhost:5178';

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

function Revision() {
  const [structure, setStructure] = useState(getInitialTestsStructure);
  const [structureError, setStructureError] = useState<string | null>(null);
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
  const { expandKey, collapseKey, expandAll, collapseAll } = useExpandCollapseState();

  const newTestsTree = buildNewTestTree(structure.new_tests, structure.revision);
  const totalQuestions = revisionQuestions.length;
  const isLastQuestion = currentIdx + 1 >= totalQuestions;

  const fetchCompleted = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/completed-questions`);
      if (!res.ok) throw new Error('Failed to fetch completed questions');
      const json = await res.json();
      setCompletedRows(json.data);
    } catch (error) {
      console.error(error);
    }
  };

  const fetchDueCount = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/due-revision-questions`);
      if (!res.ok) throw new Error('Failed to fetch due revision count');
      const json = await res.json();
      setDueCount(json.data.length);
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    void fetchCompleted();
    void fetchDueCount();
  }, []);

  const persist = async (next: { revision: StructureTree; new_tests: StructureTree }) => {
    try {
      await saveTestsStructure(next);
      setStructure(next);
      setStructureError(null);
    } catch (error) {
      setStructureError(error instanceof Error ? error.message : 'Failed to save structure');
    }
  };

  const handleAddFolder = (section: 'revision' | 'new_tests') => {
    const nextSection = promptAddFolder(structure[section]);
    if (nextSection) {
      void persist({ ...structure, [section]: nextSection });
    }
  };

  const handleAssignItem = (section: 'revision' | 'new_tests') => {
    const nextSection = promptAssignItem(
      availableTests.map(({ id, title }) => ({ id, title })),
      structure[section],
      'Test'
    );
    if (nextSection) {
      void persist({ ...structure, [section]: nextSection });
    }
  };

  const startRevision = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/due-revision-questions`);
      if (!res.ok) throw new Error('Failed to fetch due revision questions');
      const { data } = await res.json();
      const revQuestions = data.map((row: any) => ({
        question_number: row.id,
        question: row.question_name,
        options: typeof row.options === 'string' ? JSON.parse(row.options) : row.options,
        correct_answer: row.correct_answer,
        proficiency: row.proficiency,
      }));
      setRevisionQuestions(revQuestions);
      setRevisionMode(true);
      setShowSummary(false);
      setCurrentIdx(0);
      setFinished(false);
      setScore(0);
      setAnswers({});
      setCorrectMap({});
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
        quiz_title: 'Revision',
      });
      await fetchCompleted();
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
        {structureError && <p className="tree-error">{structureError}</p>}

        <CategorySection title="Revision Actions">
          <div className="revision-action-list">
            <button type="button" className="next-btn" onClick={() => { setShowSummary(true); setRevisionMode(false); setFinished(false); }}>
              Learnt Summary
            </button>
            <button type="button" className="next-btn" onClick={() => { void startRevision(); }}>
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
              <button type="button" className="start-now-btn" onClick={() => { void startRevision(); }}>
                Start revision
              </button>
            </div>
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
          </div>
        ) : revisionMode ? (
          <div className="test-question-container">
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
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default Revision;
