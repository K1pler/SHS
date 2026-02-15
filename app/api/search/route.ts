import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/get-client-ip";
import { checkGenericRateLimit, recordGenericRateLimit } from "@/lib/rate-limit-generic";

const ITUNES_SEARCH = "https://itunes.apple.com/search";
const SEARCH_MAX_REQUESTS = 30;
const SEARCH_WINDOW_MINUTES = 1;

export type SearchResult = {
  trackName: string;
  artistName: string;
  coverUrl: string;
};

export async function GET(request: NextRequest) {
  const ip = await getClientIp();
  const { allowed, retryAfterSeconds } = await checkGenericRateLimit(
    ip,
    "search",
    SEARCH_MAX_REQUESTS,
    SEARCH_WINDOW_MINUTES
  );
  if (!allowed) {
    return NextResponse.json(
      { error: "Demasiadas búsquedas. Espera un momento." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds ?? 60) } }
    );
  }

  const q = request.nextUrl.searchParams.get("q");
  const term = (q ?? "").trim().slice(0, 100);
  if (term.length < 2) {
    return NextResponse.json([]);
  }

  await recordGenericRateLimit(ip, "search", SEARCH_WINDOW_MINUTES);

  try {
    const params = new URLSearchParams({
      term,
      media: "music",
      limit: "10",
    });
    const res = await fetch(`${ITUNES_SEARCH}?${params.toString()}`, {
      next: { revalidate: 0 },
    });
    const data = (await res.json()) as { results?: Array<{ trackName?: string; artistName?: string; artworkUrl100?: string }> };
    const results = (data.results ?? []).slice(0, 10).map((r) => ({
      trackName: r.trackName ?? "",
      artistName: r.artistName ?? "",
      coverUrl: r.artworkUrl100 ?? "",
    })).filter((r) => r.trackName && r.coverUrl);

    return NextResponse.json(results as SearchResult[]);
  } catch (e) {
    console.error("GET /api/search", e);
    return NextResponse.json([], { status: 200 });
  }
}
