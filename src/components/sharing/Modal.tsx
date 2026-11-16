import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  title: string;
  /** Called on a click on the backdrop; leave out to make the modal close only through its own buttons. */
  onBackdrop?: () => void;
  className?: string;
  children: ReactNode;
}

/** A centred pop-up with a dimmed backdrop, shared by every dialog of the sharing hub. */
export function Modal({ title, onBackdrop, className = '', children }: ModalProps) {
  return createPortal(
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => { if (onBackdrop && event.target === event.currentTarget) onBackdrop(); }}>
      <div className={`modal-dialog ${className}`.trim()}>{children}</div>
    </div>,
    document.body,
  );
}
