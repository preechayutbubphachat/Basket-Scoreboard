// Real disposable-DB integration can cross Vitest's generic 5s limit under suite load.
// Keep this scoped to DB integration: retries stay disabled and slow migration-backed
// fixtures get enough time to finish under the full Vitest process.
export const DB_INTEGRATION_TEST_TIMEOUT_MS = 60_000;
export const DB_INTEGRATION_HOOK_TIMEOUT_MS = 60_000;
