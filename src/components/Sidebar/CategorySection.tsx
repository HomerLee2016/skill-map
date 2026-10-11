import type { ReactNode } from 'react';

interface CategorySectionProps {
  title: string;
  onAddFolder?: () => void;
  onAssignItem?: () => void;
  children: ReactNode;
}

export function CategorySection({
  title,
  onAddFolder,
  onAssignItem,
  children,
}: CategorySectionProps) {
  return (
    <section className="tree-section">
      <div className="tree-section-header">
        <div className="tree-category-title">
          <span>{title}</span>
        </div>
        {onAssignItem && (
          <button
            type="button"
            className="tree-assign-item"
            title="Assign item to folder"
            onClick={onAssignItem}
          >
            ⤵
          </button>
        )}
        {onAddFolder && (
          <button
            type="button"
            className="tree-add-folder"
            title="Add folder"
            onClick={onAddFolder}
          >
            +
          </button>
        )}
      </div>
      <div className="tree-section-body">{children}</div>
    </section>
  );
}

