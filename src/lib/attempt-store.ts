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
export const ATTEMPT_TTL_MS = 10 * 60_000

interface Attempt {
  key: string
  state: 'in-flight' | 'retryable'
  createdAt: number
}

const attemptsBySig = new Map<string, Attempt[]>()

function prune(list: Attempt[]): Attempt[] {
  const now = Date.now()
  return list.filter((a) => now - a.createdAt < ATTEMPT_TTL_MS)
}

/** 取一次逻辑尝试的键:优先复用 retryable(失败重试),否则新建 in-flight。 */
export function acquireAttempt(sig: string, newKey: () => string): string {
  const list = prune(attemptsBySig.get(sig) ?? [])
  const retryable = list.find((a) => a.state === 'retryable')
  if (retryable) {
    retryable.state = 'in-flight'
    retryable.createdAt = Date.now()
    attemptsBySig.set(sig, list)
    return retryable.key
  }
  const attempt: Attempt = { key: newKey(), state: 'in-flight', createdAt: Date.now() }
  list.push(attempt)
  attemptsBySig.set(sig, list)
  return attempt.key
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

/** 测试用:清空存储。 */
export function __resetAttempts(): void {
  attemptsBySig.clear()
}
