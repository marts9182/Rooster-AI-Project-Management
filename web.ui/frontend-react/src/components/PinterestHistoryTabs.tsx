import { useEffect, useState, type ReactNode } from 'react';
import {
  getCadence, getEngagement,
  type CadenceResponse, type EngagementResponse,
} from '../api/pinterest';
import PinterestCadenceChart from './PinterestCadenceChart';
import PinterestEngagementTable from './PinterestEngagementTable';

type Tab = 'recent' | 'cadence' | 'engagement';

interface Props {
  recentChildren: ReactNode;
}

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'recent', label: 'Recent' },
  { id: 'cadence', label: 'Cadence' },
  { id: 'engagement', label: 'Engagement' },
];

export default function PinterestHistoryTabs({ recentChildren }: Props) {
  const [tab, setTab] = useState<Tab>(() => {
    try { return (localStorage.getItem('pinterest_history_tab') as Tab) ?? 'recent'; }
    catch { return 'recent'; }
  });
  const [cadence, setCadence] = useState<CadenceResponse | null>(null);
  const [engagement, setEngagement] = useState<EngagementResponse | null>(null);

  useEffect(() => {
    try { localStorage.setItem('pinterest_history_tab', tab); } catch { /* ignore */ }
    if (tab === 'cadence' && !cadence) void getCadence(30).then(setCadence).catch(() => setCadence(null));
    if (tab === 'engagement' && !engagement) void getEngagement(50).then(setEngagement).catch(() => setEngagement(null));
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <div role="tablist" style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '4px 10px',
              background: tab === t.id ? 'var(--accent)' : 'transparent',
              color: tab === t.id ? 'var(--accent-fg)' : 'var(--fg)',
              border: '1px solid var(--border)', borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'recent' && recentChildren}
      {tab === 'cadence' && cadence && (
        <PinterestCadenceChart data={cadence} onBarClick={() => { /* drill-in is v2 */ }} />
      )}
      {tab === 'cadence' && !cadence && <p>Loading…</p>}
      {tab === 'engagement' && engagement && <PinterestEngagementTable data={engagement} />}
      {tab === 'engagement' && !engagement && <p>Loading…</p>}
    </div>
  );
}
