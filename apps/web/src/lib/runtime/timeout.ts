const DEFAULT_TIMEOUT_MS = 45_000;

function normalizeTimeoutMs(timeoutMs: number): number {
  if (!Number.isFinite(timeoutMs)) return DEFAULT_TIMEOUT_MS;
  return Math.max(1, Math.round(timeoutMs));
}

export const CLIENT_ACTION_TIMEOUT_MS = DEFAULT_TIMEOUT_MS;

export async function withTimeoutOrNull<T>(
  promise: Promise<T>,
  timeoutMs: number
): Promise<T | null> {
  const resolvedTimeoutMs = normalizeTimeoutMs(timeoutMs);
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<null>((resolve) => {
    timeoutId = setTimeout(() => resolve(null), resolvedTimeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export async function withTimeoutOrError<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutError: Error
): Promise<T> {
  const resolvedTimeoutMs = normalizeTimeoutMs(timeoutMs);
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => reject(timeoutError), resolvedTimeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
