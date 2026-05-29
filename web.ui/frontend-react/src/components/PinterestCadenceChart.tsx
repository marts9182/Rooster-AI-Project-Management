import type { CadenceResponse, CadenceBucket } from '../api/pinterest';

interface Props {
  data: CadenceResponse;
  onBarClick: (bucket: CadenceBucket) => void;
}

const WIDTH = 600;
const HEIGHT = 180;
const PADDING_BOTTOM = 24;
const PADDING_TOP = 8;

export default function PinterestCadenceChart({ data, onBarClick }: Props) {
  const { buckets, target_per_day, summary } = data;
  const maxVal = Math.max(target_per_day, ...buckets.map((b) => b.posted + b.failed)) || 1;
  const barW = (WIDTH - 8) / buckets.length;
  const yFor = (n: number) => HEIGHT - PADDING_BOTTOM - (n / maxVal) * (HEIGHT - PADDING_BOTTOM - PADDING_TOP);
  const successPct = Math.round(summary.success_rate * 100);
  const avg = summary.avg_per_day.toFixed(1);

  return (
    <div>
      <p style={{ margin: '0 0 8px' }}>
        Posted {summary.posted} over {data.days} days · {successPct}% success ·
        ~{avg}/day vs target {target_per_day}/day
      </p>
      <svg width={WIDTH} height={HEIGHT} role="img" aria-label="Posting cadence">
        <line
          x1={0} x2={WIDTH}
          y1={yFor(target_per_day)} y2={yFor(target_per_day)}
          stroke="var(--muted)" strokeDasharray="4 4"
        />
        {buckets.map((b, i) => {
          const x = i * barW + 4;
          const postedH = HEIGHT - PADDING_BOTTOM - yFor(b.posted);
          const failedH = HEIGHT - PADDING_BOTTOM - yFor(b.posted + b.failed) - postedH;
          return (
            <g key={b.date}
               className="cadence-bar"
               style={{ cursor: 'pointer' }}
               onClick={() => onBarClick(b)}>
              <rect x={x} y={yFor(b.posted)} width={barW - 2} height={postedH}
                    fill="#16a34a" />
              <rect x={x} y={yFor(b.posted + b.failed)} width={barW - 2} height={failedH}
                    fill="#dc2626" />
              <rect x={x} y={PADDING_TOP} width={barW - 2}
                    height={HEIGHT - PADDING_BOTTOM - PADDING_TOP}
                    fill="transparent" />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
