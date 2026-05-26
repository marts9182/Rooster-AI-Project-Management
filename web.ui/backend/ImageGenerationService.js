/**
 * ImageGenerationService — Nano Banana Pro (Gemini 3 Pro Image) wrapper.
 *
 * Generates or edits an image via the Google Gemini API and writes the
 * resulting PNG to `web.ui/backend/generated-images/`. Returns a stable
 * relative URL (`/images/<filename>`) the frontend can render directly
 * and persist into task comments without bloating messages.json.
 *
 * Why a service (not an agent): the prior auto-firing Image Generator
 * agent (Riley Nakamura) was removed in 8a1a7be. This re-introduction is
 * user-triggered only — a "Generate Image" button on the task modal
 * calls POST /api/generate-image and gets back a URL.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Where generated PNGs are written. Served statically at /images/. */
const OUTPUT_DIR = path.resolve(__dirname, '..', 'generated-images');

/** Aspect ratios Nano Banana Pro accepts. */
const ALLOWED_ASPECT_RATIOS = new Set(['1:1', '16:9', '9:16', '4:3', '3:4']);

/** Resolutions Nano Banana Pro accepts (Pro only — base Nano Banana is 1K-only). */
const ALLOWED_RESOLUTIONS = new Set(['1K', '2K', '4K']);

const DEFAULT_MODEL = 'gemini-3-pro-image-preview';
const DEFAULT_ASPECT_RATIO = '1:1';
const DEFAULT_RESOLUTION = '1K';

/**
 * @typedef {object} GenerateOptions
 * @property {string} prompt                        - Text prompt describing the image.
 * @property {string} [aspectRatio]                 - One of 1:1, 16:9, 9:16, 4:3, 3:4.
 * @property {string} [resolution]                  - One of 1K, 2K, 4K (Pro model only).
 * @property {string} [taskId]                      - Optional task ID, used to slug the filename.
 * @property {{data: string, mimeType: string}} [inputImage] - Optional base64-encoded source image for edit mode.
 */

/**
 * @typedef {object} GenerateResult
 * @property {string} filename - Filename written under generated-images/.
 * @property {string} url      - Relative URL (e.g. "/images/foo.png") for the frontend.
 * @property {number} bytes    - Size of the written PNG in bytes.
 * @property {string} model    - Model that produced the image.
 * @property {string} mimeType - MIME type of the written file (typically image/png).
 */

export class ImageGenerationService {
  /**
   * @param {{
   *   apiKey: string,
   *   model?: string,
   *   outputDir?: string,
   *   client?: {models: {generateContent: Function}},
   * }} opts
   */
  constructor(opts) {
    const { apiKey, model = DEFAULT_MODEL, outputDir = OUTPUT_DIR, client } = opts || {};
    if (!client && !apiKey) {
      throw new Error('ImageGenerationService requires apiKey (or an injected client for tests)');
    }
    this.model = model;
    this.outputDir = outputDir;
    this._client = client; // injected client wins (tests); otherwise lazy-built on first call.
    this._apiKey = apiKey;

    // Ensure the output directory exists at construction. Cheap; idempotent.
    fs.mkdirSync(this.outputDir, { recursive: true });
  }

  /**
   * Lazily build the GoogleGenAI client. Tests inject one in the constructor
   * so this code path never runs under vitest — keeping the SDK out of the
   * test graph.
   */
  async _getClient() {
    if (this._client) return this._client;
    const { GoogleGenAI } = await import('@google/genai');
    this._client = new GoogleGenAI({ apiKey: this._apiKey });
    return this._client;
  }

  /**
   * Generate (or edit) an image and persist it to disk.
   *
   * @param {GenerateOptions} options
   * @returns {Promise<GenerateResult>}
   */
  async generate(options) {
    const {
      prompt,
      aspectRatio = DEFAULT_ASPECT_RATIO,
      resolution = DEFAULT_RESOLUTION,
      taskId,
      inputImage,
    } = options || {};

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      throw new Error('prompt is required and must be a non-empty string');
    }
    if (!ALLOWED_ASPECT_RATIOS.has(aspectRatio)) {
      throw new Error(
        `Invalid aspectRatio "${aspectRatio}". Must be one of ${[...ALLOWED_ASPECT_RATIOS].join(', ')}`,
      );
    }
    if (!ALLOWED_RESOLUTIONS.has(resolution)) {
      throw new Error(
        `Invalid resolution "${resolution}". Must be one of ${[...ALLOWED_RESOLUTIONS].join(', ')}`,
      );
    }
    if (inputImage) {
      if (typeof inputImage.data !== 'string' || typeof inputImage.mimeType !== 'string') {
        throw new Error('inputImage must be {data: base64-string, mimeType: string}');
      }
    }

    const client = await this._getClient();

    // contents is a multipart array when editing (image + prompt), or just
    // the prompt string for pure text-to-image. Order matters: source
    // image first, instruction second — matches the SDK's edit examples.
    const contents = inputImage
      ? [
          { inlineData: { data: inputImage.data, mimeType: inputImage.mimeType } },
          { text: prompt },
        ]
      : prompt;

    let response;
    try {
      response = await client.models.generateContent({
        model: this.model,
        contents,
        config: {
          responseModalities: ['IMAGE'],
          imageConfig: { aspectRatio, imageSize: resolution },
        },
      });
    } catch (err) {
      // The SDK packs the upstream JSON into err.message as a string. Surface
      // just the human-readable parts so callers don't have to re-parse it.
      throw new Error(extractUpstreamMessage(err, this.model));
    }

    // The SDK returns image bytes on a part's inlineData. Walk the candidates
    // array because the model may also include a small text part with
    // safety/refinement notes — we just want the first image.
    const candidates = response?.candidates ?? [];
    let imageData = null;
    let mimeType = 'image/png';
    for (const candidate of candidates) {
      const parts = candidate?.content?.parts ?? [];
      for (const part of parts) {
        if (part?.inlineData?.data) {
          imageData = part.inlineData.data;
          if (part.inlineData.mimeType) mimeType = part.inlineData.mimeType;
          break;
        }
      }
      if (imageData) break;
    }
    if (!imageData) {
      // Surface any text the model returned in the error — Gemini sometimes
      // refuses with a plain-text reason instead of an image.
      const textParts = candidates
        .flatMap((c) => c?.content?.parts ?? [])
        .map((p) => p?.text)
        .filter(Boolean);
      const refusal = textParts.length > 0 ? `: ${textParts.join(' ')}` : '';
      throw new Error(`Model returned no image data${refusal}`);
    }

    const buffer = Buffer.from(imageData, 'base64');
    const filename = this._buildFilename(taskId, mimeType);
    const fullPath = path.join(this.outputDir, filename);
    fs.writeFileSync(fullPath, buffer);

    return {
      filename,
      url: `/images/${filename}`,
      bytes: buffer.length,
      model: this.model,
      mimeType,
    };
  }

  /**
   * Build a deterministic-ish filename: <slug>-<ts>-<rand>.<ext>.
   * The `rand` suffix prevents collisions when two requests land in the
   * same millisecond (rare but possible during rapid clicks).
   */
  _buildFilename(taskId, mimeType) {
    const slug = String(taskId || 'image')
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'image';
    const ts = Date.now();
    const rand = Math.random().toString(36).slice(2, 8);
    const ext = mimeType.includes('jpeg') ? 'jpg' : 'png';
    return `${slug}-${ts}-${rand}.${ext}`;
  }
}

/**
 * Pull a clean human-readable message out of the SDK's error. The SDK packs
 * the entire upstream JSON body into `err.message` as a string (and sometimes
 * wraps it in another JSON envelope), so the raw value is unreadable in a UI.
 *
 * Examples we want to flatten:
 *   {"error":{"code":429,"message":"You exceeded your current quota..."}}
 *   {"error":"{\"error\":{\"code\":404,\"message\":\"models/foo not found\"}}"}
 *
 * Returns "<code> <status>: <message> (model: <name>)" when we can parse it,
 * otherwise the original message string.
 */
export function extractUpstreamMessage(err, modelHint) {
  const raw = err?.message || 'Image generation failed';
  let parsed = raw;
  for (let i = 0; i < 3; i++) {
    if (typeof parsed !== 'string') break;
    const trimmed = parsed.trim();
    if (!trimmed.startsWith('{')) break;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      break;
    }
    if (typeof parsed === 'object' && parsed && 'error' in parsed) {
      parsed = parsed.error;
    }
  }
  if (typeof parsed === 'object' && parsed && parsed.message) {
    const code = parsed.code ? `${parsed.code} ` : '';
    const status = parsed.status ? `${parsed.status}: ` : '';
    const tail = modelHint ? ` (model: ${modelHint})` : '';
    return `${code}${status}${parsed.message}${tail}`.trim();
  }
  return raw;
}

export {
  ALLOWED_ASPECT_RATIOS,
  ALLOWED_RESOLUTIONS,
  DEFAULT_ASPECT_RATIO,
  DEFAULT_RESOLUTION,
  DEFAULT_MODEL,
  OUTPUT_DIR,
};
