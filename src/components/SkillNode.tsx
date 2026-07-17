import { Handle, Position } from 'reactflow';
import type { NodeProps } from 'reactflow';
import { getLessonById, getTestById } from '../utils/contentCatalog';

interface SkillNodeData {
  label: string;
  description?: string;
  finished?: boolean;
  url?: string;
  lessons?: string[];
  tests?: string[];
  subTreeId?: string;
  showDescription: boolean;
  onLabelChange: (id: string, newLabel: string) => void;
  onToggleFinished: (id: string, finished: boolean) => void;
  onEditClick: (id: string) => void;
  onGoToSubTree: (id: string) => void;
  onGoToLesson?: (id: string) => void;
  onGoToTest?: (id: string) => void;
}

export function SkillNode({ id, data, selected }: NodeProps<SkillNodeData>) {
  const className = [
    'skill-node',
    selected ? 'skill-node--selected' : '',
    data.finished ? 'skill-node--finished' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const linkedLessons = (data.lessons || [])
    .map((lessonId) => getLessonById(lessonId))
    .filter(Boolean);
  const linkedTests = (data.tests || [])
    .map((testId) => getTestById(testId))
    .filter(Boolean);

  return (
    <div
      className={className}
      onDoubleClick={(e) => {
        e.stopPropagation();
        data.onEditClick(id);
      }}
      title="Double-click to edit"
    >
      <div className="skill-node-checkbox-wrap">
        <input
          type="checkbox"
          className="skill-node-checkbox"
          checked={!!data.finished}
          onChange={(e) => data.onToggleFinished(id, e.target.checked)}
          title="Mark as completed"
        />
      </div>

      <div className="skill-node-edit-wrap">
        <button
          className="skill-node-edit-btn"
          onClick={() => data.onEditClick(id)}
          title="Edit Node Details"
        >
          ✏️
        </button>
      </div>

      <div className="skill-node-body">
        <div
          className={
            data.finished ? 'skill-node-label skill-node-label--finished' : 'skill-node-label'
          }
        >
          {data.label}
        </div>
      </div>

      {data.showDescription && data.description && (
        <div className="skill-node-description">{data.description}</div>
      )}

      {data.subTreeId && (
        <div className="skill-node-subtree">
          <button
            className="skill-node-subtree-btn"
            onClick={() => data.subTreeId && data.onGoToSubTree(data.subTreeId)}
          >
            📂 Go to Sub-tree
          </button>
        </div>
      )}

      {(linkedLessons.length > 0 || linkedTests.length > 0 || data.url) && (
        <div className="skill-node-links">
          {data.url && (
            <a
              href={data.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="skill-node-link"
              title="Open reference link"
            >
              🔗
            </a>
          )}
          {linkedLessons.map((lesson) => (
            <button
              key={lesson!.id}
              type="button"
              className="skill-node-content-link"
              onClick={(e) => {
                e.stopPropagation();
                data.onGoToLesson?.(lesson!.id);
              }}
              title={`Open lesson: ${lesson!.title}`}
            >
              📚
            </button>
          ))}
          {linkedTests.map((test) => (
            <button
              key={test!.id}
              type="button"
              className="skill-node-content-link"
              onClick={(e) => {
                e.stopPropagation();
                data.onGoToTest?.(test!.id);
              }}
              title={`Open test: ${test!.title}`}
            >
              📝
            </button>
          ))}
        </div>
      )}

      <Handle
        type="target"
        position={Position.Top}
        id="target"
        isConnectable={true}
        title="Previous Skill (Connect to here)"
      />

      <Handle
        type="source"
        position={Position.Bottom}
        id="source"
        isConnectable={true}
        title="Next Skill (Drag from here)"
      />
    </div>
  );
}
