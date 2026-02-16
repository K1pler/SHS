/**
 * Script de migración: elimina el campo `ip` de todos los documentos
 * de la colección "queue" en Firestore (higiene de datos).
 *
 * Ejecutar una sola vez, con las variables de entorno de Firebase configuradas:
 *   FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
 *
 * Ejemplo (Node 20+ con .env.local):
 *   node --env-file=.env.local scripts/remove-ip-from-queue.mjs
 *
 * O exportar las variables y ejecutar:
 *   node scripts/remove-ip-from-queue.mjs
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const QUEUE_COLLECTION = "queue";

function getCredentials() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Faltan variables de entorno: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY"
    );
  }
  return { projectId, clientEmail, privateKey };
}

async function main() {
  const { projectId, clientEmail, privateKey } = getCredentials();
  initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  });
  const db = getFirestore();
  const snapshot = await db.collection(QUEUE_COLLECTION).get();
  let updated = 0;
  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (data.ip !== undefined) {
      await doc.ref.update({ ip: FieldValue.delete() });
      updated++;
      console.log(`Eliminado 'ip' en ${QUEUE_COLLECTION}/${doc.id}`);
    }
  }
  console.log(`Listo. ${updated} documento(s) actualizado(s) de ${snapshot.size} total.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
