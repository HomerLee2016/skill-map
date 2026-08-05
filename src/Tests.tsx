import { useEffect, useMemo, useState } from 'react';
import {
  addFolderToTree,
  assignItemToTree,
  listFolderPaths,
  pathToSegments,
  type StructureTree,
} from './utils/contentCatalog';
import { insertCompletedQuestion } from './utils/revision';
import { useWorkspace } from './contexts/WorkspaceContext';
import { collectTreeIds, resolveStructureTree } from './utils/folderStructure';
import {
  CategorySection,
  ContentTreeSidebar,
  TreeActionModal,
  TreeGlobalActions,
} from './components/ContentTreeSidebar';
import { useExpandCollapseState } from './hooks/useExpandCollapseState';
import { useAudioAutoAdvance } from './hooks/useAudioAutoAdvance';
import AnswerQuestion from './components/AnswerQuestion';
import IncorrectReviewScreen from './components/IncorrectReviewScreen';
import QuestionTracker, { getFirstUnansweredQuestionIndex } from './components/QuestionTracker';
import { writeWorkspaceStructureFile } from './services/workspaceStructurePersistence';
import { countCorrectAnswers } from './utils/testScoring';

interface TestsProps {
  selectedTestId?: string;
  onSelectedTestIdChange?: (id: string) => void;
}

async function saveTestsStructure(structure: { revision: StructureTree; new_tests: StructureTree }) {
  return structure;
}

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
  audio_track_url?: string;
}) {
  await insertCompletedQuestion(payload);
}


function Tests({ selectedTestId, onSelectedTestIdChange }: TestsProps) {
  const { workspace, workspaceVersion, selectedDirectoryHandle } = useWorkspace();
  const availableTests = workspace.tests;
  const [activeId, setActiveId] = useState(selectedTestId || availableTests[0]?.id || '');
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [correctMap, setCorrectMap] = useState<Record<number, boolean>>({});
  const [currentIdx, setCurrentIdx] = useState(0);
  const [finished, setFinished] = useState(false);
  const [showIncorrectReview, setShowIncorrectReview] = useState(false);
  const [total, setTotal] = useState(0);
  const [autoAdvanceOnCorrect, setAutoAdvanceOnCorrect] = useState(true);
  const { scheduleAutoAdvance, handleAudioPlaybackStart, handleAudioPlaybackEnd, handleAudioPlaybackError } = useAudioAutoAdvance();
  const [structure, setStructure] = useState(workspace.testsStructure);
  const [structureError, setStructureError] = useState<string | null>(null);
  const [modalState, setModalState] = useState<{ open: boolean; mode: 'add-folder' | 'assign-item' }>({
    open: false,
    mode: 'add-folder',
  });
  const { expandKey, collapseKey, expandAll, collapseAll } = useExpandCollapseState();


  const newTestsTree = useMemo(() => {
    const catalog = availableTests.map(({ id, title }) => ({ id, title }));
    const claimed = new Set([...collectTreeIds(structure.revision), ...collectTreeIds(structure.new_tests)]);
    return resolveStructureTree(structure.new_tests, catalog, { includeUngrouped: true, claimedIds: claimed });
  }, [availableTests, structure.new_tests, structure.revision]);

  useEffect(() => {
    setStructure(workspace.testsStructure);
  }, [workspace.testsStructure]);

  useEffect(() => {
    if (selectedTestId) {
      setActiveId(selectedTestId);
      return;
    }

    setActiveId(availableTests[0]?.id || '');
  }, [selectedTestId, availableTests, workspaceVersion]);

  const selected = availableTests.find((test) => test.id === activeId);

  useEffect(() => {
    if (selected) {
      setTotal(selected.questions.length);
      setCurrentIdx(0);
      setFinished(false);
      setShowIncorrectReview(false);
      setAnswers({});
      setCorrectMap({});
    }
  }, [selected]);

  const selectTest = (id: string) => {
    setActiveId(id);
    onSelectedTestIdChange?.(id);
  };

  const persist = async (next: { revision: StructureTree; new_tests: StructureTree }) => {
    try {
      await saveTestsStructure(next);
      await writeWorkspaceStructureFile(selectedDirectoryHandle, 'tests', next);
      setStructure(next);
      setStructureError(null);
    } catch (err) {
      setStructureError(err instanceof Error ? err.message : 'Failed to save structure');
    }
  };

  const handleAddFolder = (section: 'revision' | 'new_tests') => {
    setModalState({ open: true, mode: 'add-folder' });
    setCurrentSection(section);
  };

  const handleAssignItem = (section: 'revision' | 'new_tests') => {
    setModalState({ open: true, mode: 'assign-item' });
    setCurrentSection(section);
  };

  const [currentSection, setCurrentSection] = useState<'revision' | 'new_tests'>('new_tests');

  const handleModalSubmit = ({ folderName, itemId, parentPath }: { folderName?: string; itemId?: string; parentPath: string }) => {
    const sectionTree = structure[currentSection];
    if (modalState.mode === 'add-folder') {
      if (!folderName?.trim()) return;
      const nextSection = addFolderToTree(sectionTree, folderName, parentPath ? pathToSegments(parentPath) : []);
      persist({ ...structure, [currentSection]: nextSection });
      return;
    }

    if (!itemId) return;
    const nextSection = assignItemToTree(sectionTree, itemId, parentPath ? pathToSegments(parentPath) : []);
    persist({ ...structure, [currentSection]: nextSection });
  };

  const totalQuestions = selected?.questions.length ?? 0;
  const isLastQuestion = currentIdx + 1 >= totalQuestions;
  const computedScore = countCorrectAnswers(correctMap);

  const jumpToQuestion = (index: number) => {
    if (!selected || index < 0 || index >= totalQuestions) return;
    setCurrentIdx(index);
  };

  const advanceToNextQuestion = () => {
    if (currentIdx + 1 < totalQuestions) {
      setCurrentIdx((i) => i + 1);
    } else {
      setFinished(true);
    }
  };

  const handleNextQuestionOrFinish = (nextAnswers: Record<number, string> = answers) => {
    if (isLastQuestion && !autoAdvanceOnCorrect) {
      handleFinishTest(nextAnswers);
      return;
    }

    advanceToNextQuestion();
  };

  const handleAnswerSelect = async (question: any, option: string) => {
    if (!selected) return;
    const isCorrect = option === question.correct_answer;
    const nextAnswers = { ...answers, [question.question_number]: option };
    setAnswers(nextAnswers);
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
        proficiency: question.proficiency,
        quiz_title: selected?.title ?? '',
        audio_track_url: question.audio_track_url,
      });
    } catch (e) {
      console.error('Failed to save question result', e);
    }

    const firstUnansweredIndex = getFirstUnansweredQuestionIndex(totalQuestions, nextAnswers);
    if (firstUnansweredIndex === -1) {
      if (!isCorrect || autoAdvanceOnCorrect) {
        setFinished(true);
      }
      return;
    }

    if (isCorrect) {
      if (autoAdvanceOnCorrect) {
        scheduleAutoAdvance(
          () => {
            if (isLastQuestion) {
              handleFinishTest(nextAnswers);
            } else {
              advanceToNextQuestion();
            }
          },
          !!question.audio_track_url,
        );
      }
    } else if (isLastQuestion) {
      setTimeout(() => {
        handleFinishTest(nextAnswers);
      }, 0);
    }
  };

  const handleFinishTest = (nextAnswers: Record<number, string> = answers) => {
    if (!selected) return;

    const firstUnansweredIndex = getFirstUnansweredQuestionIndex(totalQuestions, nextAnswers);
    if (firstUnansweredIndex >= 0) {
      const shouldGoBack = window.confirm(`You still have unanswered questions. Go back to question ${firstUnansweredIndex + 1}?`);
      if (shouldGoBack) {
        setCurrentIdx(firstUnansweredIndex);
        return;
      }
    }

    setFinished(true);
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
        <TreeActionModal
          isOpen={modalState.open}
          mode={modalState.mode}
          itemLabel="Test"
          catalog={availableTests.map(({ id, title }) => ({ id, title }))}
          folderPaths={listFolderPaths(structure[currentSection])}
          onClose={() => setModalState((prev) => ({ ...prev, open: false }))}
          onSubmit={handleModalSubmit}
        />
        <CategorySection
          title="Tests"
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
        ) : showIncorrectReview ? (
          <IncorrectReviewScreen
            questions={selected.questions}
            answers={answers}
            correctMap={correctMap}
            title={selected.title}
            subtitle="Review the questions you answered incorrectly."
            onFinish={() => {
              setShowIncorrectReview(false);
              setFinished(false);
              setCurrentIdx(0);
              setAnswers({});
              setCorrectMap({});
            }}
          />
        ) : finished ? (
          <div className="tests-score">
            <p>Finished! Score: {computedScore} / {total}</p>
            <button type="button" className="toolbar-btn" onClick={() => {
              setShowIncorrectReview(true);
              setFinished(false);
              setCurrentIdx(0);
            }}>
              Review Incorrect Answers
            </button>
          </div>
        ) : (
          <>
            <header className="tests-header">
              <h1>{selected.title}</h1>
              <p className="tests-meta">{selected.questions.length} multiple-choice questions</p>
            </header>
            <QuestionTracker
              totalQuestions={totalQuestions}
              answers={answers}
              correctMap={correctMap}
              currentIndex={currentIdx}
              onSelectQuestion={jumpToQuestion}
              questionNumbers={selected.questions.map((question) => question.question_number)}
            />
            <div className="test-question-container">
              {selected.questions.slice(currentIdx, currentIdx + 1).map((q) => (
                <AnswerQuestion
                  key={`${q.question_number}-${q.question}`}
                  q={q}
                  answers={answers}
                  correctMap={correctMap}
                  handleAnswerSelect={handleAnswerSelect}
                  onNextQuestion={() => handleNextQuestionOrFinish(answers)}
                  showNextButton={!!answers[q.question_number] && !finished && (!isLastQuestion || !autoAdvanceOnCorrect)}
                  autoAdvanceOnCorrect={autoAdvanceOnCorrect}
                  onAutoAdvanceChange={setAutoAdvanceOnCorrect}
                  onAudioPlaybackStart={handleAudioPlaybackStart}
                  onAudioPlaybackEnd={handleAudioPlaybackEnd}
                  onAudioPlaybackError={handleAudioPlaybackError}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default Tests;
