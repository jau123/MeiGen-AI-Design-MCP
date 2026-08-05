/**
 * 幂等 attempt 存储(2026-08-05 七审 P1 重构:区分 in-flight 与 retryable)。
 *
 * 语义:
 * - 并发同参数调用 = 各自独立的逻辑尝试 → 各拿新键(用户要两张图就该建两单;
 *   旧版单键合并会把第二张静默去重成第一张)
 * - 网络错误 / 5xx(服务端可能已扣点)→ 键转 retryable,宿主重试同参数复用同键,
 *   服务端同事务判重不双扣
 * - 提交成功 / 4xx 明确拒绝 → 释放(该尝试已终结)
 * 本地 stdio 进程有状态,模块级 Map;进程重启丢失 = 退化为无幂等,可接受。
 */
// TTL 覆盖服务端 40min 观察窗(九审 P1:10min 太短,慢任务重试窗内键就过期)
export const ATTEMPT_TTL_MS = 45 * 60_000

interface Attempt {
  key: string
  /**
   * in-flight:提交中/轮询中 | retryable:提交层失败可复用键 |
   * suspended:任务已建但轮询中断(十一审:只有这种情况才保留 generationId 供续查 ——
   * 正常成功/失败终态由工具层显式 ack 释放,「再来一张」永远是新单)
   */
  state: 'in-flight' | 'retryable' | 'suspended'
  createdAt: number
  generationId?: string
}

const attemptsBySig = new Map<string, Attempt[]>()

function prune(list: Attempt[]): Attempt[] {
  const now = Date.now()
  return list.filter((a) => now - a.createdAt < ATTEMPT_TTL_MS)
}

/** 全局轻量清扫(十一审非阻断:不再被访问的签名不应永久留在 Map)。条目数量级小。 */
function pruneAll(): void {
  for (const [sig, list] of attemptsBySig) {
    const alive = prune(list)
    if (alive.length === 0) attemptsBySig.delete(sig)
    else attemptsBySig.set(sig, alive)
  }
}

/**
 * 取一次逻辑尝试的键:优先复用 retryable(失败重试),否则新建 in-flight。
 * 返回 reused 标志(九审 P1):复用键的请求即使遇到 4xx 也不得释放 —— 该键可能
 * 对应服务端已扣费的任务,释放后下次铸新键会双扣;交给 TTL 自然过期。
 */
export function acquireAttempt(
  sig: string,
  newKey: () => string,
): { key: string; reused: boolean; priorGenerationId?: string } {
  pruneAll()
  const list = prune(attemptsBySig.get(sig) ?? [])
  // 同参数且此前「任务已建但轮询中断」(suspended):返回 priorGenerationId 直接续查,
  // 不再提交(提交即扣费)。正常成功/失败已被工具层 ack 释放 ——「再来一张」拿新单
  const suspended = list.find((a) => a.state === 'suspended' && a.generationId)
  if (suspended) {
    attemptsBySig.set(sig, list)
    return { key: suspended.key, reused: true, priorGenerationId: suspended.generationId }
  }
  const retryable = list.find((a) => a.state === 'retryable')
  if (retryable) {
    retryable.state = 'in-flight'
    retryable.createdAt = Date.now()
    attemptsBySig.set(sig, list)
    return { key: retryable.key, reused: true }
  }
  const attempt: Attempt = { key: newKey(), state: 'in-flight', createdAt: Date.now() }
  list.push(attempt)
  attemptsBySig.set(sig, list)
  return { key: attempt.key, reused: false }
}

/** 轮询中断(网络/安全阀):任务已建已扣费,挂起保留 generationId 供同参数重试续查。 */
export function suspendAttempt(sig: string, key: string, generationId: string): void {
  const list = attemptsBySig.get(sig)
  const attempt = list?.find((a) => a.key === key)
  if (attempt) {
    attempt.state = 'suspended'
    attempt.createdAt = Date.now()
    attempt.generationId = generationId
  }
}

/** 网络错误 / 5xx:该尝试可能已扣点,标记可复用。 */
export function markAttemptRetryable(sig: string, key: string): void {
  const list = attemptsBySig.get(sig)
  const attempt = list?.find((a) => a.key === key)
  if (attempt) attempt.state = 'retryable'
}

/** 提交成功或被明确拒绝(4xx):尝试终结,移除。 */
export function releaseAttempt(sig: string, key: string): void {
  const list = attemptsBySig.get(sig)
  if (!list) return
  const next = list.filter((a) => a.key !== key)
  if (next.length === 0) attemptsBySig.delete(sig)
  else attemptsBySig.set(sig, next)
}

/** 按 generationId 释放挂起尝试(check_generation 查到终态时调:该任务已了结,
 * 同参数下一次生成应是新单,不再返回旧任务)。 */
export function releaseByGenerationId(generationId: string): void {
  for (const [sig, list] of attemptsBySig) {
    const next = list.filter((a) => a.generationId !== generationId)
    if (next.length === 0) attemptsBySig.delete(sig)
    else if (next.length !== list.length) attemptsBySig.set(sig, next)
  }
}

/** 测试用:清空存储。 */
export function __resetAttempts(): void {
  attemptsBySig.clear()
}
