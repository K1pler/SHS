const LYRICS_OVH_API = "https://api.lyrics.ovh/v1";
const REQUEST_TIMEOUT_MS = 5000;

/**
 * Obtiene la letra de una canción desde Lyrics.ovh API.
 * Retorna null si no se encuentra o hay error.
 */
export async function getLyrics(artist: string, songName: string): Promise<string | null> {
  const artistEncoded = encodeURIComponent(artist.trim());
  const songEncoded = encodeURIComponent(songName.trim());
  const url = `${LYRICS_OVH_API}/${artistEncoded}/${songEncoded}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const res = await fetch(url, {
      signal: controller.signal,
      next: { revalidate: 0 },
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      if (res.status === 404) return null;
      return null;
    }

    const data = (await res.json()) as { lyrics?: string };
    const lyrics = data.lyrics?.trim();

    if (!lyrics || lyrics.length === 0) return null;
    if (lyrics.length > 10000) return lyrics.slice(0, 10000);

    return lyrics;
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      return null;
    }
    console.error("Error obteniendo letra de Lyrics.ovh:", e);
    return null;
  }
}
