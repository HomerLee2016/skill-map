interface ItemChecklistProps {
  title: string;
  items: { id: string; title: string }[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}

/** A titled list of tick boxes with all/none shortcuts. */
export function ItemChecklist({ title, items, selected, onChange }: ItemChecklistProps) {
  const toggle = (id: string, on: boolean) => {
    const next = new Set(selected);
    if (on) next.add(id); else next.delete(id);
    onChange(next);
  };
  return (
    <section className="sharing-checklist">
      <div className="sharing-checklist-head">
        <h4 className="sharing-checklist-title">{title} <span className="sharing-muted">({selected.size}/{items.length})</span></h4>
        {items.length > 0 ? (
          <span className="sharing-checklist-shortcuts">
            <button type="button" className="sharing-link-btn" onClick={() => onChange(new Set(items.map((item) => item.id)))}>All</button>
            <button type="button" className="sharing-link-btn" onClick={() => onChange(new Set())}>None</button>
          </span>
        ) : null}
      </div>
      {items.length === 0 ? <p className="sharing-muted sharing-empty">Nothing here.</p> : (
        <ul className="sharing-checklist-items">
          {items.map((item) => (
            <li key={item.id}>
              <label className="sharing-check">
                <input type="checkbox" checked={selected.has(item.id)} onChange={(event) => toggle(item.id, event.target.checked)} />
                <span>{item.title}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
