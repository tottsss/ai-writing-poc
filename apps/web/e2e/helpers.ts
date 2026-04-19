export const API_BASE = "http://localhost:8000";

export function randomEmail(prefix = "e2e"): string {
  const suffix = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${suffix}@e2e-demo.com`;
}
