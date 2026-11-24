import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface EditorShellProps {
  title: string;
  onClose: () => void;
  footer: ReactNode;
  children: ReactNode;
}

/** Large editor pop-up: a centred panel on desktop, the whole screen on a phone. Header and footer stay put while the body scrolls. */
export function EditorShell({ title, onClose, footer, children }: EditorShellProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="modal-overlay ce-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal-dialog ce-dialog">
        <header className="ce-header">
          <h3 className="modal-title">{title}</h3>
          <button type="button" className="ce-close" onClick={onClose} aria-label="Close editor">✕</button>
        </header>
        <div className="ce-body">{children}</div>
        <footer className="ce-footer">{footer}</footer>
      </div>
    </div>,
    document.body,
  );
}
