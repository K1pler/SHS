import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getClientIp } from "@/lib/get-client-ip";
import { checkRateLimit, recordRateLimit } from "@/lib/rate-limit";
import { getLyrics } from "@/lib/lyrics-ovh";
import { generateFunnySummary } from "@/lib/groq-client";
import { isAdminRequest } from "@/lib/admin-auth";

const QUEUE_COLLECTION = "queue";
const ITUNES_SEARCH = "https://itunes.apple.com/search";
const MAX_SONG_NAME_LENGTH = 200;
const MAX_ARTIST_LENGTH = 200;
const MAX_COVER_URL_LENGTH = 2000;
const MAX_BODY_LENGTH = 50 * 1024; // 50 KB

const ALLOWED_COVER_HOSTS = [
  "is1-ssl.mzstatic.com",
  "is2-ssl.mzstatic.com",
  "is3-ssl.mzstatic.com",
  "is4-ssl.mzstatic.com",
  "is5-ssl.mzstatic.com",
];

type iTunesResult = {
  trackName?: string;
  artistName?: string;
  artworkUrl100?: string;
};

/** Verifica que la canción exista en iTunes y devuelve sus datos oficiales. */
async function verifySongWithItunes(
  songName: string,
  artist: string
): Promise<{ trackName: string; artistName: string; coverUrl?: string } | null> {
  const term = `${songName} ${artist}`.trim().slice(0, 100);
  const params = new URLSearchParams({ term, media: "music", limit: "20" });
  const res = await fetch(`${ITUNES_SEARCH}?${params.toString()}`, { next: { revalidate: 0 } });
  const data = (await res.json()) as { results?: iTunesResult[] };
  const results = data.results ?? [];

  const songLower = songName.trim().toLowerCase();
  const artistLower = artist.trim().toLowerCase();

  const match = results.find((r) => {
    const t = (r.trackName ?? "").trim().toLowerCase();
    const a = (r.artistName ?? "").trim().toLowerCase();
    return t === songLower && a === artistLower;
  });

  if (!match || !match.trackName || !match.artistName) return null;

  let coverUrl: string | undefined;
  const url = match.artworkUrl100?.trim();
  if (url && url.length <= MAX_COVER_URL_LENGTH) {
    try {
      const u = new URL(url);
      if (ALLOWED_COVER_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith(".mzstatic.com"))) {
        coverUrl = url;
      }
    } catch {
      // ignorar URL inválida
    }
  }

  return {
    trackName: match.trackName.slice(0, MAX_SONG_NAME_LENGTH),
    artistName: match.artistName.slice(0, MAX_ARTIST_LENGTH),
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
  ip?: string;
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
        ip: d.ip as string | undefined,
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
    const isAdmin = await isAdminRequest();
    
    // Solo aplicar rate limit si NO es admin
    if (!isAdmin) {
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

    if (!songName || !artist) {
      return NextResponse.json(
        { error: "Faltan nombre de canción o artista" },
        { status: 400 }
      );
    }

    // Solo aceptar canciones que existan en la API de iTunes (como las sugerencias de búsqueda)
    const verified = await verifySongWithItunes(songName, artist);
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
      ip,
    };
    if (verified.coverUrl) docData.coverUrl = verified.coverUrl;
    const docRef = await db.collection(QUEUE_COLLECTION).add(docData);

    // Solo registrar rate limit si NO es admin
    if (!isAdmin) {
      await recordRateLimit(ip);
    }

    // Obtener letra de forma asíncrona (no bloquear respuesta)
    (async () => {
      try {
        const lyrics = await getLyrics(verified.artistName, verified.trackName);
        if (lyrics) {
          await docRef.update({ lyrics });
          
          // Si es la primera canción, generar resumen jocoso
          if (orderNumber === 1) {
            try {
              const summary = await generateFunnySummary(lyrics);
              if (summary) {
                await docRef.update({
                  funnySummary: summary,
                  summaryGeneratedAt: new Date(),
                });
                // Actualizar summaryGeneration/current
                await db.collection("summaryGeneration").doc("current").set({
                  firstSongId: docRef.id,
                }, { merge: true });
              }
            } catch (e) {
              console.error("Error generando resumen para primera canción:", e);
            }
          }
        }
      } catch (e) {
        console.error("Error obteniendo letra:", e);
      }
    })();

    return NextResponse.json({
      id: docRef.id,
      songName: verified.trackName,
      artist: verified.artistName,
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
