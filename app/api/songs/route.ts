import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getClientIp } from "@/lib/get-client-ip";
import { checkRateLimit, recordRateLimit } from "@/lib/rate-limit";

const QUEUE_COLLECTION = "queue";
const MAX_SONG_NAME_LENGTH = 200;
const MAX_ARTIST_LENGTH = 200;
const MAX_COVER_URL_LENGTH = 2000;
const MAX_BODY_LENGTH = 50 * 1024; // 50 KB

export type QueueItem = {
  id: string;
  songName: string;
  artist: string;
  createdAt: string;
  coverUrl?: string;
  ip?: string;
};

export async function GET() {
  try {
    const db = getAdminFirestore();
    // Limitar resultados para evitar respuestas enormes
    const snapshot = await db
      .collection(QUEUE_COLLECTION)
      .orderBy("createdAt", "asc")
      .limit(500)
      .get();

    const items: QueueItem[] = snapshot.docs.map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        songName: d.songName ?? "",
        artist: d.artist ?? "",
        createdAt: d.createdAt?.toDate?.()?.toISOString() ?? new Date().toISOString(),
        coverUrl: d.coverUrl,
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

    const contentLength = request.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_BODY_LENGTH) {
      return NextResponse.json(
        { error: "Cuerpo de la petición demasiado grande" },
        { status: 413 }
      );
    }

    const body = await request.json();
    const songName = typeof body.songName === "string" ? body.songName.trim().slice(0, MAX_SONG_NAME_LENGTH) : "";
    const artist = typeof body.artist === "string" ? body.artist.trim().slice(0, MAX_ARTIST_LENGTH) : "";
    const coverUrlRaw = typeof body.coverUrl === "string" ? body.coverUrl.trim() : "";
    const coverUrl = coverUrlRaw.length > 0 && coverUrlRaw.length <= MAX_COVER_URL_LENGTH
      ? coverUrlRaw
      : coverUrlRaw.length > MAX_COVER_URL_LENGTH
        ? undefined
        : undefined;

    if (!songName || !artist) {
      return NextResponse.json(
        { error: "Faltan nombre de canción o artista" },
        { status: 400 }
      );
    }

    // Solo permitir URLs de portada de iTunes/Apple para evitar inyección
    const allowedCoverHosts = ["is1-ssl.mzstatic.com", "is2-ssl.mzstatic.com", "is3-ssl.mzstatic.com", "is4-ssl.mzstatic.com", "is5-ssl.mzstatic.com"];
    let finalCoverUrl: string | undefined;
    if (coverUrl) {
      try {
        const u = new URL(coverUrl);
        if (allowedCoverHosts.some((h) => u.hostname === h || u.hostname.endsWith(".mzstatic.com"))) {
          finalCoverUrl = coverUrl;
        }
      } catch {
        finalCoverUrl = undefined;
      }
    }

    const db = getAdminFirestore();
    const docData: Record<string, unknown> = {
      songName,
      artist,
      createdAt: new Date(),
      ip,
    };
    if (finalCoverUrl) docData.coverUrl = finalCoverUrl;
    const docRef = await db.collection(QUEUE_COLLECTION).add(docData);

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
