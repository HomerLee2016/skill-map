import { useId, useState } from 'react';
import { MAX_TAGS, MAX_TAG_LENGTH, normalizeTag, normalizeTags } from '../../services/sharedTags';

interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  /** Tags already used in the hub, offered while typing. */
  suggestions?: string[];
}

/** Tags as removable chips; Enter, comma or leaving the field adds what was typed. */
export function TagInput({ tags, onChange, suggestions = [] }: TagInputProps) {
  const [draft, setDraft] = useState('');
  const listId = useId();

  const commit = (text: string) => {
    const next = normalizeTags([...tags, ...text.split(',').map(normalizeTag)]);
    if (next.length !== tags.length) onChange(next);
    setDraft('');
  };

  return (
    <div className="tag-input">
      {tags.length > 0 ? (
        <ul className="tag-list">
          {tags.map((tag) => (
            <li key={tag} className="tag-chip">
              {tag}
              <button type="button" className="tag-chip-remove" aria-label={`Remove tag ${tag}`} onClick={() => onChange(tags.filter((entry) => entry !== tag))}>×</button>
            </li>
          ))}
        </ul>
      ) : null}
      <input
        className="modal-input"
        value={draft}
        maxLength={MAX_TAG_LENGTH}
        list={listId}
        disabled={tags.length >= MAX_TAGS}
        placeholder={tags.length >= MAX_TAGS ? `Up to ${MAX_TAGS} tags` : 'Type a tag, press Enter'}
        aria-label="Add tag"
        onChange={(event) => { if (event.target.value.includes(',')) commit(event.target.value); else setDraft(event.target.value); }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') { event.preventDefault(); commit(draft); }
          else if (event.key === 'Backspace' && draft === '' && tags.length > 0) onChange(tags.slice(0, -1));
        }}
        onBlur={() => { if (draft.trim()) commit(draft); }}
      />
      <datalist id={listId}>{suggestions.filter((tag) => !tags.includes(tag)).map((tag) => <option key={tag} value={tag} />)}</datalist>
    </div>
  );
}

/** Small read-only chips, optionally clickable (e.g. to filter by that tag). */
export function TagChips({ tags, onPick }: { tags: string[]; onPick?: (tag: string) => void }) {
  if (tags.length === 0) return null;
  return (
    <ul className="tag-list">
      {tags.map((tag) => (
        <li key={tag}>
          {onPick
            ? <button type="button" className="tag-chip tag-chip--btn" title={`Filter by ${tag}`} onClick={() => onPick(tag)}>{tag}</button>
            : <span className="tag-chip">{tag}</span>}
        </li>
      ))}
    </ul>
  );
}
