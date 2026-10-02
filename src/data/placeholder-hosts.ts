// Web addresses that templates ship with and nobody owns for real use.
export const PLACEHOLDER_HOSTS: readonly string[] = ["yourwebsite.com", "example.com"];

// True when the hostname is a placeholder domain or a subdomain of one (www.yourwebsite.com).
export function isPlaceholderHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return PLACEHOLDER_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}
