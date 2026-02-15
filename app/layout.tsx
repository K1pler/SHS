import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cola de canciones",
  description: "Añade tu canción a la cola",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
