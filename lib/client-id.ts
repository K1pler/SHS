import { cookies } from "next/headers";

const CLIENT_ID_COOKIE_NAME = "shs_cid";
const CLIENT_ID_MAX_AGE_SEC = 365 * 24 * 60 * 60; // 1 año

export async function getOrCreateClientId(): Promise<string> {
  const c = await cookies();
  const existing = c.get(CLIENT_ID_COOKIE_NAME)?.value;
  if (existing && existing.length > 0) {
    return existing;
  }
  const id = crypto.randomUUID();
  c.set(CLIENT_ID_COOKIE_NAME, id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: CLIENT_ID_MAX_AGE_SEC,
    path: "/",
  });
  return id;
}
