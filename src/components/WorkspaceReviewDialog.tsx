import { useState } from 'react';
import { createPortal } from 'react-dom';
import { SplitPicker } from './SplitPicker';
import { countLabel, resolveReview, type ReviewItem } from '../services/contentReview';

interface WorkspaceReviewDialogProps {
  items: ReviewItem[];
  /** The refs kept, or `null` to sync none of these items. */
  onDone: (keep: Set<string> | null) => void;
}

const GROUP_CLOUD = 'Missing here (in cloud)';
const GROUP_DEVICE = 'Extra here (not in cloud)';

/** Lessons and tests that exist on one side only: choose what the synced workspace keeps, then confirm any removal. */
export function WorkspaceReviewDialog({ items, onDone }: WorkspaceReviewDialogProps) {
  const [keep, setKeep] = useState(() => new Set(items.filter((item) => item.keepByDefault).map((item) => item.ref)));
  const [confirming, setConfirming] = useState(false);
  const pickerItems = items.map((item) => ({
    key: item.ref, label: item.title, tag: item.kind === 'tests' ? 'test' : 'lesson', group: item.origin === 'cloud' ? GROUP_CLOUD : GROUP_DEVICE,
  }));
  const outcome = resolveReview(items, keep);
  const byRef = new Map(items.map((item) => [item.ref, item]));
  const fromDevice = outcome.removeFromDevice.map((ref) => byRef.get(ref)!);
  const fromCloud = outcome.removeFromCloud.map((ref) => byRef.get(ref)!);
  const removeCount = fromDevice.length + fromCloud.length;
  const missing = items.filter((item) => item.origin === 'cloud');
  const extra = items.filter((item) => item.origin === 'device');

  return createPortal(
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal-dialog split-review-dialog">
        {confirming ? (
          <>
            <h3 className="modal-title">Remove {removeCount} item{removeCount === 1 ? '' : 's'}?</h3>
            {fromDevice.length > 0 ? (
              <div className="split-review-warn">
                <strong>From this device ({countLabel(fromDevice)}) — moved to .skill-map-trash in your folder:</strong>
                <ul>{fromDevice.map((item) => <li key={item.ref}>{item.title}</li>)}</ul>
              </div>
            ) : null}
            {fromCloud.length > 0 ? (
              <div className="split-review-warn">
                <strong>From your cloud account ({countLabel(fromCloud)}) — your other devices will remove them too:</strong>
                <ul>{fromCloud.map((item) => <li key={item.ref}>{item.title}</li>)}</ul>
              </div>
            ) : null}
            <p>Your revision history is not touched. Are you sure?</p>
            <div className="modal-actions">
              <button type="button" className="modal-btn-cancel" onClick={() => setConfirming(false)}>← Back to review</button>
              <button type="button" className="modal-btn-save split-review-danger" onClick={() => onDone(keep)}>Yes, remove {removeCount}</button>
            </div>
          </>
        ) : (
          <>
            <h3 className="modal-title">Review workspace sync</h3>
            <p>This device and your cloud copy don't match. Choose what the workspace should contain.</p>
            <p className="split-review-summary">
              {missing.length > 0 ? <>Missing here: {countLabel(missing)}. </> : null}
              {extra.length > 0 ? <>Extra here: {countLabel(extra)}.</> : null}
            </p>
            <SplitPicker items={pickerItems} keep={keep} onChange={setKeep} groups={[GROUP_CLOUD, GROUP_DEVICE]} leftTitle="Not keeping" rightTitle="Keeping" />
            <div className="modal-actions">
              <button type="button" className="modal-btn-cancel" onClick={() => setKeep(new Set(items.filter((item) => item.keepByDefault).map((item) => item.ref)))}>Reset</button>
              <button type="button" className="modal-btn-cancel" onClick={() => onDone(null)}>Cancel (sync none of these)</button>
              <button type="button" className="modal-btn-save" onClick={() => (removeCount > 0 ? setConfirming(true) : onDone(keep))}>Apply</button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
