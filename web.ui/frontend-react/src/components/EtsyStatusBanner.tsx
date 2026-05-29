import { useCallback, useEffect, useState } from 'react';
import { getStatus, syncNow, type EtsyStatus } from '../api/etsy';
import { relTime } from '../lib/relativeTime';

interface Props {
  /** Called after a successful sync so the parent can refetch listings. */
  onSynced: () => void;
}

type BannerKind = 'not-configured' | 'no-token' | 'sync-failed' | 'ok' | 'loading';

function classify(status: EtsyStatus | null, syncError: string | null): BannerKind {
  if (!status) return 'loading';
  if (!status.configured) return 'not-configured';
  if (!status.tokenPresent) return 'no-token';
  if (syncError || status.lastError) return 'sync-failed';
  return 'ok';
}

export default function EtsyStatusBanner({ onSynced }: Props) {
  const [status, setStatus] = useState<EtsyStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setStatus(await getStatus());
    } catch {
      // If the status endpoint itself fails we leave the banner in
      // loading state; the catalog table renders independently.
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const handleSync = async () => {
    setSyncing(true);
    setSyncError(null);
    try {
      await syncNow();
      await refresh();
      onSynced();
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : String(err));
    } finally {
      setSyncing(false);
    }
  };

  const kind = classify(status, syncError);
  const syncButton = (
    <button
      type="button"
      className="btn btn--primary"
      onClick={() => void handleSync()}
      disabled={syncing || !status?.configured || !status?.tokenPresent}
      style={{ marginLeft: 'auto' }}
    >
      {syncing ? 'Syncing…' : 'Sync now'}
    </button>
  );

  const baseStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 10px',
    borderRadius: 4,
    marginBottom: '0.5rem',
  };

  if (kind === 'loading') {
    return <div role="status" style={baseStyle}>Loading Etsy status…</div>;
  }

  if (kind === 'not-configured' && status) {
    return (
      <div role="alert" style={{ ...baseStyle, background: '#fbe5e5', color: '#7a1024' }}>
        <span>
          <strong>Etsy not configured.</strong> Add {status.missingEnv.join(', ')} to{' '}
          <code>&lt;repo-root&gt;/.env.local</code>. See{' '}
          <code>web.ui/backend/.env.example</code>.
        </span>
        {syncButton}
      </div>
    );
  }

  if (kind === 'no-token') {
    return (
      <div role="alert" style={{ ...baseStyle, background: '#fbe5e5', color: '#7a1024' }}>
        <span>
          <strong>Etsy token missing.</strong> Bootstrap it with{' '}
          <code>cd projects/etsy-rooster-shop &amp;&amp; python scripts/etsy_oauth_setup.py</code>.
        </span>
        {syncButton}
      </div>
    );
  }

  if (kind === 'sync-failed' && status) {
    const msg = syncError ?? status.lastError ?? 'unknown error';
    const when = relTime(status.lastHeartbeatAt);
    return (
      <div role="alert" style={{ ...baseStyle, background: '#fff3cd', color: '#664d03' }}>
        <span>
          <strong>Last sync failed:</strong> {msg}
          {when ? ` (${when})` : ''}
        </span>
        {syncButton}
      </div>
    );
  }

  // ok
  const when = status ? relTime(status.lastSyncAt) : '';
  return (
    <div role="status" style={{ ...baseStyle, background: '#e6f7ec', color: '#1b6d3a' }}>
      <span>Synced {when || '—'}</span>
      {syncButton}
    </div>
  );
}
