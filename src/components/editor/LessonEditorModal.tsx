import { useMemo, useState } from 'react';
import { suggestId, validateNewId } from '../../services/contentEdit';
import type { ResolvedGuide } from '../../services/promptGuideChoice';
import type { EditOutcome } from '../../hooks/useContentEditing';
import type { LessonItem } from '../../services/workspaceTypes';
import { LessonMarkdown } from '../../utils/lessonMarkdown';
import { EditorShell } from './EditorShell';
import { GuidePanel } from './GuidePanel';

interface LessonEditorModalProps {
  lesson: LessonItem | null;
  existingIds: string[];
  guide: ResolvedGuide;
  onSaveGuide: (guide: string | null) => Promise<unknown>;
  onSave: (input: { id: string; markdown: string; isNew: boolean }) => Promise<EditOutcome>;
  onClose: () => void;
  /** Called after a successful save with the saved id and any partial-failure warnings. */
  onSaved: (id: string, warnings: string[]) => void;
}

const TABLE_ROW = /^\s*\|.*\|\s*$/m;

export function LessonEditorModal({ lesson, existingIds, guide, onSaveGuide, onSave, onClose, onSaved }: LessonEditorModalProps) {
  const isNew = lesson === null;
  const [markdown, setMarkdown] = useState(lesson?.content ?? '');
  const [id, setId] = useState(lesson?.id ?? '');
  const [idTouched, setIdTouched] = useState(false);
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const titleLine = /^#\s+(.+)$/m.exec(markdown)?.[1]?.trim() ?? '';
  const effectiveId = isNew && !idTouched ? suggestId(titleLine, 'lesson', existingIds) : id;
  const idProblem = isNew ? validateNewId(effectiveId, existingIds) : null;
  const problems = useMemo(() => {
    const list: string[] = [];
    if (!markdown.trim()) list.push('Write or paste the lesson first.');
    if (idProblem) list.push(`Id: ${idProblem}`);
    return list;
  }, [markdown, idProblem]);
  const warnings = [
    ...(TABLE_ROW.test(markdown) ? ['This lesson has a table. Tables do not play the audio controls; use bullet lists instead.'] : []),
    ...(markdown.trim() && !titleLine ? ['No "# Title" line, so the lesson will be listed by its id.'] : []),
  ];

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const outcome = await onSave({ id: effectiveId, markdown: markdown.replace(/\s+$/, '') + '\n', isNew });
      onSaved(effectiveId, outcome.warnings);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the lesson.');
      setSaving(false);
    }
  };

  return (
    <EditorShell
      title={isNew ? 'Add lesson' : `Edit lesson: ${lesson.title}`}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="modal-btn-cancel" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className="modal-btn-save" onClick={() => { void save(); }} disabled={saving || problems.length > 0}>
            {saving ? 'Saving…' : isNew ? 'Add lesson' : 'Save changes'}
          </button>
        </>
      )}
    >
      <GuidePanel guide={guide} noun="lesson" onSave={onSaveGuide} defaultOpen={isNew} />
      <label className="modal-label ce-field">
        Id (file name)
        {isNew ? (
          <input className="modal-input" value={effectiveId} spellCheck={false} autoCapitalize="none"
            onChange={(event) => { setIdTouched(true); setId(event.target.value.trim()); }} aria-label="Lesson id" />
        ) : (
          <input className="modal-input" value={lesson.id} disabled aria-label="Lesson id" />
        )}
        <span className="ce-hint">{isNew ? 'Letters, numbers, - and _. Taken from the title; it cannot be changed later (roadmaps link to it).' : 'The id stays the same so roadmap links keep working. Change the "# Title" line to rename the lesson.'}</span>
      </label>
      <div className="ce-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'write'} className={tab === 'write' ? 'ce-tab ce-tab--on' : 'ce-tab'} onClick={() => setTab('write')}>Markdown</button>
        <button type="button" role="tab" aria-selected={tab === 'preview'} className={tab === 'preview' ? 'ce-tab ce-tab--on' : 'ce-tab'} onClick={() => setTab('preview')}>Preview</button>
      </div>
      {tab === 'write' ? (
        <textarea
          className="modal-input ce-textarea ce-mono ce-lesson-text"
          value={markdown}
          onChange={(event) => setMarkdown(event.target.value)}
          placeholder={'# Lesson title\n\nPaste the markdown from your AI app here.'}
          spellCheck={false}
          aria-label="Lesson markdown"
        />
      ) : (
        <article className="markdown-body ce-preview">{markdown.trim() ? <LessonMarkdown content={markdown} /> : <p className="ce-hint">Nothing to preview yet.</p>}</article>
      )}
      {warnings.map((warning) => <p key={warning} className="ce-warning">⚠ {warning}</p>)}
      {markdown.trim() && problems.length > 0 ? problems.map((problem) => <p key={problem} className="ce-error">{problem}</p>) : null}
      {error ? <p className="ce-error" role="alert">{error}</p> : null}
    </EditorShell>
  );
}
