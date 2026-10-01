// Stub until M11 adds token verification. Only localhost counts as verified for now.
const VERIFIED_HOSTS = new Set(["localhost", "127.0.0.1"]);

export class NotVerifiedError extends Error {
  constructor(url: string) {
    super(`${url} is not a verified domain. Active checks only run on localhost or a verified domain.`);
    this.name = "NotVerifiedError";
  }
}

export async function isVerified(url: string): Promise<boolean> {
  try {
    return VERIFIED_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

export async function assertVerified(url: string): Promise<void> {
  if (!(await isVerified(url))) throw new NotVerifiedError(url);
}
