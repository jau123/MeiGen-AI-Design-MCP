// attempt-store 合同测试(2026-08-05 七审 P1:并发/乱序/5xx/网络失败语义)
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('./attempt-store.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`;
const { acquireAttempt, suspendAttempt, markAttemptRetryable, releaseAttempt, __resetAttempts } = await import(moduleUrl);

let n = 0;
const newKey = () => `key-${++n}`;

test.beforeEach(() => {
  __resetAttempts();
  n = 0;
});

test('并发同参数各拿新键(两张图 = 两单,不静默合并)', () => {
  const { key: k1 } = acquireAttempt('sig-a', newKey);
  const { key: k2 } = acquireAttempt('sig-a', newKey); // k1 仍 in-flight → 必须新键
  assert.notEqual(k1, k2);
});

test('网络失败后重试复用同键(服务端判重不双扣)', () => {
  const { key: k1 } = acquireAttempt('sig-a', newKey);
  markAttemptRetryable('sig-a', k1);
  const { key: k2, reused } = acquireAttempt('sig-a', newKey);
  assert.equal(k2, k1);
  assert.equal(reused, true);
});

test('5xx 语义同网络失败:标记 retryable 后复用', () => {
  const { key: k1 } = acquireAttempt('sig-a', newKey);
  markAttemptRetryable('sig-a', k1); // 调用方对 5xx 走同一 API
  assert.equal(acquireAttempt('sig-a', newKey).key, k1);
});

test('成功/4xx 释放后,下次是全新键', () => {
  const { key: k1 } = acquireAttempt('sig-a', newKey);
  releaseAttempt('sig-a', k1);
  const { key: k2, reused } = acquireAttempt('sig-a', newKey);
  assert.notEqual(k2, k1);
  assert.equal(reused, false);
});

test('乱序:并发 A/B 中 A 失败 B 成功,重试只复用 A 的键', () => {
  const { key: kA } = acquireAttempt('sig-a', newKey);
  const { key: kB } = acquireAttempt('sig-a', newKey);
  markAttemptRetryable('sig-a', kA);
  releaseAttempt('sig-a', kB);
  assert.equal(acquireAttempt('sig-a', newKey).key, kA);
});

test('不同参数互不影响', () => {
  const { key: kA } = acquireAttempt('sig-a', newKey);
  markAttemptRetryable('sig-a', kA);
  assert.notEqual(acquireAttempt('sig-b', newKey).key, kA);
});

test('轮询中断挂起后,同参数重试拿回 priorGenerationId(续查不再提交)', () => {
  const { key } = acquireAttempt('sig-a', newKey);
  suspendAttempt('sig-a', key, 'gen-123');
  const again = acquireAttempt('sig-a', newKey);
  assert.equal(again.priorGenerationId, 'gen-123');
  assert.equal(again.reused, true);
});

test('正常终态 ack(release)后,同参数"再来一张"是全新单(十一审:不受时间窗劫持)', () => {
  const { key } = acquireAttempt('sig-a', newKey);
  // 模拟提交成功 → 轮询终态 → 工具层 ack
  releaseAttempt('sig-a', key);
  const again = acquireAttempt('sig-a', newKey);
  assert.equal(again.priorGenerationId, undefined);
  assert.equal(again.reused, false);
  assert.notEqual(again.key, key);
});

test('挂起键不阻塞不同参数的新请求', () => {
  const { key } = acquireAttempt('sig-a', newKey);
  suspendAttempt('sig-a', key, 'gen-123');
  const other = acquireAttempt('sig-b', newKey);
  assert.equal(other.priorGenerationId, undefined);
});

test('release 后同参数是全新尝试(409 换新键路径)', () => {
  const { key } = acquireAttempt('sig-a', newKey);
  markAttemptRetryable('sig-a', key);
  releaseAttempt('sig-a', key); // 409 idempotency_conflict → 强制换键
  const next = acquireAttempt('sig-a', newKey);
  assert.notEqual(next.key, key);
  assert.equal(next.reused, false);
});
