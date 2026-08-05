import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('./video-capabilities.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`;
const { minimumVideoCredits, videoCapabilitiesForModel } = await import(moduleUrl);

const baseModel = {
  id: 'video-model',
  name: 'Video model',
  media_type: 'video',
  supported_ratios: ['16:9'],
  supports_4k: false,
  credits_per_generation: 10,
};

test('old /api/models cache falls back to legacy duration fields', () => {
  const capability = videoCapabilitiesForModel({
    ...baseModel,
    extra_config: {
      durations: [8, 4, 6],
      defaultDuration: 4,
      pricingPerSec: { '480p': 16 },
    },
  });

  assert.equal(capability.valid, true);
  assert.deepEqual(capability.outputDuration, {
    kind: 'enum',
    values: [4, 6, 8],
    default: 4,
  });
  assert.deepEqual(capability.billing, { mode: 'per_second', requestDefaultSeconds: 4 });
});

test('partial additive capability response cannot crash rendering', () => {
  const capability = videoCapabilitiesForModel({
    ...baseModel,
    extra_config: { durations: [5], defaultDuration: 5, pricingPerSec: { '480p': 16 } },
    capabilities: { video: { outputDuration: null } },
  });

  assert.equal(capability.valid, true);
  assert.equal(capability.outputDuration.default, 5);
});

test('server-declared invalid capability remains fail-closed', () => {
  const capability = videoCapabilitiesForModel({
    ...baseModel,
    extra_config: { durations: [5], defaultDuration: 5 },
    capabilities: {
      video: {
        valid: false,
        outputDuration: null,
        referenceVideo: { enabled: false, minSeconds: 0, maxSeconds: 0 },
        requiresFirstFrame: false,
      },
    },
  });

  assert.equal(capability.valid, false);
  assert.equal(capability.outputDuration, null);
});

test('server-declared invalid capability stays fail-closed with missing nested fields', () => {
  const capability = videoCapabilitiesForModel({
    ...baseModel,
    extra_config: { durations: [4], defaultDuration: 4 },
    capabilities: { video: { valid: false } },
  });

  assert.equal(capability.valid, false);
  assert.equal(capability.outputDuration, null);
});

test('first additive response without billing falls back to complete legacy fields', () => {
  const capability = videoCapabilitiesForModel({
    ...baseModel,
    extra_config: { durations: [4], defaultDuration: 4, pricingPerSec: { '480p': 16 } },
    capabilities: {
      video: {
        valid: true,
        outputDuration: { kind: 'range' },
        referenceVideo: { enabled: true, resolutionsByTier: { pro: '1080p' } },
        requiresFirstFrame: false,
      },
    },
  });

  assert.equal(capability.valid, true);
  assert.equal(capability.outputDuration.default, 4);
});

test('malformed current capability cannot crash rendering or revive legacy fields', () => {
  const capability = videoCapabilitiesForModel({
    ...baseModel,
    extra_config: { durations: [4], defaultDuration: 4, pricingPerSec: { '480p': 16 } },
    capabilities: {
      video: {
        valid: true,
        outputDuration: { kind: 'range' },
        referenceVideo: { enabled: false },
        billing: { mode: 'per_second', requestDefaultSeconds: 4 },
        requiresFirstFrame: false,
      },
    },
  });

  assert.equal(capability.valid, false);
  assert.equal(capability.outputDuration, null);
});

test('current capability exposes a distinct omitted-request default during rolling deployment', () => {
  const capability = videoCapabilitiesForModel({
    ...baseModel,
    extra_config: { pricingPerSec: { '480p': 16 } },
    capabilities: {
      video: {
        valid: true,
        outputDuration: { kind: 'range', min: 4, max: 15, step: 1, default: 4 },
        referenceVideo: { enabled: false, minSeconds: 0, maxSeconds: 0, maxUploadBytes: 0 },
        billing: { mode: 'per_second', requestDefaultSeconds: 5 },
        requiresFirstFrame: true,
      },
    },
  });

  assert.equal(capability.valid, true);
  assert.equal(capability.outputDuration.default, 4);
  assert.equal(capability.billing.requestDefaultSeconds, 5);
});

test('minimum video price comes from the pricing table, not credits_per_generation', () => {
  const model = {
    ...baseModel,
    credits_per_generation: 80,
    extra_config: {
      durations: [4, 5, 6],
      defaultDuration: 4,
      pricingPerSec: { '480p': 16, '720p': 28 },
    },
  };

  assert.equal(minimumVideoCredits(model), 64);
});

test('list_models production code uses the cache-compatible helper', async () => {
  const listModels = await readFile(new URL('../tools/list-models.ts', import.meta.url), 'utf8');
  assert.match(listModels, /videoCapabilitiesForModel\(m\)/);
  assert.match(listModels, /minimumVideoCredits\(m, video\)/);
  assert.match(listModels, /Video settings: temporarily unavailable/);
  assert.match(listModels, /may be per-second or per-call/);
  assert.doesNotMatch(listModels, /Pricing is per-second/);
});
