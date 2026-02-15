import { getAdminFirestore } from "./firebase-admin";

const RATE_LIMIT_MINUTES = 10;
const RATE_LIMITS_COLLECTION = "rateLimits";

function hashIp(ip: string): string {
  let h = 0;
  for (let i = 0; i < ip.length; i++) {
    const c = ip.charCodeAt(i);
    h = (h << 5) - h + c;
    h = h & h;
  }
  return Math.abs(h).toString(36).slice(0, 16);
}

export async function checkRateLimit(ip: string): Promise<{ allowed: boolean; waitMinutes?: number }> {
  const db = getAdminFirestore();
  const id = hashIp(ip);
  const ref = db.collection(RATE_LIMITS_COLLECTION).doc(id);
  const doc = await ref.get();
  const now = new Date();
  const tenMinutesAgo = new Date(now.getTime() - RATE_LIMIT_MINUTES * 60 * 1000);

  if (!doc.exists) {
    return { allowed: true };
  }

  const data = doc.data();
  const lastRequestAt = data?.lastRequestAt?.toDate?.() as Date | undefined;
  if (!lastRequestAt || lastRequestAt < tenMinutesAgo) {
    return { allowed: true };
  }

  const waitMs = lastRequestAt.getTime() + RATE_LIMIT_MINUTES * 60 * 1000 - now.getTime();
  const waitMinutes = Math.ceil(waitMs / 60000);
  return { allowed: false, waitMinutes };
}

export async function recordRateLimit(ip: string): Promise<void> {
  const db = getAdminFirestore();
  const id = hashIp(ip);
  await db.collection(RATE_LIMITS_COLLECTION).doc(id).set({
    lastRequestAt: new Date(),
    ip,
  }, { merge: true });
}
