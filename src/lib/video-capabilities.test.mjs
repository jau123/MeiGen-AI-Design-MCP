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

const declaredBase = {
  valid: true,
  outputDuration: { kind: 'range', min: 4, max: 15, step: 1, default: 4 },
  billing: { mode: 'per_second', requestDefaultSeconds: 4, referenceSeconds: 'reference_plus_output' },
  requiresFirstFrame: false,
};

const enabledVideo = {
  enabled: true,
  minSeconds: 2,
  maxSeconds: 15,
  maxUploadBytes: 50 * 1024 * 1024,
};

test('reference video without the additive fields keeps the historical single-clip contract', () => {
  const capability = videoCapabilitiesForModel({
    ...baseModel,
    extra_config: { pricingPerSec: { '480p': 16 } },
    capabilities: { video: { ...declaredBase, referenceVideo: enabledVideo } },
  });

  assert.equal(capability.valid, true);
  assert.equal(capability.referenceVideo.maxCount, 1);
  assert.equal(capability.referenceVideo.maxTotalSeconds, 15);
  assert.equal(capability.referenceAudio.enabled, false);
});

test('declared clip count and total-seconds budget are parsed for a multi-clip model', () => {
  const capability = videoCapabilitiesForModel({
    ...baseModel,
    extra_config: { pricingPerSec: { '480p': 16 } },
    capabilities: {
      video: {
        ...declaredBase,
        referenceVideo: { ...enabledVideo, maxSeconds: 30, maxCount: 10, maxTotalSeconds: 30 },
        referenceAudio: {
          enabled: true, minSeconds: 2, maxSeconds: 30, maxCount: 10, maxTotalSeconds: 30,
          maxUploadBytes: 15 * 1024 * 1024, formats: ['WAV', 'mp3'], requiresVisualReference: false,
        },
      },
    },
  });

  assert.equal(capability.referenceVideo.maxCount, 10);
  assert.equal(capability.referenceVideo.maxTotalSeconds, 30);
  assert.deepEqual(capability.referenceAudio, {
    enabled: true, minSeconds: 2, maxSeconds: 30, maxCount: 10, maxTotalSeconds: 30,
    maxUploadBytes: 15 * 1024 * 1024, formats: ['wav', 'mp3'], requiresVisualReference: false,
  });
});

test('a malformed additive field fails closed instead of silently restoring a 1-clip cap', () => {
  for (const referenceVideo of [
    { ...enabledVideo, maxCount: 0 },
    { ...enabledVideo, maxCount: '3' },
    { ...enabledVideo, maxTotalSeconds: 20 }, // above the per-clip maximum the billing RPC checks
  ]) {
    const capability = videoCapabilitiesForModel({
      ...baseModel,
      extra_config: { durations: [4], defaultDuration: 4, pricingPerSec: { '480p': 16 } },
      capabilities: { video: { ...declaredBase, referenceVideo } },
    });
    assert.equal(capability.valid, false, JSON.stringify(referenceVideo));
  }
});

test('reference audio is independent of the video billing contract', () => {
  // The vendor bills input VIDEO seconds only, so audio must never be gated on
  // billing.referenceSeconds — a model can offer audio with reference video disabled.
  const capability = videoCapabilitiesForModel({
    ...baseModel,
    extra_config: { pricingPerSec: { '480p': 16 } },
    capabilities: {
      video: {
        ...declaredBase,
        billing: { mode: 'per_second', requestDefaultSeconds: 4 },
        referenceVideo: { enabled: false, minSeconds: 0, maxSeconds: 0, maxUploadBytes: 0 },
        referenceAudio: {
          enabled: true, minSeconds: 2, maxSeconds: 15, maxCount: 3, maxTotalSeconds: 15,
          maxUploadBytes: 15 * 1024 * 1024, formats: ['wav', 'mp3'], requiresVisualReference: true,
        },
      },
    },
  });

  assert.equal(capability.valid, true);
  assert.equal(capability.referenceVideo.enabled, false);
  assert.equal(capability.referenceAudio.enabled, true);
  assert.equal(capability.referenceAudio.requiresVisualReference, true);
});

test('a malformed reference-audio node fails the capability closed', () => {
  for (const referenceAudio of [
    { enabled: true },
    { enabled: 'yes', minSeconds: 2, maxSeconds: 15, maxCount: 3, maxTotalSeconds: 15, maxUploadBytes: 1, formats: ['wav'], requiresVisualReference: false },
    { enabled: true, minSeconds: 2, maxSeconds: 15, maxCount: 3, maxTotalSeconds: 15, maxUploadBytes: 1, formats: [], requiresVisualReference: false },
    { enabled: true, minSeconds: 2, maxSeconds: 15, maxCount: 2, maxTotalSeconds: 40, maxUploadBytes: 1, formats: ['wav'], requiresVisualReference: false },
  ]) {
    const capability = videoCapabilitiesForModel({
      ...baseModel,
      extra_config: { durations: [4], defaultDuration: 4, pricingPerSec: { '480p': 16 } },
      capabilities: { video: { ...declaredBase, referenceVideo: enabledVideo, referenceAudio } },
    });
    assert.equal(capability.valid, false, JSON.stringify(referenceAudio));
  }
});

test('list_models renders the clip budgets and the reference-audio line', async () => {
  const listModels = await readFile(new URL('../tools/list-models.ts', import.meta.url), 'utf8');
  assert.match(listModels, /up to \$\{clips\(referenceVideo\.maxCount\)\}, \$\{referenceVideo\.maxTotalSeconds\}s total/);
  assert.match(listModels, /Reference audio: /);
  assert.match(listModels, /referenceAudio\.formats\.join\('\/'\)/);
  assert.match(listModels, /requires at least one reference image or reference video/);
  assert.match(listModels, /audio seconds are not billed/);
});


test('video/audio combination restriction survives normalization without breaking older catalogs', () => {
  const audio = { enabled: true, minSeconds: 1, maxSeconds: 15, maxCount: 3, maxTotalSeconds: 45, maxUploadBytes: 16777216, formats: ['wav'], requiresVisualReference: true };
  for (const flag of [undefined, true, false, 'false', null]) {
    const contract = { outputDuration: { kind: 'enum', values: [5], default: 5 }, referenceVideo: { enabled: false },
      referenceAudio: { ...audio, ...(flag === undefined ? {} : { canCombineWithVideo: flag }) }, input: { requiresFirstFrame: false }, billing: { mode: 'per_second', requestDefaultSeconds: 5 } };
    for (const model of [
      { ...baseModel, capabilities: { video: { ...contract, valid: true, requiresFirstFrame: false } } },
    ]) {
      const caps = videoCapabilitiesForModel(model);
      assert.equal(caps.valid, flag === undefined || typeof flag === 'boolean');
      if (caps.valid) assert.equal(caps.referenceAudio.canCombineWithVideo, flag);
    }
  }
});


test('HeyGen public per-clip 5s and aggregate 15s remain distinct', () => {
  const referenceVideo = { enabled: true, minSeconds: 1, maxSeconds: 5, maxCount: 3, maxTotalSeconds: 15, maxUploadBytes: 16777216 };
  const caps = { ...declaredBase, referenceVideo };
  assert.equal(videoCapabilitiesForModel({ ...baseModel, capabilities: { video: caps } }).valid, true);
  assert.equal(videoCapabilitiesForModel({ ...baseModel, capabilities: { video: { ...caps, referenceVideo: { ...referenceVideo, maxTotalSeconds: 16 } } } }).valid, false);
});
