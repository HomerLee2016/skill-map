import CodeEditor from '@uiw/react-textarea-code-editor';

interface YamlEditorPanelProps {
  yamlText: string;
  setYamlText: (value: string) => void;
  error: string | null;
  darkMode: boolean;
  width: number;
  startResize: (event: React.MouseEvent) => void;
}

export function YamlEditorPanel({ yamlText, setYamlText, error, darkMode, width, startResize }: YamlEditorPanelProps) {
  return (
    <>
      <div className="yaml-panel" style={{ width: `${width}px` }}>
        <div className="yaml-panel-header">📝 YAML Roadmap Editor</div>

        <div className="yaml-panel-body">
          <CodeEditor
            value={yamlText}
            language="yaml"
            placeholder="Please enter YAML code."
            onChange={(ev) => setYamlText(ev.target.value)}
            padding={15}
            className="yaml-editor"
            style={{
              fontSize: 14,
              backgroundColor: 'var(--yaml-editor-bg)',
              fontFamily: 'ui-monospace, SFMono-Regular, SF Mono, Consolas, Liberation Mono, Menlo, monospace',
              minHeight: '100%',
            }}
            data-color-mode={darkMode ? 'dark' : 'light'}
          />
        </div>

        {error && (
          <div className="yaml-error">
            <strong>Error:</strong> {error}
          </div>
        )}
      </div>
      <div className="panel-resizer" onMouseDown={startResize} />
    </>
  );
}
