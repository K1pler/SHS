import { headers } from "next/headers";

export async function getClientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  const realIp = h.get("x-real-ip");
  if (forwarded) return forwarded.split(",")[0].trim();
  if (realIp) return realIp.trim();
  return "unknown";
}
