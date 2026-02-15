import { cookies } from "next/headers";

const ADMIN_COOKIE_NAME = "shs_admin";
const ADMIN_COOKIE_VALUE = "1"; // En producción usar un token firmado (ej. JWT)

export function getAdminPassword(): string {
  const p = process.env.ADMIN_PASSWORD;
  if (!p) throw new Error("ADMIN_PASSWORD no está definida");
  return p;
}

export async function isAdminRequest(): Promise<boolean> {
  const c = await cookies();
  const token = c.get(ADMIN_COOKIE_NAME)?.value;
  return token === ADMIN_COOKIE_VALUE;
}

export async function setAdminCookie(): Promise<void> {
  const c = await cookies();
  c.set(ADMIN_COOKIE_NAME, ADMIN_COOKIE_VALUE, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24, // 24 horas
    path: "/",
  });
}

export async function clearAdminCookie(): Promise<void> {
  const c = await cookies();
  c.delete(ADMIN_COOKIE_NAME);
}
