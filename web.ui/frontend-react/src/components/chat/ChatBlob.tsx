import { useEffect, useRef } from 'react';
import { useChatBlobContext } from './ChatBlobContext';
import { computeBlobPath, makeNoise } from './blob_engine';

interface Props {
  size: 'sm' | 'md' | 'lg';
  onClick?: () => void;
}

const SIZE_PX: Record<Props['size'], number> = { sm: 36, md: 80, lg: 200 };

export default function ChatBlob({ size, onClick }: Props) {
  const ctx = useChatBlobContext();
  const pathRef = useRef<SVGPathElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(performance.now());
  // One shared seed so all three sizes sync.
  const noiseRef = useRef(makeNoise(1));

  useEffect(() => {
    function frame(now: number) {
      const t = (now - startedAtRef.current) / 1000;
      const d = computeBlobPath({
        mood: ctx.mood, t, size: SIZE_PX[size], noise: noiseRef.current,
      });
      if (pathRef.current) pathRef.current.setAttribute('d', d);
      rafRef.current = requestAnimationFrame(frame);
    }
    rafRef.current = requestAnimationFrame(frame);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [ctx.mood, size, ctx.tickKey]);

  const px = SIZE_PX[size];
  const errorTint = ctx.mood === 'error';
  return (
    <svg
      width={px}
      height={px}
      viewBox={`0 0 ${px} ${px}`}
      onClick={onClick}
      data-testid="chat-blob-svg"
      className={`chat-blob chat-blob-${size}${errorTint ? ' chat-blob-error' : ''}`}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      <defs>
        <linearGradient id={`chatblob-grad-${size}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={errorTint ? '#C0394B' : '#1F4F66'} />
          <stop offset="100%" stopColor={errorTint ? '#E8A0A0' : '#CAA457'} />
        </linearGradient>
        <filter id={`chatblob-glow-${size}`}>
          <feGaussianBlur stdDeviation={px / 60} />
        </filter>
      </defs>
      <path
        ref={pathRef}
        fill={`url(#chatblob-grad-${size})`}
        filter={`url(#chatblob-glow-${size})`}
        d=""
      />
    </svg>
  );
}
