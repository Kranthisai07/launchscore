// First 4 + "…" + last 4. Anything under 12 characters is hidden completely.
export function redact(value: string): string {
  if (value.length < 12) return "[redacted]";
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}
