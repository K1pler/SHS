"use client";

import Image from "next/image";
import { useState, useEffect, useCallback, useRef } from "react";

type SearchResult = {
  trackName: string;
  artistName: string;
  coverUrl: string;
};

type QueueItem = {
  id: string;
  songName: string;
  artist: string;
  createdAt: string;
  orderNumber?: number;
  coverUrl?: string;
};

export default function HomePage() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<SearchResult[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState<SearchResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setSuggestionsOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        if (res.ok) {
          const data = await res.json();
          setSuggestions(Array.isArray(data) ? data : []);
          setSuggestionsOpen(true);
        }
      } catch {
        setSuggestions([]);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setSuggestionsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleSelectSuggestion(track: SearchResult) {
    setSelectedTrack(track);
    setSearchQuery("");
    setSuggestions([]);
    setSuggestionsOpen(false);
  }

  function clearSelection() {
    setSelectedTrack(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (!selectedTrack) {
      setMessage({ type: "error", text: "Busca y elige una canción de la lista." });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/songs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          songName: selectedTrack.trackName,
          artist: selectedTrack.artistName,
          coverUrl: selectedTrack.coverUrl,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setSelectedTrack(null);
        setMessage({ type: "ok", text: "Canción añadida." });
        fetchQueue();
      } else {
        const msg =
          res.status === 429
            ? "Espera un poco antes de añadir otra."
            : res.status >= 500
              ? "Algo ha fallado. Inténtalo más tarde."
              : "No se ha podido añadir la canción.";
        setMessage({ type: "error", text: msg });
      }
    } catch {
      setMessage({ type: "error", text: "Error de conexión." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main style={styles.main}>
      <div style={styles.leftCol}>
        <div style={styles.formContainer}>
          <h1 style={styles.h1}>Cola de canciones</h1>
          <p style={styles.subtitle}>Busca una canción y elígela para añadirla (máximo 1 cada 10 minutos)</p>

          <form onSubmit={handleSubmit} style={styles.form}>
            {!selectedTrack ? (
              <div style={styles.searchWrap} ref={wrapperRef}>
                <input
                  type="text"
                  placeholder="Buscar canción o artista..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  disabled={submitting}
                  style={styles.input}
                  autoComplete="off"
                />
                {suggestionsOpen && suggestions.length > 0 && (
                  <ul style={styles.suggestionsList}>
                    {suggestions.map((s, i) => (
                      <li
                        key={`${s.trackName}-${s.artistName}-${i}`}
                        style={styles.suggestionItem}
                        onMouseDown={() => handleSelectSuggestion(s)}
                      >
                        <Image src={s.coverUrl} alt="" width={40} height={40} style={styles.suggestionCover} />
                        <div>
                          <div style={styles.suggestionTrack}>{s.trackName}</div>
                          <div style={styles.suggestionArtist}>{s.artistName}</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <div style={styles.selectedWrap}>
                <Image src={selectedTrack.coverUrl} alt="" width={48} height={48} style={styles.selectedCover} />
                <div style={styles.selectedText}>
                  <strong>{selectedTrack.trackName}</strong>
                  <span style={styles.selectedArtist}> — {selectedTrack.artistName}</span>
                </div>
                <button type="button" onClick={clearSelection} style={styles.changeBtn}>
                  Cambiar
                </button>
              </div>
            )}
            <button
              type="submit"
              disabled={submitting || !selectedTrack}
              style={styles.button}
            >
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
        </div>
      </div>

      <div style={styles.rightCol}>
        <section style={styles.section}>
          <h2 style={styles.h2}>Cola</h2>
          {loading ? (
            <p style={styles.muted}>Cargando…</p>
          ) : queue.length === 0 ? (
            <p style={styles.muted}>No hay canciones en la cola.</p>
          ) : (
            <ul style={styles.list}>
              {queue.map((item) => (
                <li key={item.id} style={styles.listItem}>
                  <span style={styles.index}>{item.orderNumber ?? "?"}.</span>
                  {item.coverUrl ? (
                    <Image src={item.coverUrl} alt="" width={36} height={36} style={styles.queueCover} />
                  ) : (
                    <div style={styles.queueCoverPlaceholder} />
                  )}
                  <span style={styles.song}>
                    {item.songName} — {item.artist}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: {
    minHeight: "100vh",
    display: "flex",
    backgroundColor: "var(--bg)",
  },
  leftCol: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "2rem",
  },
  formContainer: {
    maxWidth: "380px",
    width: "100%",
  },
  rightCol: {
    flex: 1,
    padding: "2rem",
    overflowY: "auto",
    borderLeft: "1px solid var(--border)",
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
  searchWrap: {
    position: "relative",
  },
  input: {
    width: "100%",
    padding: "0.6rem 0.75rem",
    borderRadius: "8px",
    border: "1px solid var(--border)",
    background: "var(--surface)",
    color: "var(--text)",
  },
  suggestionsList: {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    margin: 0,
    padding: "0.25rem 0",
    listStyle: "none",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "8px",
    marginTop: "4px",
    maxHeight: "280px",
    overflowY: "auto",
    zIndex: 10,
  },
  suggestionItem: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
    padding: "0.5rem 0.75rem",
    cursor: "pointer",
  },
  suggestionCover: {
    width: 40,
    height: 40,
    borderRadius: 4,
    objectFit: "cover",
  },
  suggestionTrack: {
    fontWeight: 600,
    fontSize: "0.9rem",
  },
  suggestionArtist: {
    fontSize: "0.8rem",
    color: "var(--muted)",
  },
  selectedWrap: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
    padding: "0.6rem",
    borderRadius: "8px",
    border: "1px solid var(--border)",
    background: "var(--surface)",
  },
  selectedCover: {
    width: 48,
    height: 48,
    borderRadius: 6,
    objectFit: "cover",
  },
  selectedText: {
    flex: 1,
    fontSize: "0.95rem",
  },
  selectedArtist: {
    color: "var(--muted)",
  },
  changeBtn: {
    padding: "0.35rem 0.6rem",
    fontSize: "0.8rem",
    borderRadius: "6px",
    border: "1px solid var(--border)",
    background: "transparent",
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
    maxWidth: "420px",
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
    alignItems: "center",
    gap: "0.5rem",
    padding: "0.5rem 0",
    borderBottom: "1px solid var(--border)",
    fontSize: "0.95rem",
  },
  index: {
    color: "var(--muted)",
    minWidth: "1.5rem",
  },
  queueCover: {
    width: 36,
    height: 36,
    borderRadius: 4,
    objectFit: "cover",
  },
  queueCoverPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 4,
    background: "var(--border)",
  },
  song: {
    flex: 1,
  },
};
