import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getClientIp } from "@/lib/get-client-ip";
import { checkRateLimit, recordRateLimit } from "@/lib/rate-limit";

const QUEUE_COLLECTION = "queue";

export type QueueItem = {
  id: string;
  songName: string;
  artist: string;
  createdAt: string;
  ip?: string;
};

export async function GET() {
  try {
    const db = getAdminFirestore();
    const snapshot = await db
      .collection(QUEUE_COLLECTION)
      .orderBy("createdAt", "asc")
      .get();

    const items: QueueItem[] = snapshot.docs.map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        songName: d.songName ?? "",
        artist: d.artist ?? "",
        createdAt: d.createdAt?.toDate?.()?.toISOString() ?? new Date().toISOString(),
        ip: d.ip,
      };
    });

    return NextResponse.json(items);
  } catch (e) {
    console.error("GET /api/songs", e);
    return NextResponse.json(
      { error: "Error al cargar la cola" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const ip = await getClientIp();
    const { allowed, waitMinutes } = await checkRateLimit(ip);
    if (!allowed) {
      return NextResponse.json(
        {
          error: "Solo puedes añadir una canción cada 10 minutos",
          waitMinutes,
        },
        { status: 429 }
      );
    }

    const body = await request.json();
    const songName = typeof body.songName === "string" ? body.songName.trim() : "";
    const artist = typeof body.artist === "string" ? body.artist.trim() : "";

    if (!songName || !artist) {
      return NextResponse.json(
        { error: "Faltan nombre de canción o artista" },
        { status: 400 }
      );
    }

    const db = getAdminFirestore();
    const docRef = await db.collection(QUEUE_COLLECTION).add({
      songName,
      artist,
      createdAt: new Date(),
      ip,
    });

    await recordRateLimit(ip);

    return NextResponse.json({
      id: docRef.id,
      songName,
      artist,
      message: "Canción añadida a la cola",
    });
  } catch (e) {
    console.error("POST /api/songs", e);
    return NextResponse.json(
      { error: "Error al añadir la canción" },
      { status: 500 }
    );
  }
}
