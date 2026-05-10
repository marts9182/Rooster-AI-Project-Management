import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { ImageGenerationService, extractUpstreamMessage } from '../agents/ImageGenerationService.js';

// 1x1 transparent PNG, base64-encoded — small fixture for "what the model returned".
const FAKE_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

function makeMockClient(responseOrFn) {
  const generateContent = vi.fn(async (...args) => {
    return typeof responseOrFn === 'function' ? responseOrFn(...args) : responseOrFn;
  });
  return { client: { models: { generateContent } }, generateContent };
}

let tmpDir;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rooster-img-test-'));
});
afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('ImageGenerationService', () => {
  it('writes the returned PNG to disk and returns a /images/ URL', async () => {
    const { client, generateContent } = makeMockClient({
      candidates: [
        {
          content: {
            parts: [{ inlineData: { data: FAKE_PNG_BASE64, mimeType: 'image/png' } }],
          },
        },
      ],
    });

    const svc = new ImageGenerationService({
      apiKey: 'unused-because-client-is-injected',
      outputDir: tmpDir,
      client,
    });
    const result = await svc.generate({ prompt: 'a red square', taskId: 'task-42' });

    expect(generateContent).toHaveBeenCalledOnce();
    const callArg = generateContent.mock.calls[0][0];
    expect(callArg.config.responseModalities).toEqual(['IMAGE']);
    expect(callArg.config.imageConfig.aspectRatio).toBe('1:1');
    expect(callArg.config.imageConfig.imageSize).toBe('1K');
    // Text-only prompt → contents is just the string.
    expect(callArg.contents).toBe('a red square');

    expect(result.url).toBe(`/images/${result.filename}`);
    expect(result.filename.startsWith('task-42-')).toBe(true);
    expect(result.filename.endsWith('.png')).toBe(true);
    expect(result.bytes).toBeGreaterThan(0);
    expect(fs.existsSync(path.join(tmpDir, result.filename))).toBe(true);
  });

  it('passes through aspectRatio and resolution to imageConfig', async () => {
    const { client, generateContent } = makeMockClient({
      candidates: [{ content: { parts: [{ inlineData: { data: FAKE_PNG_BASE64, mimeType: 'image/png' } }] } }],
    });
    const svc = new ImageGenerationService({ apiKey: 'k', outputDir: tmpDir, client });
    await svc.generate({ prompt: 'p', aspectRatio: '16:9', resolution: '2K' });

    const cfg = generateContent.mock.calls[0][0].config.imageConfig;
    expect(cfg.aspectRatio).toBe('16:9');
    expect(cfg.imageSize).toBe('2K');
  });

  it('builds multimodal contents (image + text) for edit mode', async () => {
    const { client, generateContent } = makeMockClient({
      candidates: [{ content: { parts: [{ inlineData: { data: FAKE_PNG_BASE64, mimeType: 'image/png' } }] } }],
    });
    const svc = new ImageGenerationService({ apiKey: 'k', outputDir: tmpDir, client });
    await svc.generate({
      prompt: 'add a cat',
      inputImage: { data: FAKE_PNG_BASE64, mimeType: 'image/png' },
    });

    const contents = generateContent.mock.calls[0][0].contents;
    expect(Array.isArray(contents)).toBe(true);
    expect(contents).toHaveLength(2);
    expect(contents[0].inlineData.data).toBe(FAKE_PNG_BASE64);
    expect(contents[0].inlineData.mimeType).toBe('image/png');
    expect(contents[1].text).toBe('add a cat');
  });

  it('rejects empty prompts, bad aspect ratios, bad resolutions, and bad inputImage shape', async () => {
    const svc = new ImageGenerationService({ apiKey: 'k', outputDir: tmpDir, client: makeMockClient({}).client });

    await expect(svc.generate({ prompt: '' })).rejects.toThrow(/prompt is required/);
    await expect(svc.generate({ prompt: 'p', aspectRatio: '21:9' })).rejects.toThrow(/Invalid aspectRatio/);
    await expect(svc.generate({ prompt: 'p', resolution: '8K' })).rejects.toThrow(/Invalid resolution/);
    await expect(
      svc.generate({ prompt: 'p', inputImage: { data: 123, mimeType: 'image/png' } }),
    ).rejects.toThrow(/inputImage must be/);
  });

  it('throws a descriptive error when the model returns no image (e.g. text refusal)', async () => {
    const { client } = makeMockClient({
      candidates: [{ content: { parts: [{ text: 'I cannot produce that image.' }] } }],
    });
    const svc = new ImageGenerationService({ apiKey: 'k', outputDir: tmpDir, client });

    await expect(svc.generate({ prompt: 'something' })).rejects.toThrow(
      /Model returned no image data: I cannot produce that image\./,
    );
  });

  it('slugs taskId safely so filenames stay filesystem-clean', async () => {
    const { client } = makeMockClient({
      candidates: [{ content: { parts: [{ inlineData: { data: FAKE_PNG_BASE64, mimeType: 'image/png' } }] } }],
    });
    const svc = new ImageGenerationService({ apiKey: 'k', outputDir: tmpDir, client });

    const result = await svc.generate({ prompt: 'p', taskId: 'TASK/42 *weird*' });
    expect(result.filename).toMatch(/^task-42-weird-\d+-[a-z0-9]+\.png$/);
  });

  it('throws if neither apiKey nor client is provided', () => {
    expect(() => new ImageGenerationService({ outputDir: tmpDir })).toThrow(/requires apiKey/);
  });

  it('flattens upstream JSON errors from the SDK into a readable message', async () => {
    const sdkErr = new Error(JSON.stringify({
      error: {
        code: 429,
        status: 'RESOURCE_EXHAUSTED',
        message: 'Quota exceeded for free tier.',
      },
    }));
    const { client } = makeMockClient(() => { throw sdkErr; });
    const svc = new ImageGenerationService({ apiKey: 'k', outputDir: tmpDir, client });

    await expect(svc.generate({ prompt: 'p' })).rejects.toThrow(
      /^429 RESOURCE_EXHAUSTED: Quota exceeded for free tier\. \(model: /,
    );
  });
});

describe('extractUpstreamMessage', () => {
  it('parses single-wrapped JSON', () => {
    const err = new Error(JSON.stringify({
      error: { code: 404, status: 'NOT_FOUND', message: 'models/foo not found' },
    }));
    expect(extractUpstreamMessage(err, 'foo')).toBe('404 NOT_FOUND: models/foo not found (model: foo)');
  });

  it('parses double-wrapped JSON', () => {
    // Sometimes the route layer re-wraps. Make sure we still flatten.
    const inner = JSON.stringify({ error: { code: 502, message: 'upstream' } });
    const err = new Error(JSON.stringify({ error: inner }));
    expect(extractUpstreamMessage(err)).toContain('502');
    expect(extractUpstreamMessage(err)).toContain('upstream');
  });

  it('passes through plain-text errors unchanged', () => {
    const err = new Error('socket hang up');
    expect(extractUpstreamMessage(err)).toBe('socket hang up');
  });
});
