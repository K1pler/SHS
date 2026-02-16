import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getClientIp } from "@/lib/get-client-ip";
import { checkGenericRateLimit, recordGenericRateLimit } from "@/lib/rate-limit-generic";
import { generateFunnySummary } from "@/lib/groq-client";

const QUEUE_COLLECTION = "queue";
const SUMMARY_RATE_LIMIT_WINDOW_MINUTES = 0.167; // 10 segundos
const SUMMARY_RATE_LIMIT_MAX_REQUESTS = 1;

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ip = await getClientIp();
    const { allowed, retryAfterSeconds } = await checkGenericRateLimit(
      ip,
      "funny_summary",
      SUMMARY_RATE_LIMIT_MAX_REQUESTS,
      SUMMARY_RATE_LIMIT_WINDOW_MINUTES
    );
    if (!allowed) {
      return NextResponse.json(
        { error: "Espera unos segundos antes de generar otro resumen" },
        { status: 429, headers: { "Retry-After": String(retryAfterSeconds ?? 10) } }
      );
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "ID requerido" }, { status: 400 });
    }

    const db = getAdminFirestore();
    const ref = db.collection(QUEUE_COLLECTION).doc(id);
    const doc = await ref.get();

    if (!doc.exists) {
      return NextResponse.json({ error: "Canción no encontrada" }, { status: 404 });
    }

    const data = doc.data();
    const lyrics = data?.lyrics as string | undefined;
    const orderNumber = data?.orderNumber as number | undefined;

    if (!lyrics) {
      return NextResponse.json(
        { error: "La canción no tiene letra disponible" },
        { status: 400 }
      );
    }

    if (orderNumber !== 1) {
      return NextResponse.json(
        { error: "Solo se puede generar resumen para la primera canción" },
        { status: 400 }
      );
    }

    const summary = await generateFunnySummary(lyrics);
    if (!summary) {
      return NextResponse.json(
        { error: "No se pudo generar el resumen. Intenta más tarde." },
        { status: 500 }
      );
    }

    await ref.update({
      funnySummary: summary,
      summaryGeneratedAt: new Date(),
    });

    await db.collection("summaryGeneration").doc("current").set({
      firstSongId: id,
    }, { merge: true });

    await recordGenericRateLimit(ip, "funny_summary", SUMMARY_RATE_LIMIT_WINDOW_MINUTES);

    return NextResponse.json({ success: true, summary });
  } catch (e) {
    console.error("POST /api/songs/[id]/summary", e);
    return NextResponse.json(
      { error: "Error al generar el resumen" },
      { status: 500 }
    );
  }
}
