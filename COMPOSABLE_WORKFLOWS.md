# Remote workflow composition

Use the caller's existing MeiGen connection and live tool schemas. Native HTTP and the npm 4.0 bridge call the same service. Preserve the approved prompt, model, ratio, references, count and budget. BYOK/local-file workflows stay on meigen@3.4.0 unless the user chooses migration.

1. Read list_models/list_skills for current inputs, capabilities and prices.
2. Prepare real supported reference URLs/uploads; the remote server cannot read local paths.
3. Persist one requestId and exact inputs per logical step before submission. Use wait=false when supported.
4. After interruption, query check_generation/check_skill with the same requestId or returned ID. Follow nextAction; never invent a replacement paid job as a retry.
5. Chain actual completed URLs into dependent steps. The caller bounds concurrency and reserves estimated in-flight costs; backend limits remain authoritative. No atomic multi-step budget is promised.
6. Return structured results, handles, partial failures and refunds. The host owns preview/download. Saving a favorite requires explicit intent or prior opt-in.

See [migration](MIGRATION.md) and live server instructions. Historical local composition examples remain in the v3.4.0 Git tag.
