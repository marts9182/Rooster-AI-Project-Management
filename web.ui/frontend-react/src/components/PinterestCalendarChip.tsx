import type { PinterestQueueRow } from '../api/pinterest';
import { bookColor } from '../lib/bookColor';

interface Props {
  row: PinterestQueueRow;
  onClick: (row: PinterestQueueRow) => void;
}

export default function PinterestCalendarChip({ row, onClick }: Props) {
  const slug = row.book_slug ?? '';
  const abbrev = slug.slice(0, 6);
  const color = bookColor(slug);
  const title = `${row.title} · ${row.pin_type} · ${row.status}`;
  return (
    <button
      type="button"
      className={`pin-chip pin-chip--${row.status}`}
      style={{ background: color }}
      title={title}
      onClick={() => onClick(row)}
    >
      {abbrev}
    </button>
  );
}
