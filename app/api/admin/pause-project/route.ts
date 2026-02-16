import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";

/**
 * Pausa el proyecto en Vercel. Solo admin.
 * Requiere en Vercel: VERCEL_TOKEN, VERCEL_PROJECT_ID; opcional VERCEL_TEAM_ID (para equipos).
 * Ver: https://vercel.com/kb/guide/pause-your-project
 */
export async function POST() {
  try {
    const isAdmin = await isAdminRequest();
    if (!isAdmin) {
      return NextResponse.json({ error: "No autorizado." }, { status: 401 });
    }

    const token = process.env.VERCEL_TOKEN;
    const projectId = process.env.VERCEL_PROJECT_ID;
    const teamId = process.env.VERCEL_TEAM_ID;

    if (!token || !projectId) {
      return NextResponse.json(
        { error: "Faltan VERCEL_TOKEN o VERCEL_PROJECT_ID en variables de entorno." },
        { status: 500 }
      );
    }

    const url =
      teamId !== undefined && teamId !== ""
        ? `https://api.vercel.com/v1/projects/${projectId}/pause?teamId=${teamId}`
        : `https://api.vercel.com/v1/projects/${projectId}/pause`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("Vercel pause API error:", res.status, text);
      return NextResponse.json(
        { error: "No se pudo pausar el proyecto." },
        { status: 502 }
      );
    }

    return NextResponse.json({ success: true, message: "Proyecto pausado." });
  } catch (e) {
    console.error("POST /api/admin/pause-project", e);
    return NextResponse.json(
      { error: "Algo ha fallado." },
      { status: 500 }
    );
  }
}
