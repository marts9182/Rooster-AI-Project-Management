import { useEffect, useRef } from 'react';
import { useChatBlobContext } from './ChatBlobContext';
import { computeBlobPath, makeNoise } from './blob_engine';
import './chat.css';

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
        <radialGradient id={`chatblob-grad-${size}`} cx="0.35" cy="0.35" r="0.85">
          {errorTint ? (
            <>
              <stop offset="0%" stopColor="#FF7A8A" />
              <stop offset="60%" stopColor="#E03A55" />
              <stop offset="100%" stopColor="#7A1024" />
            </>
          ) : (
            <>
              <stop offset="0%" stopColor="#7CC4FF" />
              <stop offset="55%" stopColor="#2E7CF6" />
              <stop offset="100%" stopColor="#0B3A8C" />
            </>
          )}
        </radialGradient>
        <filter id={`chatblob-glow-${size}`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation={Math.max(1, px / 30)} result="glow" />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
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
