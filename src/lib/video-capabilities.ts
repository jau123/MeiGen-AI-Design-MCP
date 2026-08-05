import type { MeiGenModel } from './meigen-api.js'

type ApiVideoCapabilities = NonNullable<NonNullable<MeiGenModel['capabilities']>['video']>
export type McpVideoCapabilities = Omit<ApiVideoCapabilities, 'billing'> & {
  valid: boolean
  billing: NonNullable<ApiVideoCapabilities['billing']> | null
}

const LEGACY_REFERENCE_MIN_SECONDS = 2
const LEGACY_REFERENCE_MAX_SECONDS = 15
const LEGACY_REFERENCE_MAX_UPLOAD_BYTES = 50 * 1024 * 1024

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function strings(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const result = value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
  return result.length > 0 ? [...new Set(result)] : undefined
}

function positiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null
}

function strictStrings(value: unknown): string[] | undefined {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some((entry) => typeof entry !== 'string' || entry.length === 0)
  ) return undefined
  return [...new Set(value as string[])]
}

function invalidCapabilities(): McpVideoCapabilities {
  return {
    valid: false,
    outputDuration: null,
    referenceVideo: { enabled: false, minSeconds: 0, maxSeconds: 0, maxUploadBytes: 0 },
    billing: null,
    requiresFirstFrame: false,
  }
}

function normalizeCandidate(value: unknown): McpVideoCapabilities | null {
  const raw = record(value)
  if (!raw || typeof raw.valid !== 'boolean') return null
  if (!raw.valid) return invalidCapabilities()
  // Transitional CDN responses from the first additive contract had valid/output fields but no
  // billing. Fall back to their full legacy extra_config instead of declaring the model broken.
  if (raw.billing === undefined) return null
  if (typeof raw.requiresFirstFrame !== 'boolean') return invalidCapabilities()

  const output = record(raw.outputDuration)
  let outputDuration: McpVideoCapabilities['outputDuration'] = null
  if (output?.kind === 'enum' && Array.isArray(output.values)) {
    const values = output.values.map(positiveInteger)
    const requestedDefault = positiveInteger(output.default)
    if (
      values.length > 0 &&
      values.every((entry): entry is number => entry !== null) &&
      requestedDefault !== null &&
      values.includes(requestedDefault)
    ) {
      outputDuration = { kind: 'enum', values: [...new Set(values)], default: requestedDefault }
    }
  } else if (output?.kind === 'range') {
    const min = positiveInteger(output.min)
    const max = positiveInteger(output.max)
    const step = positiveInteger(output.step)
    const requestedDefault = positiveInteger(output.default)
    if (
      min !== null && max !== null && step !== null && requestedDefault !== null &&
      min <= max && requestedDefault >= min && requestedDefault <= max &&
      (requestedDefault - min) % step === 0
    ) {
      outputDuration = { kind: 'range', min, max, step, default: requestedDefault }
    }
  }
  if (!outputDuration) return invalidCapabilities()

  const billingRaw = record(raw.billing)
  const billingMode = billingRaw?.mode
  const requestDefaultSeconds = positiveInteger(billingRaw?.requestDefaultSeconds)
  const requestDefaultSupported =
    requestDefaultSeconds !== null &&
    (outputDuration.kind === 'enum'
      ? outputDuration.values.includes(requestDefaultSeconds)
      : requestDefaultSeconds >= outputDuration.min &&
        requestDefaultSeconds <= outputDuration.max &&
        (requestDefaultSeconds - outputDuration.min) % outputDuration.step === 0)
  if (
    (billingMode !== 'per_second' && billingMode !== 'per_call') ||
    !requestDefaultSupported ||
    requestDefaultSeconds === null
  ) return invalidCapabilities()

  const reference = record(raw.referenceVideo)
  if (!reference || typeof reference.enabled !== 'boolean') return invalidCapabilities()
  if (!reference.enabled) {
    return {
      valid: true,
      outputDuration,
      referenceVideo: { enabled: false, minSeconds: 0, maxSeconds: 0, maxUploadBytes: 0 },
      billing: { mode: billingMode, requestDefaultSeconds },
      requiresFirstFrame: raw.requiresFirstFrame,
    }
  }
  const minSeconds = positiveInteger(reference.minSeconds)
  const maxSeconds = positiveInteger(reference.maxSeconds)
  const maxUploadBytes = positiveInteger(reference.maxUploadBytes)
  const tiers = reference.tiers === undefined ? undefined : strictStrings(reference.tiers)
  const resolutions = reference.resolutions === undefined
    ? undefined
    : strictStrings(reference.resolutions)
  const rawByTier = reference.resolutionsByTier === undefined
    ? undefined
    : record(reference.resolutionsByTier)
  const resolutionsByTier: Record<string, string[]> = {}
  if (rawByTier) {
    for (const [tier, values] of Object.entries(rawByTier)) {
      const parsed = strictStrings(values)
      if (!tier || !parsed) return invalidCapabilities()
      resolutionsByTier[tier] = parsed
    }
  }
  if (
    minSeconds === null || maxSeconds === null || maxUploadBytes === null ||
    minSeconds > maxSeconds ||
    (reference.tiers !== undefined && !tiers) ||
    (reference.resolutions !== undefined && !resolutions) ||
    (reference.resolutionsByTier !== undefined && !rawByTier) ||
    (tiers && rawByTier && tiers.some((tier) => !resolutionsByTier[tier]))
  ) return invalidCapabilities()

  const referenceSeconds = billingRaw?.referenceSeconds
  if (
    billingMode !== 'per_second' ||
    (referenceSeconds !== 'output_only' &&
      referenceSeconds !== 'reference_plus_output' &&
      referenceSeconds !== 'reference_plus_output_with_minimum_table')
  ) return invalidCapabilities()

  return {
    valid: true,
    outputDuration,
    referenceVideo: {
      enabled: true,
      minSeconds,
      maxSeconds,
      maxUploadBytes,
      ...(tiers ? { tiers } : {}),
      ...(resolutions ? { resolutions } : {}),
      ...(rawByTier ? { resolutionsByTier } : {}),
    },
    billing: { mode: billingMode, requestDefaultSeconds, referenceSeconds },
    requiresFirstFrame: raw.requiresFirstFrame,
  }
}

function legacyCapabilities(model: MeiGenModel): McpVideoCapabilities {
  const config = model.extra_config ?? {}
  const durations = Array.isArray(config.durations)
    ? [...new Set(config.durations.filter(
        (entry): entry is number => Number.isInteger(entry) && entry > 0,
      ))].sort((a, b) => a - b)
    : []
  const requestedDefault =
    typeof config.defaultDuration === 'number' && Number.isInteger(config.defaultDuration)
      ? config.defaultDuration
      : null
  const defaultDuration =
    requestedDefault !== null && durations.includes(requestedDefault)
      ? requestedDefault
      : durations[0]

  const pricing = record(config.pricingPerSecWithVideo)
  const declaredTiers = strings(config.tiers)
  const tiers = declaredTiers?.filter((tier) => record(pricing?.[tier]))
  const resolutionsByTier = tiers && tiers.length > 0
    ? Object.fromEntries(tiers.flatMap((tier) => {
        const tierPricing = record(pricing?.[tier])
        const values = tierPricing ? Object.keys(tierPricing) : []
        return values.length > 0 ? [[tier, values] as const] : []
      }))
    : undefined
  const flatResolutions = !tiers?.length && pricing ? Object.keys(pricing) : undefined
  const referenceEnabled = config.supportsReferenceVideo === true
  // Old cached responses had no billing contract. Per-call is recognizable; all other legacy
  // video rows keep historical per-second/default-duration semantics until the API migration.
  const billingMode = record(config.pricingPerCall) ? 'per_call' : 'per_second'
  const billingValid =
    defaultDuration !== undefined &&
    (!referenceEnabled || billingMode === 'per_second')

  return {
    valid: billingValid,
    outputDuration: defaultDuration === undefined
      ? null
      : { kind: 'enum', values: durations, default: defaultDuration },
    referenceVideo: referenceEnabled
      ? {
          enabled: true,
          minSeconds: LEGACY_REFERENCE_MIN_SECONDS,
          maxSeconds: LEGACY_REFERENCE_MAX_SECONDS,
          maxUploadBytes: LEGACY_REFERENCE_MAX_UPLOAD_BYTES,
          ...(tiers?.length ? { tiers } : {}),
          ...(flatResolutions?.length ? { resolutions: flatResolutions } : {}),
          ...(resolutionsByTier && Object.keys(resolutionsByTier).length
            ? { resolutionsByTier }
            : {}),
        }
      : { enabled: false, minSeconds: 0, maxSeconds: 0, maxUploadBytes: 0 },
    billing: billingValid && defaultDuration !== undefined
      ? {
          mode: billingMode,
          requestDefaultSeconds: defaultDuration,
          ...(referenceEnabled
            ? {
                referenceSeconds: record(config.minBillableTable)
                  ? 'reference_plus_output_with_minimum_table' as const
                  : 'output_only' as const,
              }
            : {}),
        }
      : null,
    requiresFirstFrame: config.requiresFirstFrame === true,
  }
}

/** /api/models is cached; keep old responses useful while the additive contract rolls out. */
export function videoCapabilitiesForModel(model: MeiGenModel): McpVideoCapabilities {
  const candidate = normalizeCandidate(model.capabilities?.video)
  if (candidate) return candidate
  return legacyCapabilities(model)
}

function numbers(value: unknown): number[] {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return [value]
  const raw = record(value)
  return raw ? Object.values(raw).flatMap(numbers) : []
}

function supportsDuration(
  capability: NonNullable<McpVideoCapabilities['outputDuration']>,
  duration: number,
): boolean {
  return capability.kind === 'enum'
    ? capability.values.includes(duration)
    : duration >= capability.min &&
        duration <= capability.max &&
        (duration - capability.min) % capability.step === 0
}

function perCallPrices(
  value: unknown,
  capability: NonNullable<McpVideoCapabilities['outputDuration']>,
): number[] {
  const raw = record(value)
  if (!raw) return []
  return Object.entries(raw).flatMap(([key, entry]) => {
    const duration = Number(key)
    if (
      Number.isInteger(duration) &&
      supportsDuration(capability, duration) &&
      typeof entry === 'number' &&
      Number.isInteger(entry) &&
      entry >= 0
    ) return [entry]
    return perCallPrices(entry, capability)
  })
}

/** Exact minimum advertised output price; credits_per_generation is only a legacy display field. */
export function minimumVideoCredits(
  model: MeiGenModel,
  capabilities = videoCapabilitiesForModel(model),
): number | null {
  if (!capabilities.valid || !capabilities.outputDuration || !capabilities.billing) return null
  const config = model.extra_config ?? {}
  if (capabilities.billing.mode === 'per_call') {
    const prices = perCallPrices(config.pricingPerCall, capabilities.outputDuration)
    return prices.length > 0 ? Math.min(...prices) : null
  }
  const rates = numbers(config.pricingPerSec)
  const minDuration = capabilities.outputDuration.kind === 'enum'
    ? Math.min(...capabilities.outputDuration.values)
    : capabilities.outputDuration.min
  return rates.length > 0 ? Math.min(...rates) * minDuration : null
}
