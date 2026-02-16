import { NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";

const QUEUE_COLLECTION = "queue";
const SUMMARY_GENERATION_COLLECTION = "summaryGeneration";

export async function GET() {
  try {
    const db = getAdminFirestore();
    
    // Obtener primera canción
    const firstSongSnapshot = await db
      .collection(QUEUE_COLLECTION)
      .orderBy("orderNumber", "asc")
      .limit(1)
      .get();

    if (firstSongSnapshot.empty) {
      return NextResponse.json({ needsSummary: false });
    }

    const firstSongDoc = firstSongSnapshot.docs[0];
    const firstSongId = firstSongDoc.id;
    const firstSongData = firstSongDoc.data();
    const hasLyrics = !!firstSongData.lyrics;
    const hasSummary = !!firstSongData.funnySummary;

    // Verificar estado en summaryGeneration/current
    const currentRef = db.collection(SUMMARY_GENERATION_COLLECTION).doc("current");
    const currentDoc = await currentRef.get();
    const currentFirstSongId = currentDoc.data()?.firstSongId as string | undefined;

    if (!hasLyrics) {
      return NextResponse.json({ needsSummary: false });
    }

    if (currentFirstSongId === firstSongId && hasSummary) {
      return NextResponse.json({ needsSummary: false });
    }

    return NextResponse.json({
      needsSummary: true,
      songId: firstSongId,
    });
  } catch (e) {
    console.error("GET /api/songs/check-summary", e);
    return NextResponse.json(
      { error: "Error verificando resumen" },
      { status: 500 }
    );
  }
}
