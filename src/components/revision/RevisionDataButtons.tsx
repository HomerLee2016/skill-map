import { useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { clearLocalRevisionData, exportRevisionData, importRevisionData } from '../../services/revisionDb';
import { formatRevisionTimestamp } from '../../utils/proficiency';
import { ClearLocalRevisionDialog } from './ClearLocalRevisionDialog';

export function RevisionDataButtons({ onImported, recordCount }: { onImported: () => Promise<void>; recordCount: number }) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { user } = useAuth();
  const [confirmingClear, setConfirmingClear] = useState(false);

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
      <button
        type="button"
        className="toolbar-btn"
        disabled={recordCount === 0}
        title="Delete this device's revision records for the open workspace (the cloud copy is not changed)"
        onClick={() => setConfirmingClear(true)}
      >
        Clear local data
      </button>
      {confirmingClear ? (
        <ClearLocalRevisionDialog
          recordCount={recordCount}
          signedIn={Boolean(user)}
          onCancel={() => setConfirmingClear(false)}
          onConfirm={async () => {
            await clearLocalRevisionData();
            await onImported();
            setConfirmingClear(false);
          }}
        />
      ) : null}
    </>
  );
}
