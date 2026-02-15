import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";

const ADMIN_COOKIE_NAME = "shs_admin";
const ADMIN_COOKIE_MAX_AGE_SEC = 60 * 60 * 24; // 24 horas

function getSecret(): string {
  const p = process.env.ADMIN_PASSWORD;
  if (!p) throw new Error("ADMIN_PASSWORD no está definida");
  return p;
}

export function getAdminPassword(): string {
  return getSecret();
}

function base64UrlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(str: string): Buffer {
  let b = str.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b.length % 4;
  if (pad) b += "=".repeat(4 - pad);
  return Buffer.from(b, "base64");
}

export function createSignedCookieValue(): string {
  const exp = Math.floor(Date.now() / 1000) + ADMIN_COOKIE_MAX_AGE_SEC;
  const payload = JSON.stringify({ exp });
  const payloadB64 = base64UrlEncode(Buffer.from(payload, "utf8"));
  const sig = createHmac("sha256", getSecret()).update(payloadB64).digest("hex");
  return `${payloadB64}.${sig}`;
}

export function verifySignedCookie(value: string): boolean {
  const dot = value.indexOf(".");
  if (dot === -1) return false;
  const payloadB64 = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  const expectedSig = createHmac("sha256", getSecret()).update(payloadB64).digest("hex");
  if (sig.length !== 64 || !timingSafeEqual(Buffer.from(sig, "utf8"), Buffer.from(expectedSig, "utf8"))) {
    return false;
  }
  try {
    const payload = JSON.parse(base64UrlDecode(payloadB64).toString("utf8"));
    return typeof payload.exp === "number" && payload.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export async function isAdminRequest(): Promise<boolean> {
  const c = await cookies();
  const token = c.get(ADMIN_COOKIE_NAME)?.value;
  return !!token && verifySignedCookie(token);
}

export async function setAdminCookie(): Promise<void> {
  const c = await cookies();
  c.set(ADMIN_COOKIE_NAME, createSignedCookieValue(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: ADMIN_COOKIE_MAX_AGE_SEC,
    path: "/",
  });
}

export async function clearAdminCookie(): Promise<void> {
  const c = await cookies();
  c.delete(ADMIN_COOKIE_NAME);
}
