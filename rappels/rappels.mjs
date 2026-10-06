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

// ✏️ Le message envoyé pour chaque personne qui n'a pas payé ({nom} = son prénom).
const MESSAGE = "{nom} sma3 dak weld la puta, envoie le virement stp le plus rapidement possible tout le monde attends pour finaliser la facture";

let tokens = (await db.collection("tokens").get()).docs.map(d => d.id);
if (!tokens.length) { console.log("Aucun téléphone inscrit aux notifications."); process.exit(0); }

// Une notification par personne non payée, envoyée à tout le monde.
let sent = 0, removed = 0;
for (const nom of unpaid) {
  const title = `💸 ${nom} n'a pas payé ${fmt(trip.amount)}`;
  const body = MESSAGE.replaceAll("{nom}", nom);
  for (let i = 0; i < tokens.length; i += 500) {
    const batch = tokens.slice(i, i + 500);
    const res = await admin.messaging().sendEachForMulticast({
      tokens: batch,
      webpush: {
        notification: { title, body, tag: "rappel-" + nom, icon: appUrl ? appUrl + "icon-192.png" : undefined },
        fcmOptions: appUrl ? { link: appUrl } : undefined,
      },
    });
    sent += res.successCount;
    const dead = [];
    res.responses.forEach((r, j) => {
      const code = r.error?.code || "";
      if (code.includes("registration-token-not-registered") || code.includes("invalid-registration-token") || code.includes("invalid-argument")) dead.push(batch[j]);
    });
    await Promise.all(dead.map(t => db.doc("tokens/" + t).delete()));
    removed += dead.length;
    tokens = tokens.filter(t => !dead.includes(t));
  }
  console.log(title + " — " + body);
}
if (expired) await tripRef.set({ lastNotifiedAt: now.toISOString() }, { merge: true });
console.log(`${unpaid.length} rappel(s) envoyé(s), ${sent} notification(s) livrée(s). Jetons expirés retirés : ${removed}.`);
