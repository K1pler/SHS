const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.1-8b-instruct";
const MAX_TOKENS = 150;
const TEMPERATURE = 0.8;

function getGroqApiKey(): string {
  const key = process.env.GROQ_API_KEY;
  if (!key) {
    throw new Error("GROQ_API_KEY no está definida en las variables de entorno");
  }
  return key;
}

/**
 * Genera un resumen jocoso de una letra de canción usando Groq.
 * Retorna null si hay error o rate limit.
 */
export async function generateFunnySummary(lyrics: string): Promise<string | null> {
  const apiKey = getGroqApiKey();
  const sanitizedLyrics = lyrics.trim().slice(0, 5000);

  const prompt = `Eres un crítico musical divertido y con sentido del humor. Analiza esta letra de canción y haz un resumen jocoso y breve (máximo 3 frases) que capture la esencia de la canción con humor, sin ser ofensivo.

Letra:
${sanitizedLyrics}

Resumen jocoso:`;

  try {
    const res = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        max_tokens: MAX_TOKENS,
        temperature: TEMPERATURE,
      }),
    });

    if (res.status === 429) {
      const retryAfter = res.headers.get("retry-after");
      console.warn(`Groq rate limit alcanzado. Retry-After: ${retryAfter}`);
      return null;
    }

    if (!res.ok) {
      const errorText = await res.text().catch(() => "Unknown error");
      console.error(`Error en Groq API: ${res.status} - ${errorText}`);
      return null;
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) return null;

    return content.slice(0, 500);
  } catch (e) {
    console.error("Error llamando a Groq API:", e);
    return null;
  }
}
