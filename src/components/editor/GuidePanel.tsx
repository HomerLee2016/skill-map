import { useState } from 'react';
import type { ResolvedGuide } from '../../services/promptGuideChoice';

interface GuidePanelProps {
  guide: ResolvedGuide;
  /** Which kind of content is being added, for the hint line. */
  noun: 'lesson' | 'test';
  onSave: (guide: string | null) => Promise<unknown>;
  defaultOpen?: boolean;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older mobile browsers and non-secure pages: fall back to a temporary textarea.
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    try {
      return document.execCommand('copy');
    } finally {
      document.body.removeChild(area);
    }
  }
}

/** The workspace's AI prompt guide: copy it into an AI app, then paste the answer back into the editor. */
export function GuidePanel({ guide, noun, onSave, defaultOpen = false }: GuidePanelProps) {
  const [copied, setCopied] = useState<'yes' | 'no' | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(guide.markdown);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const copy = async () => {
    setCopied((await copyText(guide.markdown)) ? 'yes' : 'no');
    setTimeout(() => setCopied(null), 2500);
  };

  const save = async (next: string | null) => {
    setBusy(true);
    setMessage(null);
    try {
      await onSave(next);
      setEditing(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save the guide.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="ce-guide" open={defaultOpen}>
      <summary>AI prompt guide <span className="ce-guide-source">({guide.label})</span></summary>
      <p className="ce-hint">
        Copy this into your AI app, ask it for a {noun}, then paste the {noun === 'test' ? 'YAML' : 'markdown'} it gives you below.
      </p>
      <div className="ce-guide-actions">
        <button type="button" className="toolbar-btn ce-btn" onClick={() => { void copy(); }}>
          {copied === 'yes' ? '✓ Copied' : copied === 'no' ? 'Copy failed – select the text and copy' : '📋 Copy guide'}
        </button>
        <button type="button" className="toolbar-btn ce-btn ce-btn--quiet" onClick={() => { setDraft(guide.markdown); setEditing((value) => !value); }}>
          {editing ? 'Cancel edit' : 'Edit guide'}
        </button>
        {guide.source === 'workspace' ? (
          <button type="button" className="toolbar-btn ce-btn ce-btn--quiet" disabled={busy} onClick={() => { void save(null); }}>Use built-in guide</button>
        ) : null}
      </div>
      {editing ? (
        <>
          <textarea className="modal-input ce-textarea ce-mono ce-guide-text" value={draft} spellCheck={false} onChange={(event) => setDraft(event.target.value)} aria-label="Guide markdown" />
          <button type="button" className="toolbar-btn ce-btn" disabled={busy || !draft.trim()} onClick={() => { void save(draft); }}>Save guide to this workspace</button>
        </>
      ) : (
        <pre className="ce-guide-preview" tabIndex={0}>{guide.markdown}</pre>
      )}
      {message ? <p className="ce-error" role="alert">{message}</p> : null}
    </details>
  );
}
