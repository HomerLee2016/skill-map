import { useRef } from 'react';
import { exportRevisionData, importRevisionData } from '../../services/revisionDb';
import { formatRevisionTimestamp } from '../../utils/proficiency';

export function RevisionDataButtons({ onImported }: { onImported: () => Promise<void> }) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <>
      <button
        type="button"
        className="toolbar-btn"
        onClick={() => fileInputRef.current?.click()}
      >
        Import Revision Data
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        style={{ display: 'none' }}
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          try {
            const text = await file.text();
            const imported = await importRevisionData(text);
            await onImported();
            window.alert(`Imported ${imported} revision records.`);
          } catch (error) {
            console.error(error);
            window.alert('Failed to import revision data.');
          } finally {
            event.target.value = '';
          }
        }}
      />
      <button
        type="button"
        className="toolbar-btn"
        onClick={async () => {
          try {
            const data = await exportRevisionData();
            const blob = new Blob([data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `revision-data-${formatRevisionTimestamp()}.json`;
            link.click();
            URL.revokeObjectURL(url);
          } catch (error) {
            console.error(error);
            window.alert('Failed to export revision data.');
          }
        }}>
        Export Revision Data
      </button>
    </>
  );
}
