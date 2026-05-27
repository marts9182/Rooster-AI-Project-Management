import type { PinterestHistoryRow } from '../api/pinterest';

interface Props {
  rows: PinterestHistoryRow[];
}

/**
 * Read-only table of the last N posting attempts. Successful rows show a
 * pin-id link to pinterest.com; failed rows surface the error message inline.
 */
export default function PinterestHistoryTable({ rows }: Props) {
  if (rows.length === 0) {
    return <p className="empty">No posting history yet.</p>;
  }
  return (
    <table className="pin-history-table">
      <thead>
        <tr>
          <th>Title</th>
          <th>Posted at</th>
          <th>Result</th>
          <th>Pin / Error</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id} className={row.success ? 'history-ok' : 'history-fail'}>
            <td>{row.title ?? `#${row.queue_id}`}</td>
            <td title={row.posted_at}>
              {new Date(row.posted_at).toLocaleString()}
            </td>
            <td>
              {row.success ? (
                <span className="badge badge-ok">✓ posted</span>
              ) : (
                <span className="badge badge-fail">⚠ failed</span>
              )}
            </td>
            <td>
              {row.success && row.pinterest_pin_id ? (
                <a
                  href={`https://www.pinterest.com/pin/${row.pinterest_pin_id}/`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {row.pinterest_pin_id}
                </a>
              ) : (
                <span className="muted">{row.error_message ?? ''}</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
