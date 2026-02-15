import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAdminPassword } from "@/lib/admin-auth";
import { isAdminRequest } from "@/lib/admin-auth";

const ADMIN_COOKIE_NAME = "shs_admin";
const ADMIN_COOKIE_VALUE = "1";

export async function GET() {
  const isAdmin = await isAdminRequest();
  return NextResponse.json({ admin: isAdmin });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const password = typeof body.password === "string" ? body.password : "";

    const expected = getAdminPassword();
    if (!password || password !== expected) {
      return NextResponse.json(
        { error: "Contraseña incorrecta" },
        { status: 401 }
      );
    }

    const c = await cookies();
    c.set(ADMIN_COOKIE_NAME, ADMIN_COOKIE_VALUE, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24,
      path: "/",
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("POST /api/admin/auth", e);
    return NextResponse.json(
      { error: "Error en la autenticación" },
      { status: 500 }
    );
  }
}
