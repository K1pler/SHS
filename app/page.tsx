"use client";

import { useState, useEffect, useCallback } from "react";

type QueueItem = {
  id: string;
  songName: string;
  artist: string;
  createdAt: string;
};

export default function HomePage() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [songName, setSongName] = useState("");
  const [artist, setArtist] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  const fetchQueue = useCallback(async () => {
    try {
      const res = await fetch("/api/songs");
      if (res.ok) {
        const data = await res.json();
        setQueue(data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQueue();
    const t = setInterval(fetchQueue, 10000);
    return () => clearInterval(t);
  }, [fetchQueue]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    const s = songName.trim();
    const a = artist.trim();
    if (!s || !a) {
      setMessage({ type: "error", text: "Escribe canción y artista." });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/songs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ songName: s, artist: a }),
      });
      const data = await res.json();
      if (res.ok) {
        setSongName("");
        setArtist("");
        setMessage({ type: "ok", text: data.message ?? "Canción añadida." });
        fetchQueue();
      } else {
        setMessage({
          type: "error",
          text: data.error ?? "Error al añadir. " + (data.waitMinutes ? `Espera ${data.waitMinutes} min.` : ""),
        });
      }
    } catch {
      setMessage({ type: "error", text: "Error de conexión." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main style={styles.main}>
      <div style={styles.container}>
        <h1 style={styles.h1}>Cola de canciones</h1>
        <p style={styles.subtitle}>Añade una canción (máximo 1 cada 10 minutos)</p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <input
            type="text"
            placeholder="Nombre de la canción"
            value={songName}
            onChange={(e) => setSongName(e.target.value)}
            disabled={submitting}
            style={styles.input}
          />
          <input
            type="text"
            placeholder="Artista"
            value={artist}
            onChange={(e) => setArtist(e.target.value)}
            disabled={submitting}
            style={styles.input}
          />
          <button type="submit" disabled={submitting} style={styles.button}>
            {submitting ? "Añadiendo…" : "Añadir a la cola"}
          </button>
        </form>

        {message && (
          <p
            style={{
              ...styles.message,
              color: message.type === "ok" ? "#22c55e" : "var(--danger)",
            }}
          >
            {message.text}
          </p>
        )}

        <section style={styles.section}>
          <h2 style={styles.h2}>Cola</h2>
          {loading ? (
            <p style={styles.muted}>Cargando…</p>
          ) : queue.length === 0 ? (
            <p style={styles.muted}>No hay canciones en la cola.</p>
          ) : (
            <ul style={styles.list}>
              {queue.map((item, i) => (
                <li key={item.id} style={styles.listItem}>
                  <span style={styles.index}>{i + 1}.</span>
                  <span style={styles.song}>
                    {item.songName} — {item.artist}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <p style={styles.footer}>
          <a href="/admin">Panel admin</a>
        </p>
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: {
    minHeight: "100vh",
    padding: "2rem 1rem",
    backgroundColor: "var(--bg)",
  },
  container: {
    maxWidth: "420px",
    margin: "0 auto",
  },
  h1: {
    fontSize: "1.75rem",
    marginBottom: "0.25rem",
  },
  subtitle: {
    color: "var(--muted)",
    fontSize: "0.9rem",
    marginBottom: "1.5rem",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
    marginBottom: "1rem",
  },
  input: {
    padding: "0.6rem 0.75rem",
    borderRadius: "8px",
    border: "1px solid var(--border)",
    background: "var(--surface)",
    color: "var(--text)",
  },
  button: {
    padding: "0.65rem 1rem",
    borderRadius: "8px",
    border: "none",
    background: "var(--accent)",
    color: "white",
    fontWeight: 600,
  },
  message: {
    fontSize: "0.9rem",
    marginBottom: "1rem",
  },
  section: {
    marginTop: "2rem",
    paddingTop: "1.5rem",
    borderTop: "1px solid var(--border)",
  },
  h2: {
    fontSize: "1.1rem",
    marginBottom: "0.75rem",
  },
  muted: {
    color: "var(--muted)",
    fontSize: "0.9rem",
  },
  list: {
    listStyle: "none",
  },
  listItem: {
    display: "flex",
    gap: "0.5rem",
    padding: "0.5rem 0",
    borderBottom: "1px solid var(--border)",
    fontSize: "0.95rem",
  },
  index: {
    color: "var(--muted)",
    minWidth: "1.5rem",
  },
  song: {
    flex: 1,
  },
  footer: {
    marginTop: "2rem",
    fontSize: "0.85rem",
    color: "var(--muted)",
  },
};
