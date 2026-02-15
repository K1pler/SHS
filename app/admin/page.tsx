"use client";

import { useState, useEffect, useCallback } from "react";

type QueueItem = {
  id: string;
  songName: string;
  artist: string;
  createdAt: string;
  coverUrl?: string;
};

export default function AdminPage() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");

  const checkAdmin = useCallback(async () => {
    const res = await fetch("/api/admin/auth");
    const data = await res.json();
    setIsAdmin(data.admin === true);
  }, []);

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
    checkAdmin();
  }, [checkAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    fetchQueue();
    const t = setInterval(fetchQueue, 5000);
    return () => clearInterval(t);
  }, [isAdmin, fetchQueue]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthError("");
    setAuthLoading(true);
    try {
      const res = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (res.ok) {
        setIsAdmin(true);
        setPassword("");
      } else {
        setAuthError(data.error ?? "Error al iniciar sesión");
      }
    } catch {
      setAuthError("Error de conexión");
    } finally {
      setAuthLoading(false);
    }
  }

  async function removeSong(id: string) {
    const res = await fetch(`/api/songs/${id}`, { method: "DELETE" });
    if (res.ok) {
      setQueue((q) => q.filter((s) => s.id !== id));
    }
  }

  if (isAdmin === null) {
    return (
      <main style={styles.main}>
        <div style={styles.container}>
          <p style={styles.muted}>Comprobando sesión…</p>
        </div>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main style={styles.main}>
        <div style={styles.container}>
          <h1 style={styles.h1}>Admin</h1>
          <form onSubmit={handleLogin} style={styles.form}>
            <input
              type="password"
              placeholder="Contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={authLoading}
              style={styles.input}
              autoFocus
            />
            <button type="submit" disabled={authLoading} style={styles.button}>
              {authLoading ? "Entrando…" : "Entrar"}
            </button>
          </form>
          {authError && (
            <p style={styles.error}>{authError}</p>
          )}
          <p style={styles.footer}>
            <a href="/">Volver a la cola</a>
          </p>
        </div>
      </main>
    );
  }

  return (
    <main style={styles.main}>
      <div style={styles.container}>
        <h1 style={styles.h1}>Panel admin</h1>
        <p style={styles.subtitle}>Quita canciones de la cola cuando las hayas puesto.</p>

        {loading ? (
          <p style={styles.muted}>Cargando cola…</p>
        ) : queue.length === 0 ? (
          <p style={styles.muted}>No hay canciones en la cola.</p>
        ) : (
          <ul style={styles.list}>
            {queue.map((item, i) => (
              <li key={item.id} style={styles.listItem}>
                <span style={styles.index}>{i + 1}.</span>
                {item.coverUrl ? (
                  <img src={item.coverUrl} alt="" style={styles.queueCover} />
                ) : (
                  <div style={styles.queueCoverPlaceholder} />
                )}
                <span style={styles.song}>
                  {item.songName} — {item.artist}
                </span>
                <button
                  type="button"
                  onClick={() => removeSong(item.id)}
                  style={styles.removeBtn}
                >
                  Quitar
                </button>
              </li>
            ))}
          </ul>
        )}

        <p style={styles.footer}>
          <a href="/">Volver a la cola</a>
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
    maxWidth: "520px",
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
  error: {
    color: "var(--danger)",
    fontSize: "0.9rem",
    marginBottom: "1rem",
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
    padding: "0.6rem 0",
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
  removeBtn: {
    padding: "0.35rem 0.6rem",
    fontSize: "0.8rem",
    borderRadius: "6px",
    border: "none",
    background: "var(--danger)",
    color: "white",
  },
  footer: {
    marginTop: "2rem",
    fontSize: "0.85rem",
    color: "var(--muted)",
  },
};
