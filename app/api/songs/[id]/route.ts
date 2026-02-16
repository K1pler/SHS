import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { isAdminRequest } from "@/lib/admin-auth";
import { generateFunnySummary } from "@/lib/groq-client";

const QUEUE_COLLECTION = "queue";
const SUMMARY_GENERATION_COLLECTION = "summaryGeneration";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const isAdmin = await isAdminRequest();
    if (!isAdmin) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "ID requerido" }, { status: 400 });
    }

    const db = getAdminFirestore();
    const ref = db.collection(QUEUE_COLLECTION).doc(id);
    const doc = await ref.get();
    if (!doc.exists) {
      return NextResponse.json({ error: "Canción no encontrada" }, { status: 404 });
    }

    const deletedData = doc.data();
    const wasFirstSong = (deletedData?.orderNumber as number) === 1;

    await ref.delete();

    // Si era la primera canción, actualizar resumen para la nueva primera
    if (wasFirstSong) {
      (async () => {
        try {
          const newFirstSnapshot = await db
            .collection(QUEUE_COLLECTION)
            .orderBy("orderNumber", "asc")
            .limit(1)
            .get();

          if (!newFirstSnapshot.empty) {
            const newFirstDoc = newFirstSnapshot.docs[0];
            const newFirstData = newFirstDoc.data();
            const newFirstLyrics = newFirstData.lyrics as string | undefined;

            await db.collection(SUMMARY_GENERATION_COLLECTION).doc("current").set({
              firstSongId: newFirstDoc.id,
            }, { merge: true });

            if (newFirstLyrics) {
              try {
                const summary = await generateFunnySummary(newFirstLyrics);
                if (summary) {
                  await newFirstDoc.ref.update({
                    funnySummary: summary,
                    summaryGeneratedAt: new Date(),
                  });
                }
              } catch (e) {
                console.error("Error generando resumen para nueva primera canción:", e);
              }
            } else {
              // No tiene letra, limpiar resumen si existe
              await newFirstDoc.ref.update({
                funnySummary: null,
                summaryGeneratedAt: null,
              });
            }
          } else {
            // No hay más canciones, limpiar summaryGeneration
            await db.collection(SUMMARY_GENERATION_COLLECTION).doc("current").delete();
          }
        } catch (e) {
          console.error("Error actualizando resumen tras eliminar primera canción:", e);
        }
      })();
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("DELETE /api/songs/[id]", e);
    return NextResponse.json(
      { error: "Error al eliminar la canción" },
      { status: 500 }
    );
  }
}
