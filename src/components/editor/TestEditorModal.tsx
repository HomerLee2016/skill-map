import { useMemo, useState } from 'react';
import { suggestId, validateNewId } from '../../services/contentEdit';
import type { EditOutcome } from '../../hooks/useContentEditing';
import type { ResolvedGuide } from '../../services/promptGuideChoice';
import { findEditedQuestions } from '../../services/questionProgress';
import { fromUiQuestions, newUiQuestion, switchKind, toUiQuestions, type UiQuestion } from '../../services/testEditorModel';
import { normalizeQuestions, parseTestYaml, serializeTest, validateTest, type TestProblems } from '../../services/testYaml';
import type { TestItem, TestQuestion } from '../../services/workspaceTypes';
import { EditorShell } from './EditorShell';
import { GuidePanel } from './GuidePanel';

interface TestEditorModalProps {
  test: TestItem | null;
  existingIds: string[];
  guide: ResolvedGuide;
  onSaveGuide: (guide: string | null) => Promise<unknown>;
  onSave: (input: { id: string; title: string; questions: TestQuestion[]; isNew: boolean; keepProgress: boolean }) => Promise<EditOutcome>;
  onClose: () => void;
  onSaved: (id: string, warnings: string[]) => void;
}

type Mode = 'ui' | 'yaml';

/** The test as the current mode holds it: title + questions, or the reasons the YAML cannot be read yet. */
function readCurrent(mode: Mode, title: string, ui: UiQuestion[], yaml: string): { title: string; questions: TestQuestion[]; errors: string[]; warnings: string[] } {
  if (mode === 'ui') return { title, questions: fromUiQuestions(ui), errors: [], warnings: [] };
  if (!yaml.trim()) return { title: '', questions: [], errors: [], warnings: [] };
  const parsed = parseTestYaml(yaml);
  return parsed.ok
    ? { title: parsed.title, questions: parsed.questions, errors: [], warnings: parsed.warnings }
    : { title: '', questions: [], errors: parsed.errors, warnings: [] };
}

function QuestionCard({ index, count, question, onChange, onMove, onRemove }: {
  index: number; count: number; question: UiQuestion;
  onChange: (next: UiQuestion) => void; onMove: (delta: -1 | 1) => void; onRemove: () => void;
}) {
  const set = (patch: Partial<UiQuestion>) => onChange({ ...question, ...patch });
  const setList = (field: 'options' | 'choices', position: number, value: string) =>
    set({ [field]: question[field].map((item, at) => (at === position ? value : item)) } as Partial<UiQuestion>);
  const star = question.kind === 'star';
  const labels = star ? question.choices : question.options;

  return (
    <fieldset className="ce-question">
      <legend>Question {index + 1}</legend>
      <div className="ce-question-bar">
        <select className="modal-input ce-kind" value={question.kind} aria-label={`Question ${index + 1} type`} onChange={(event) => onChange(switchKind(question, event.target.value as UiQuestion['kind']))}>
          <option value="standard">Multiple choice</option>
          <option value="star">JLPT star (sentence ordering)</option>
        </select>
        <div className="ce-question-tools">
          <button type="button" className="icon-btn" onClick={() => onMove(-1)} disabled={index === 0} aria-label={`Move question ${index + 1} up`}>↑</button>
          <button type="button" className="icon-btn" onClick={() => onMove(1)} disabled={index === count - 1} aria-label={`Move question ${index + 1} down`}>↓</button>
          <button type="button" className="icon-btn" onClick={onRemove} disabled={count === 1} aria-label={`Delete question ${index + 1}`}>🗑</button>
        </div>
      </div>
      <label className="modal-label ce-field">
        {star ? 'Sentence (use ____ for blanks and ★ for the star)' : 'Question (you can use several lines)'}
        <textarea
          className="modal-input ce-textarea"
          rows={star ? 3 : 4}
          value={star ? question.sentence : question.question}
          onChange={(event) => set(star ? { sentence: event.target.value } : { question: event.target.value })}
          aria-label={`Question ${index + 1} text`}
        />
      </label>
      <div className="modal-label">{star ? 'Four choices, and the one that fills the ★' : 'Answers, and the correct one'}</div>
      <div className="ce-options">
        {labels.map((text, position) => (
          <div className="ce-option" key={position}>
            <input type="radio" name={`correct-${question.key}`} checked={question.correct === position} onChange={() => set({ correct: position })} aria-label={`Option ${position + 1} is correct`} />
            <span className="ce-option-num">{star ? position + 1 : String.fromCharCode(65 + position)}</span>
            <input
              className="modal-input ce-option-input"
              value={text}
              placeholder={star ? `Choice ${position + 1}` : `Answer ${String.fromCharCode(65 + position)}`}
              onChange={(event) => setList(star ? 'choices' : 'options', position, event.target.value)}
              aria-label={`Option ${position + 1} text`}
            />
            {!star && question.options.length > 2 ? (
              <button type="button" className="icon-btn ce-option-remove" aria-label={`Remove option ${position + 1}`}
                onClick={() => set({ options: question.options.filter((_, at) => at !== position), correct: question.correct === position ? -1 : question.correct > position ? question.correct - 1 : question.correct })}>✕</button>
            ) : null}
          </div>
        ))}
        {!star && question.options.length < 6 ? (
          <button type="button" className="toolbar-btn ce-btn ce-btn--quiet ce-add-option" onClick={() => set({ options: [...question.options, ''] })}>+ Add answer</button>
        ) : null}
      </div>
      <label className="modal-label ce-field">
        Explanation (optional)
        <textarea className="modal-input ce-textarea" rows={2} value={question.explanation} onChange={(event) => set({ explanation: event.target.value })} aria-label={`Question ${index + 1} explanation`} />
      </label>
      <label className="modal-label ce-field">
        Audio link (optional)
        <input className="modal-input" value={question.audio} onChange={(event) => set({ audio: event.target.value })} placeholder="https://translate.google.com/translate_tts?…" spellCheck={false} autoCapitalize="none" aria-label={`Question ${index + 1} audio link`} />
      </label>
    </fieldset>
  );
}

export function TestEditorModal({ test, existingIds, guide, onSaveGuide, onSave, onClose, onSaved }: TestEditorModalProps) {
  const isNew = test === null;
  const [mode, setMode] = useState<Mode>(isNew ? 'yaml' : 'ui');
  const [title, setTitle] = useState(test?.title ?? '');
  const [ui, setUi] = useState<UiQuestion[]>(() => (test ? toUiQuestions(test.questions) : [newUiQuestion()]));
  const [yaml, setYaml] = useState('');
  const [id, setId] = useState(test?.id ?? '');
  const [idTouched, setIdTouched] = useState(false);
  const [keepProgress, setKeepProgress] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState<string[]>([]);

  const current = useMemo(() => readCurrent(mode, title, ui, yaml), [mode, title, ui, yaml]);
  const effectiveId = isNew && !idTouched ? suggestId(current.title || title, 'test', existingIds) : id;
  const idProblem = isNew ? validateNewId(effectiveId, existingIds) : null;
  const problems: TestProblems = useMemo(() => {
    if (mode === 'yaml' && !yaml.trim()) return { errors: [], warnings: [] };
    if (current.errors.length > 0) return { errors: current.errors, warnings: [] };
    const found = validateTest(current.title, current.questions);
    return { errors: found.errors, warnings: [...current.warnings, ...found.warnings] };
  }, [mode, yaml, current]);
  const blockers = [...problems.errors, ...(idProblem ? [`Id: ${idProblem}`] : []), ...(mode === 'yaml' && !yaml.trim() ? ['Paste the test YAML first.'] : [])];
  const edited = useMemo(() => (test && current.errors.length === 0 ? findEditedQuestions(test.questions, normalizeQuestions(current.questions)).length : 0), [test, current]);

  const switchTo = (next: Mode) => {
    if (next === mode) return;
    setSwitchError([]);
    if (next === 'yaml') {
      setYaml(serializeTest(title, fromUiQuestions(ui)));
      setMode('yaml');
      return;
    }
    if (!yaml.trim()) { setUi([newUiQuestion()]); setMode('ui'); return; }
    const parsed = parseTestYaml(yaml);
    if (!parsed.ok) { setSwitchError(parsed.errors); return; }
    setTitle(parsed.title);
    setUi(parsed.questions.length ? toUiQuestions(parsed.questions) : [newUiQuestion()]);
    setMode('ui');
  };

  const updateQuestion = (index: number, next: UiQuestion) => setUi((list) => list.map((item, at) => (at === index ? next : item)));
  const moveQuestion = (index: number, delta: -1 | 1) => setUi((list) => {
    const copy = [...list];
    [copy[index], copy[index + delta]] = [copy[index + delta], copy[index]];
    return copy;
  });

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const questions = normalizeQuestions(current.questions);
      const outcome = await onSave({ id: effectiveId, title: current.title.trim(), questions, isNew, keepProgress });
      onSaved(effectiveId, outcome.warnings);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the test.');
      setSaving(false);
    }
  };

  return (
    <EditorShell
      title={isNew ? 'Add test' : `Edit test: ${test.title}`}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="modal-btn-cancel" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className="modal-btn-save" onClick={() => { void save(); }} disabled={saving || blockers.length > 0}>
            {saving ? 'Saving…' : isNew ? 'Add test' : 'Save changes'}
          </button>
        </>
      )}
    >
      <GuidePanel guide={guide} noun="test" onSave={onSaveGuide} defaultOpen={isNew} />
      <label className="modal-label ce-field">
        Id (file name)
        {isNew ? (
          <input className="modal-input" value={effectiveId} spellCheck={false} autoCapitalize="none"
            onChange={(event) => { setIdTouched(true); setId(event.target.value.trim()); }} aria-label="Test id" />
        ) : (
          <input className="modal-input" value={test.id} disabled aria-label="Test id" />
        )}
        <span className="ce-hint">{isNew ? 'Letters, numbers, - and _. Taken from the title; it cannot be changed later (roadmaps link to it).' : 'The id stays the same so roadmap links keep working.'}</span>
      </label>
      <div className="ce-tabs" role="tablist" aria-label="Editor mode">
        <button type="button" role="tab" aria-selected={mode === 'ui'} className={mode === 'ui' ? 'ce-tab ce-tab--on' : 'ce-tab'} onClick={() => switchTo('ui')}>UI mode</button>
        <button type="button" role="tab" aria-selected={mode === 'yaml'} className={mode === 'yaml' ? 'ce-tab ce-tab--on' : 'ce-tab'} onClick={() => switchTo('yaml')}>YAML mode</button>
      </div>
      {switchError.length > 0 ? (
        <div className="ce-error" role="alert">Fix the YAML before switching to UI mode:{switchError.map((message) => <div key={message}>{message}</div>)}</div>
      ) : null}
      {mode === 'ui' ? (
        <>
          <label className="modal-label ce-field">
            Test title
            <input className="modal-input" value={title} onChange={(event) => setTitle(event.target.value)} aria-label="Test title" />
          </label>
          {ui.map((question, index) => (
            <QuestionCard key={question.key} index={index} count={ui.length} question={question}
              onChange={(next) => updateQuestion(index, next)} onMove={(delta) => moveQuestion(index, delta)}
              onRemove={() => setUi((list) => list.filter((_, at) => at !== index))} />
          ))}
          <div className="ce-add-row">
            <button type="button" className="toolbar-btn ce-btn" onClick={() => setUi((list) => [...list, newUiQuestion()])}>+ Add question</button>
            <button type="button" className="toolbar-btn ce-btn ce-btn--quiet" onClick={() => setUi((list) => [...list, newUiQuestion('star')])}>+ Add JLPT star question</button>
          </div>
        </>
      ) : (
        <textarea
          className="modal-input ce-textarea ce-mono ce-yaml-text"
          value={yaml}
          onChange={(event) => setYaml(event.target.value)}
          placeholder={'quiz_title: "My test"\nquestions:\n  - question_number: 1\n    question: "…"\n    options: ["a", "b", "c", "d"]\n    correct_answer: "a"\n\nPaste the YAML from your AI app here.'}
          spellCheck={false}
          aria-label="Test YAML"
        />
      )}
      {edited > 0 ? (
        <label className="ce-check">
          <input type="checkbox" checked={keepProgress} onChange={(event) => setKeepProgress(event.target.checked)} />
          Keep stars and next review date for the {edited} question{edited === 1 ? '' : 's'} you reworded
        </label>
      ) : null}
      {problems.warnings.map((warning) => <p key={warning} className="ce-warning">⚠ {warning}</p>)}
      {problems.errors.map((message) => <p key={message} className="ce-error">{message}</p>)}
      {idProblem ? <p className="ce-error">Id: {idProblem}</p> : null}
      {error ? <p className="ce-error" role="alert">{error}</p> : null}
    </EditorShell>
  );
}
