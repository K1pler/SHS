import { NextRequest, NextResponse } from "next/server";
import { getOrCreateClientId } from "@/lib/client-id";
import { checkGenericRateLimit, recordGenericRateLimit } from "@/lib/rate-limit-generic";

const DEEZER_SEARCH = "https://api.deezer.com/search";
const SEARCH_MAX_REQUESTS = 30;
const SEARCH_WINDOW_MINUTES = 1;

type DeezerTrack = {
  title?: string;
  artist?: { name?: string };
  album?: { cover_medium?: string; cover_big?: string };
};

export type SearchResult = {
  trackName: string;
  artistName: string;
  coverUrl: string;
};

export async function GET(request: NextRequest) {
  const clientId = await getOrCreateClientId();
  const { allowed, retryAfterSeconds } = await checkGenericRateLimit(
    clientId,
    "search",
    SEARCH_MAX_REQUESTS,
    SEARCH_WINDOW_MINUTES
  );
  if (!allowed) {
    return NextResponse.json(
      { error: "Espera un momento." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds ?? 60) } }
    );
  }

  const q = request.nextUrl.searchParams.get("q");
  const term = (q ?? "").trim().slice(0, 100);
  if (term.length < 2) {
    return NextResponse.json([]);
  }

  await recordGenericRateLimit(clientId, "search", SEARCH_WINDOW_MINUTES);

  try {
    const res = await fetch(
      `${DEEZER_SEARCH}?q=${encodeURIComponent(term)}&limit=10`,
      { next: { revalidate: 0 } }
    );
    const data = (await res.json()) as { data?: DeezerTrack[] };
    const items = data.data ?? [];
    const results = items.slice(0, 10).map((item) => ({
      trackName: item.title ?? "",
      artistName: item.artist?.name ?? "",
      coverUrl: item.album?.cover_medium ?? item.album?.cover_big ?? "",
    })).filter((r) => r.trackName && r.artistName && r.coverUrl);

    return NextResponse.json(results as SearchResult[]);
  } catch (e) {
    console.error("GET /api/search", e);
    return NextResponse.json([], { status: 200 });
  }
}
