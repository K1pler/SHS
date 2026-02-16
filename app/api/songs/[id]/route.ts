import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { isAdminRequest } from "@/lib/admin-auth";

const QUEUE_COLLECTION = "queue";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const isAdmin = await isAdminRequest();
    if (!isAdmin) {
      return NextResponse.json({ error: "No autorizado." }, { status: 401 });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
    }

    const db = getAdminFirestore();
    const ref = db.collection(QUEUE_COLLECTION).doc(id);
    const doc = await ref.get();
    if (!doc.exists) {
      return NextResponse.json({ error: "No encontrado." }, { status: 404 });
    }

    const data = doc.data();
    const deletedOrderNumber = typeof data?.orderNumber === "number" ? data.orderNumber : undefined;

    await ref.delete();

    if (deletedOrderNumber !== undefined) {
      const following = await db
        .collection(QUEUE_COLLECTION)
        .where("orderNumber", ">", deletedOrderNumber)
        .orderBy("orderNumber", "asc")
        .get();

      if (!following.empty) {
        const batch = db.batch();
        for (const d of following.docs) {
          const current = d.data()?.orderNumber as number;
          if (typeof current === "number") {
            batch.update(d.ref, { orderNumber: current - 1 });
          }
        }
        await batch.commit();
      }
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("DELETE /api/songs/[id]", e);
    return NextResponse.json(
      { error: "Algo ha fallado." },
      { status: 500 }
    );
  }
}
