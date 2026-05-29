import type { EngagementResponse } from '../api/pinterest';

interface Props {
  data: EngagementResponse;
}

function fmt(n: number | null): string {
  return n == null ? '—' : String(n);
}

export default function PinterestEngagementTable({ data }: Props) {
  return (
    <div>
      {data.engagement_disabled && (
        <p role="status" style={{ background: '#fff3cd', color: '#664d03', padding: '6px 10px', borderRadius: 4 }}>
          Pinterest analytics not available for this app — engagement columns will stay empty.
        </p>
      )}
      <table>
        <thead>
          <tr>
            <th>Pin</th><th>Book</th><th>Posted</th>
            <th>Saves</th><th>Clicks</th><th>Impr.</th><th>Link</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r) => (
            <tr key={r.history_id}>
              <td>
                {r.image_path && <img src={r.image_path} alt="" style={{ width: 48, height: 'auto' }} />}
              </td>
              <td>{r.book_slug ?? '—'}</td>
              <td>{r.posted_at.slice(0, 10)}</td>
              <td>{fmt(r.saves)}</td>
              <td>{fmt(r.clicks)}</td>
              <td>{fmt(r.impressions)}</td>
              <td>{r.pinterest_url ? <a href={r.pinterest_url} target="_blank" rel="noopener noreferrer">→</a> : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
