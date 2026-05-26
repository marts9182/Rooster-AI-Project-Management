import { useState } from 'react';
import {
  generateImage,
  type ImageAspectRatio,
  type ImageResolution,
  type GenerateImageResponse,
} from '../services/api';

interface Props {
  taskId: string;
  /** Optional callback so the parent can append the image as a comment. */
  onGenerated?: (result: GenerateImageResponse) => void;
}

const ASPECT_RATIOS: ImageAspectRatio[] = ['1:1', '16:9', '9:16', '4:3', '3:4'];
const RESOLUTIONS: ImageResolution[] = ['1K', '2K', '4K'];

/**
 * Reads a File as base64 (without the "data:...;base64," prefix), which is
 * what the backend's inputImage.data field expects.
 */
function fileToBase64(file: File): Promise<{ data: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'));
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      resolve({
        data: comma >= 0 ? result.slice(comma + 1) : result,
        mimeType: file.type || 'image/png',
      });
    };
    reader.readAsDataURL(file);
  });
}

export default function ImageGenPanel({ taskId, onGenerated }: Props) {
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<ImageAspectRatio>('1:1');
  const [resolution, setResolution] = useState<ImageResolution>('1K');
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateImageResponse | null>(null);

  async function handleGenerate() {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const inputImage = sourceFile ? await fileToBase64(sourceFile) : undefined;
      const res = await generateImage({
        prompt: prompt.trim(),
        taskId,
        aspectRatio,
        resolution,
        inputImage,
      });
      setResult(res);
      onGenerated?.(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Image generation failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="image-gen-panel">
      <b>🎨 Generate image</b>
      <textarea
        className="image-gen-prompt"
        placeholder="Describe the image (e.g. 'mockup of a dark-mode login screen with a rooster mascot')"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={3}
        disabled={busy}
        aria-label="Image prompt"
      />
      <div className="image-gen-controls">
        <label>
          Aspect&nbsp;
          <select
            value={aspectRatio}
            onChange={(e) => setAspectRatio(e.target.value as ImageAspectRatio)}
            disabled={busy}
          >
            {ASPECT_RATIOS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </label>
        <label>
          Size&nbsp;
          <select
            value={resolution}
            onChange={(e) => setResolution(e.target.value as ImageResolution)}
            disabled={busy}
          >
            {RESOLUTIONS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </label>
        <label className="image-gen-file">
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setSourceFile(e.target.files?.[0] ?? null)}
            disabled={busy}
          />
          {sourceFile ? (
            <span>Edit: {sourceFile.name} <button type="button" onClick={() => setSourceFile(null)} disabled={busy}>×</button></span>
          ) : (
            <span className="image-gen-hint">+ image (optional, for editing)</span>
          )}
        </label>
        <button type="button" onClick={handleGenerate} disabled={busy || !prompt.trim()}>
          {busy ? 'Generating…' : 'Generate'}
        </button>
      </div>
      {error && <div className="image-gen-error" role="alert">{error}</div>}
      {result && (
        <div className="image-gen-result">
          <img src={result.url} alt={prompt} />
          <div className="image-gen-meta">
            <a href={result.url} target="_blank" rel="noreferrer">{result.url}</a>
            <span> · {result.model} · {(result.bytes / 1024).toFixed(0)} KB</span>
          </div>
        </div>
      )}
    </div>
  );
}
