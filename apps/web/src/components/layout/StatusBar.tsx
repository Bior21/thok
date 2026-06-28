/**
 * components/layout/StatusBar.tsx
 *
 * Connectivity and storage status bar — shown on every screen.
 *
 * Always visible so contributors always know:
 *   - Whether they are online / syncing / offline
 *   - How many entries are queued to upload
 *   - Whether they are approaching storage limits
 *
 * Storage gauge only appears at >= 70% to avoid visual clutter
 * during normal usage.
 */

'use client';

import { useAppStore } from '@/store/app';

export function StatusBar() {
  const connectivity = useAppStore(s => s.connectivity);
  const pendingCount = useAppStore(s => s.pendingCount);
  const storageInfo  = useAppStore(s => s.storageInfo);

  const showStorage = storageInfo?.isWarning ?? false;

  // Only show the bar when there's something worth telling the user.
  // "Online" with nothing pending is noise — hide it.
  const isQuiet = connectivity === 'online' && pendingCount === 0 && !showStorage;
  if (isQuiet) return null;

  const config = {
    online: {
      dotClass: 'bg-green-500',
      label: `${pendingCount} word${pendingCount === 1 ? '' : 's'} uploading…`,
    },
    syncing: {
      dotClass: 'bg-amber-400 animate-pulse',
      label: pendingCount > 0
        ? `Uploading ${pendingCount} entr${pendingCount === 1 ? 'y' : 'ies'}…`
        : 'Syncing…',
    },
    offline: {
      dotClass: 'bg-gray-400',
      label: pendingCount > 0
        ? `Offline — ${pendingCount} saved locally`
        : 'Offline — saving locally',
    },
  }[connectivity];

  return (
    <div className="px-4 pt-2 pb-1.5 space-y-1.5">

      {/* Connectivity row */}
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${config.dotClass}`} />
        <span className="text-xs text-gray-500">{config.label}</span>
      </div>

      {/* Storage gauge — only shown when >= 70% */}
      {showStorage && storageInfo && (
        <div className="space-y-0.5">
          <div className="flex justify-between text-xxs text-gray-400">
            <span>
              {storageInfo.isBlocked
                ? 'Storage full — sync required to continue'
                : `Storage ${storageInfo.percentUsed}% used`}
            </span>
            <span>{storageInfo.percentUsed}%</span>
          </div>
          <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                storageInfo.isBlocked ? 'bg-red-500' : 'bg-amber-400'
              }`}
              style={{ width: `${storageInfo.percentUsed}%` }}
            />
          </div>
        </div>
      )}

    </div>
  );
}
