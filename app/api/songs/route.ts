import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getOrCreateClientId } from "@/lib/client-id";
import { checkRateLimit, recordRateLimit } from "@/lib/rate-limit";
import { isAdminRequest } from "@/lib/admin-auth";

const QUEUE_COLLECTION = "queue";
const DEEZER_SEARCH = "https://api.deezer.com/search";
const MAX_SONG_NAME_LENGTH = 200;
const MAX_ARTIST_LENGTH = 200;
const MAX_COVER_URL_LENGTH = 2000;
const MAX_BODY_LENGTH = 50 * 1024; // 50 KB

const ALLOWED_COVER_HOSTS = [
  "cdn-images.dzcdn.net",
  "e-cdns-images.dzcdn.net",
];

type DeezerTrack = {
  title?: string;
  artist?: { name?: string };
  album?: { cover_medium?: string; cover_big?: string };
};

/** Verifica que la canción exista en Deezer y devuelve sus datos oficiales. */
async function verifySongWithDeezer(
  songName: string,
  artist: string
): Promise<{ trackName: string; artistName: string; coverUrl?: string } | null> {
  const term = `${songName} ${artist}`.trim().slice(0, 100);
  const res = await fetch(
    `${DEEZER_SEARCH}?q=${encodeURIComponent(term)}&limit=20`,
    { next: { revalidate: 0 } }
  );
  const data = (await res.json()) as { data?: DeezerTrack[] };
  const results = data.data ?? [];

  const songLower = songName.trim().toLowerCase();
  const artistLower = artist.trim().toLowerCase();

  const match = results.find((r) => {
    const t = (r.title ?? "").trim().toLowerCase();
    const a = (r.artist?.name ?? "").trim().toLowerCase();
    return t === songLower && a === artistLower;
  });

  if (!match || !match.title || !match.artist?.name) return null;

  let coverUrl: string | undefined;
  const url = (match.album?.cover_medium ?? match.album?.cover_big)?.trim();
  if (url && url.length <= MAX_COVER_URL_LENGTH) {
    try {
      const u = new URL(url);
      if (ALLOWED_COVER_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith(".dzcdn.net"))) {
        coverUrl = url;
      }
    } catch {
      // ignorar URL inválida
    }
  }

  return {
    trackName: match.title.slice(0, MAX_SONG_NAME_LENGTH),
    artistName: match.artist.name.slice(0, MAX_ARTIST_LENGTH),
    coverUrl,
  };
}

export type QueueItem = {
  id: string;
  songName: string;
  artist: string;
  createdAt: string;
  orderNumber?: number;
  lyrics?: string;
  funnySummary?: string;
  coverUrl?: string;
};

export async function GET() {
  try {
    const db = getAdminFirestore();
    // Limitar resultados para evitar respuestas enormes
    const snapshot = await db
      .collection(QUEUE_COLLECTION)
      .orderBy("orderNumber", "asc")
      .limit(500)
      .get();

    const items: QueueItem[] = snapshot.docs.map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        songName: d.songName ?? "",
        artist: d.artist ?? "",
        createdAt: d.createdAt?.toDate?.()?.toISOString() ?? new Date().toISOString(),
        orderNumber: d.orderNumber as number | undefined,
        lyrics: d.lyrics as string | undefined,
        funnySummary: d.funnySummary as string | undefined,
        coverUrl: d.coverUrl as string | undefined,
        // ip no se expone en la API pública por privacidad
      };
    });

    return NextResponse.json(items);
  } catch (e) {
    console.error("GET /api/songs", e);
    return NextResponse.json(
      { error: "Algo ha fallado. Inténtalo más tarde." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const clientId = await getOrCreateClientId();
    const isAdmin = await isAdminRequest();
    
    // Solo aplicar rate limit si NO es admin
    if (!isAdmin) {
      const { allowed } = await checkRateLimit(clientId);
      if (!allowed) {
        return NextResponse.json(
          { error: "Espera un poco antes de añadir otra canción." },
          { status: 429 }
        );
      }
    }

    const contentLength = request.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_BODY_LENGTH) {
      return NextResponse.json(
        { error: "Solicitud demasiado grande." },
        { status: 413 }
      );
    }

    const body = await request.json();
    const songName = typeof body.songName === "string" ? body.songName.trim().slice(0, MAX_SONG_NAME_LENGTH) : "";
    const artist = typeof body.artist === "string" ? body.artist.trim().slice(0, MAX_ARTIST_LENGTH) : "";

    if (!songName || !artist) {
      return NextResponse.json(
        { error: "Datos inválidos." },
        { status: 400 }
      );
    }

    const verified = await verifySongWithDeezer(songName, artist);
    if (!verified) {
      return NextResponse.json(
        { error: "No se ha encontrado la canción." },
        { status: 400 }
      );
    }

    const db = getAdminFirestore();
    
    // Obtener orderNumber siguiente
    const countSnapshot = await db.collection(QUEUE_COLLECTION).count().get();
    const currentCount = countSnapshot.data().count ?? 0;
    const orderNumber = currentCount + 1;

    const docData: Record<string, unknown> = {
      songName: verified.trackName,
      artist: verified.artistName,
      createdAt: new Date(),
      orderNumber,
    };
    if (verified.coverUrl) docData.coverUrl = verified.coverUrl;
    const docRef = await db.collection(QUEUE_COLLECTION).add(docData);

    // Solo registrar rate limit si NO es admin
    if (!isAdmin) {
      await recordRateLimit(clientId);
    }

    return NextResponse.json({ success: true, message: "Canción añadida a la cola" });
  } catch (e) {
    console.error("POST /api/songs", e);
    return NextResponse.json(
      { error: "Algo ha fallado. Inténtalo más tarde." },
      { status: 500 }
    );
  }
}
