import { useMemo } from 'react';
import type { PinterestQueueRow } from '../api/pinterest';
import PinterestCalendarChip from './PinterestCalendarChip';

interface Props {
  rows: PinterestQueueRow[];
  start: Date;
  onChipClick: (row: PinterestQueueRow) => void;
}

const SLOT_HOURS = [9, 12, 15, 18];
const SLOT_LABELS = ['9 AM', '12 PM', '3 PM', '6 PM'];
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function dayCol(start: Date, offset: number) {
  const d = new Date(start);
  d.setDate(d.getDate() + offset);
  return d;
}

function fmtDay(d: Date) {
  return `${DAY_LABELS[d.getDay()]} ${d.getMonth() + 1}/${d.getDate()}`;
}

function slotIndex(iso: string | null): number {
  if (!iso) return -1;
  const h = new Date(iso).getHours();
  let best = 0;
  let bestDiff = Math.abs(SLOT_HOURS[0] - h);
  for (let i = 1; i < SLOT_HOURS.length; i++) {
    const diff = Math.abs(SLOT_HOURS[i] - h);
    if (diff < bestDiff) { best = i; bestDiff = diff; }
  }
  return best;
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth() === b.getMonth() &&
         a.getDate() === b.getDate();
}

export default function PinterestCalendar({ rows, start, onChipClick }: Props) {
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => dayCol(start, i)), [start]);

  return (
    <div className="pin-calendar">
      <div className="pin-calendar__row pin-calendar__head">
        <div className="pin-calendar__slot-label" aria-hidden />
        {days.map((d, i) => (
          <div key={i} className="pin-calendar__day-head">{fmtDay(d)}</div>
        ))}
      </div>
      {SLOT_HOURS.map((_, slotIdx) => (
        <div key={slotIdx} className="pin-calendar__row">
          <div className="pin-calendar__slot-label">{SLOT_LABELS[slotIdx]}</div>
          {days.map((d, di) => {
            const cellRows = rows.filter((r) => {
              if (!r.scheduled_for) return false;
              const rd = new Date(r.scheduled_for);
              return isSameDay(rd, d) && slotIndex(r.scheduled_for) === slotIdx;
            });
            return (
              <div key={di} className="pin-calendar__cell">
                {cellRows.length === 0 && <span className="pin-calendar__cell-empty" />}
                {cellRows.map((r) => (
                  <PinterestCalendarChip key={r.id} row={r} onClick={onChipClick} />
                ))}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
