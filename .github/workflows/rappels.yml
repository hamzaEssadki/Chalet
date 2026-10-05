// Envoie la notification « X n'a pas payé » à tous les téléphones inscrits.
// Lancé chaque heure par GitHub Actions (.github/workflows/rappels.yml).
// - Après la date limite : 1 rappel, puis 1 par 24 h tant que quelqu'un n'a pas payé.
// - FORCE=true (bouton « Run workflow ») : envoie tout de suite, même avant la date limite.
import admin from "firebase-admin";

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || "{}");
if (!sa.project_id) { console.error("Secret FIREBASE_SERVICE_ACCOUNT manquant."); process.exit(1); }
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
const force = process.env.FORCE === "true";
const appUrl = process.env.APP_URL || "";
const fmt = n => new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" }).format(n || 0);
const list = a => a.length > 1 ? a.slice(0, -1).join(", ") + " et " + a.at(-1) : a[0];

const tripRef = db.doc("trip/main");
const trip = (await tripRef.get()).data() || {};
const now = new Date();
if (!trip.deadline && !force) { console.log("Pas de date limite fixée."); process.exit(0); }
const deadline = trip.deadline ? new Date(trip.deadline) : null;
const expired = deadline && now >= deadline;
if (!expired && !force) { console.log("Date limite pas encore atteinte."); process.exit(0); }

const unpaid = (await db.collection("people").get()).docs.map(d => d.data()).filter(p => !p.paid).map(p => p.name);
if (!unpaid.length) { console.log("Tout le monde a payé 🎉"); process.exit(0); }

const last = trip.lastNotifiedAt ? new Date(trip.lastNotifiedAt) : null;
if (!force && last && now - last < 23.5 * 3600e3) { console.log("Rappel déjà envoyé dans les dernières 24 h."); process.exit(0); }

const verb = unpaid.length > 1 ? "n'ont" : "n'a";
const title = `💸 ${trip.name || "Chalet"} : paiement en retard`;
const body = expired
  ? `${list(unpaid)} ${verb} pas payé la somme de ${fmt(trip.amount)}. Veuillez faire le paiement le plus tôt possible.`
  : `Rappel : ${list(unpaid)} ${verb} pas encore payé ${fmt(trip.amount)}. Date limite : ${deadline ? deadline.toLocaleDateString("fr-CA", { day: "numeric", month: "long", timeZone: "America/Toronto" }) : "bientôt"}.`;

const tokens = (await db.collection("tokens").get()).docs.map(d => d.id);
if (!tokens.length) { console.log("Aucun téléphone inscrit aux notifications."); process.exit(0); }

let sent = 0, removed = 0;
for (let i = 0; i < tokens.length; i += 500) {
  const batch = tokens.slice(i, i + 500);
  const res = await admin.messaging().sendEachForMulticast({
    tokens: batch,
    webpush: {
      notification: { title, body, icon: appUrl ? appUrl + "icon-192.png" : undefined },
      fcmOptions: appUrl ? { link: appUrl } : undefined,
    },
  });
  sent += res.successCount;
  await Promise.all(res.responses.map((r, j) => {
    const code = r.error?.code || "";
    if (code.includes("registration-token-not-registered") || code.includes("invalid-registration-token") || code.includes("invalid-argument")) {
      removed++; return db.doc("tokens/" + batch[j]).delete();
    }
  }));
}
if (expired) await tripRef.set({ lastNotifiedAt: now.toISOString() }, { merge: true });
console.log(`Notification envoyée à ${sent} téléphone(s). Jetons expirés retirés : ${removed}.`);
console.log(body);
