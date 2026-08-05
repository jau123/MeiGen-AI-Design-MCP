// check_generation ↔ attempt-store 接线合同测试(2026-08-05 十三审:此前 10 项测试
// 只覆盖 store 纯逻辑,工具层 release 时序无覆盖 —— CLI 残留 ack 正是因此漏网)。
// 运行:node --import tsx --test(tsx 把 './check-generation.js' 映射到 .ts 源码)
import assert from 'node:assert/strict';
import test from 'node:test';

// tsconfig 是 Node16/CJS 输出,tsx 下具名导出折叠进 default —— 用 default interop 解构
import checkGenerationModule from './check-generation.js';
import attemptStoreModule from '../lib/attempt-store.js';

const { registerCheckGeneration } = checkGenerationModule;
const { acquireAttempt, suspendAttempt, __resetAttempts } = attemptStoreModule;

let n = 0;
const newKey = () => `key-${++n}`;

/** 捕获 server.tool 注册的 handler;apiClient 只需 getGenerationStatus。 */
function captureHandler(status) {
  let handler;
  const server = {
    tool: (..._args) => {
      handler = _args[_args.length - 1];
    },
  };
  const client = { getGenerationStatus: async () => status };
  registerCheckGeneration(server, client);
  return handler;
}

/** 造一个「任务已建但轮询中断」的挂起尝试,返回其签名。 */
function suspendedAttempt(generationId) {
  const sig = `sig-${generationId}`;
  const { key } = acquireAttempt(sig, newKey);
  suspendAttempt(sig, key, generationId);
  return sig;
}

test.beforeEach(() => {
  __resetAttempts();
  n = 0;
});

test('completed 有 URL:释放挂起尝试,同参数下次是新单', async () => {
  const sig = suspendedAttempt('gen-1');
  const handler = captureHandler({ status: 'completed', mediaType: 'image', imageUrls: ['https://images.meigen.ai/a.png'] });
  const res = await handler({ generationId: 'gen-1' });
  assert.equal(res.isError, undefined);
  assert.match(res.content[0].text, /completed/);
  assert.equal(acquireAttempt(sig, newKey).priorGenerationId, undefined); // 已释放
});

test('completed 但 URL 缺失:isError 且不释放(十三审 P1:防重提双扣)', async () => {
  const sig = suspendedAttempt('gen-2');
  const handler = captureHandler({ status: 'completed', mediaType: 'image', imageUrls: [] });
  const res = await handler({ generationId: 'gen-2' });
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /Do NOT re-submit/);
  assert.equal(acquireAttempt(sig, newKey).priorGenerationId, 'gen-2'); // 挂起保留
});

test('completed 视频缺 videoUrl 同样不释放', async () => {
  const sig = suspendedAttempt('gen-3');
  const handler = captureHandler({ status: 'completed', mediaType: 'video', videoUrl: undefined });
  const res = await handler({ generationId: 'gen-3' });
  assert.equal(res.isError, true);
  assert.equal(acquireAttempt(sig, newKey).priorGenerationId, 'gen-3');
});

test('failed:释放挂起尝试(已退款,同参数重来是新单)', async () => {
  const sig = suspendedAttempt('gen-4');
  const handler = captureHandler({ status: 'failed', error: 'boom' });
  const res = await handler({ generationId: 'gen-4' });
  assert.equal(res.isError, true);
  assert.equal(acquireAttempt(sig, newKey).priorGenerationId, undefined);
});

test('processing:不触碰尝试状态', async () => {
  const sig = suspendedAttempt('gen-5');
  const handler = captureHandler({ status: 'processing', pollHintSeconds: 600 });
  await handler({ generationId: 'gen-5' });
  assert.equal(acquireAttempt(sig, newKey).priorGenerationId, 'gen-5');
});

test('状态查询抛错:isError 且尝试保留', async () => {
  const sig = suspendedAttempt('gen-6');
  let handler;
  const server = { tool: (..._args) => { handler = _args[_args.length - 1]; } };
  const client = { getGenerationStatus: async () => { throw new Error('network down'); } };
  registerCheckGeneration(server, client);
  const res = await handler({ generationId: 'gen-6' });
  assert.equal(res.isError, true);
  assert.equal(acquireAttempt(sig, newKey).priorGenerationId, 'gen-6');
});
