import { useEffect, useRef, useState, type ReactNode } from 'react';

interface PopoverMenuProps {
  /** Accessible name and tooltip of the icon button. */
  label: string;
  icon: ReactNode;
  /** Small number on the icon, e.g. how many filters are on. 0 or undefined hides it. */
  badge?: number;
  children: ReactNode;
}

/** An icon button that opens a small panel under it; closes on outside click or Escape. */
export function PopoverMenu({ label, icon, badge, children }: PopoverMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event: MouseEvent | TouchEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="popover-menu" ref={ref}>
      <button type="button" className={open ? 'icon-btn icon-btn--on' : 'icon-btn'} aria-label={label} title={label} aria-expanded={open} onClick={() => setOpen(!open)}>
        {icon}
        {badge ? <span className="icon-badge" aria-label={`${badge} active`}>{badge}</span> : null}
      </button>
      {open ? <div className="popover-panel" role="group" aria-label={label}>{children}</div> : null}
    </div>
  );
}
