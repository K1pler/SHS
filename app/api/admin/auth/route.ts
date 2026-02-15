import { NextRequest, NextResponse } from "next/server";
import { getAdminPassword, isAdminRequest, setAdminCookie } from "@/lib/admin-auth";
import { getClientIp } from "@/lib/get-client-ip";
import { checkGenericRateLimit, recordGenericRateLimit } from "@/lib/rate-limit-generic";

const ADMIN_LOGIN_MAX_ATTEMPTS = 5;
const ADMIN_LOGIN_WINDOW_MINUTES = 15;

export async function GET() {
  const isAdmin = await isAdminRequest();
  return NextResponse.json({ admin: isAdmin });
}

export async function POST(request: NextRequest) {
  try {
    const ip = await getClientIp();
    const { allowed, retryAfterSeconds } = await checkGenericRateLimit(
      ip,
      "admin_login",
      ADMIN_LOGIN_MAX_ATTEMPTS,
      ADMIN_LOGIN_WINDOW_MINUTES
    );
    if (!allowed) {
      return NextResponse.json(
        { error: "Demasiados intentos. Espera unos minutos." },
        { status: 429, headers: { "Retry-After": String(retryAfterSeconds ?? 60) } }
      );
    }

    const body = await request.json();
    const password = typeof body.password === "string" ? body.password : "";

    const expected = getAdminPassword();
    if (!password || password !== expected) {
      await recordGenericRateLimit(ip, "admin_login", ADMIN_LOGIN_WINDOW_MINUTES);
      return NextResponse.json(
        { error: "Contraseña incorrecta" },
        { status: 401 }
      );
    }

    await setAdminCookie();

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("POST /api/admin/auth", e);
    return NextResponse.json(
      { error: "Error en la autenticación" },
      { status: 500 }
    );
  }
}
