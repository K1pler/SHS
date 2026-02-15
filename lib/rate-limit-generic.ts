import { getAdminFirestore } from "./firebase-admin";

const RATE_LIMITS_COLLECTION = "rateLimitsGeneric";

function hashIp(ip: string): string {
  let h = 0;
  for (let i = 0; i < ip.length; i++) {
    const c = ip.charCodeAt(i);
    h = (h << 5) - h + c;
    h = h & h;
  }
  return Math.abs(h).toString(36).slice(0, 16);
}

/**
 * Rate limit: max N requests per windowMinutes per IP.
 * Returns { allowed: true } or { allowed: false, retryAfterSeconds }.
 */
export async function checkGenericRateLimit(
  ip: string,
  kind: string,
  maxRequests: number,
  windowMinutes: number
): Promise<{ allowed: boolean; retryAfterSeconds?: number }> {
  const db = getAdminFirestore();
  const id = `${kind}_${hashIp(ip)}`;
  const ref = db.collection(RATE_LIMITS_COLLECTION).doc(id);
  const doc = await ref.get();
  const now = new Date();
  const windowMs = windowMinutes * 60 * 1000;
  const windowStart = new Date(now.getTime() - windowMs);

  if (!doc.exists) {
    return { allowed: true };
  }

  const data = doc.data();
  const windowStartAt = data?.windowStart?.toDate?.() as Date | undefined;
  const count = (data?.count as number) ?? 0;

  if (!windowStartAt || windowStartAt < windowStart) {
    return { allowed: true };
  }

  if (count >= maxRequests) {
    const windowEnd = new Date(windowStartAt.getTime() + windowMs);
    const retryAfterSeconds = Math.ceil((windowEnd.getTime() - now.getTime()) / 1000);
    return { allowed: false, retryAfterSeconds: Math.max(1, retryAfterSeconds) };
  }

  return { allowed: true };
}

export async function recordGenericRateLimit(
  ip: string,
  kind: string,
  windowMinutes: number
): Promise<void> {
  const db = getAdminFirestore();
  const id = `${kind}_${hashIp(ip)}`;
  const ref = db.collection(RATE_LIMITS_COLLECTION).doc(id);
  const doc = await ref.get();
  const now = new Date();
  const windowMs = windowMinutes * 60 * 1000;
  const windowStart = new Date(now.getTime() - windowMs);

  if (!doc.exists) {
    await ref.set({ count: 1, windowStart: now });
    return;
  }

  const data = doc.data();
  const windowStartAt = data?.windowStart?.toDate?.() as Date | undefined;
  const count = (data?.count as number) ?? 0;

  if (!windowStartAt || windowStartAt < windowStart) {
    await ref.set({ count: 1, windowStart: now });
  } else {
    await ref.update({ count: count + 1 });
  }
}
