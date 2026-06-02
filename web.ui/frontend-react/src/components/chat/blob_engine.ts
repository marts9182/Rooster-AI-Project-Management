import { createNoise2D } from 'simplex-noise';
import type { BlobMood } from '../../hooks/useChatBlob';

const N_POINTS = 16;

interface MoodParams {
  baseAmp: number;
  freq: number;
  speed: number;
}

const MOOD_TABLE: Record<BlobMood, MoodParams> = {
  idle:        { baseAmp: 0.16, freq: 1.2, speed: 0.9 },
  listening:   { baseAmp: 0.20, freq: 1.5, speed: 1.3 },
  thinking:    { baseAmp: 0.28, freq: 2.4, speed: 2.0 },
  responding:  { baseAmp: 0.24, freq: 1.8, speed: 2.4 },
  'tool-using':{ baseAmp: 0.34, freq: 3.0, speed: 2.8 },
  done:        { baseAmp: 0.14, freq: 1.1, speed: 0.8 },
  error:       { baseAmp: 0.22, freq: 1.6, speed: 1.6 },
};

export type Noise = (x: number, y: number) => number;

export function makeNoise(seed: number): Noise {
  const rng = mulberry32(seed);
  return createNoise2D(rng);
}

function mulberry32(seed: number) {
  let a = seed | 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function computeBlobPath({
  mood, t, size, noise,
}: { mood: BlobMood; t: number; size: number; noise: Noise }): string {
  const params = MOOD_TABLE[mood];
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.4;
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < N_POINTS; i += 1) {
    const angle = (i / N_POINTS) * Math.PI * 2;
    const nx = Math.cos(angle) * params.freq;
    const ny = Math.sin(angle) * params.freq;
    const offset = noise(nx + t * params.speed, ny) * params.baseAmp * r;
    const radius = r + offset;
    pts.push([cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius]);
  }
  return catmullRomToBezier(pts);
}

function catmullRomToBezier(pts: Array<[number, number]>): string {
  const n = pts.length;
  let d = `M ${pts[0][0].toFixed(3)},${pts[0][1].toFixed(3)}`;
  for (let i = 0; i < n; i += 1) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x.toFixed(3)},${c1y.toFixed(3)} ${c2x.toFixed(3)},${c2y.toFixed(3)} ${p2[0].toFixed(3)},${p2[1].toFixed(3)}`;
  }
  return d + ' Z';
}
