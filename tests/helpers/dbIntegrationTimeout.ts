// Real disposable-DB integration can cross Vitest's generic 5s limit under suite load.
// Keep this scoped to DB integration: retries stay disabled and work over 15s still fails.
export const DB_INTEGRATION_TEST_TIMEOUT_MS = 15_000;
export const DB_INTEGRATION_HOOK_TIMEOUT_MS = 15_000;
