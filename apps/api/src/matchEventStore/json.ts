export function parseJsonField<T>(value: unknown): T {
  if (typeof value === "string") {
    return JSON.parse(value) as T;
  }

  return value as T;
}
