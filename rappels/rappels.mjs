// 1) Envoie les annonces « facture complétée » demandées par l'organisateur dans l'app.
// 2) Envoie la notification « X n'a pas payé » à tous les téléphones inscrits.
// Lancé toutes les 5 minutes par GitHub Actions (.github/workflows/rappels.yml).
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

// ✏️ Le message envoyé quand l'organisateur marque une facture comme complétée.
const MESSAGE_FACTURE = "WA L7WA tout est payé et le chalet est a nouuus, KHANASSNII";

// ✏️ Messages de la relance manuelle (bouton « Envoyer la relance » dans l'app).
const MESSAGE_NON_PAYE = "Safi hadchi li bghiti, chouha yallah KHANSNII";       // reçu par les non-payés
const MESSAGE_PAYE = "{nom} Mazal mkhanassnich SPAMMER LEEE !";                // reçu par les autres, une fois par non-payé

const tokenDocs = (await db.collection("tokens").get()).docs.map(d => ({ id: d.id, who: String(d.data().who || "").trim().toLowerCase() }));
let tokens = tokenDocs.map(t => t.id);
let removed = 0;

// Envoie une notification à tous les téléphones inscrits ; retire les jetons expirés.
async function sendToAll(title, body, tag) { return sendTo(tokens, title, body, tag); }
async function sendTo(list, title, body, tag) {
  let sent = 0;
  list = list.filter(t => tokens.includes(t));
  for (let i = 0; i < list.length; i += 500) {
    const batch = list.slice(i, i + 500);
    const res = await admin.messaging().sendEachForMulticast({
      tokens: batch,
      webpush: {
        notification: { title, body, tag, icon: appUrl ? appUrl + "icon-192.png" : undefined },
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
  return sent;
}

// ---------- 1) Annonces « facture complétée » ----------
const pending = await db.collection("announcements").where("sentAt", "==", null).get();
for (const a of pending.docs) {
  const d = a.data();
  if (d.type === "relance") {
    const people = (await db.collection("people").get()).docs.map(x => x.data());
    const unpaidNames = people.filter(p => !p.paid).map(p => String(p.name || "").trim()).filter(Boolean);
    const unpaidKeys = new Set(unpaidNames.map(n => n.toLowerCase()));
    const toUnpaid = tokenDocs.filter(t => unpaidKeys.has(t.who)).map(t => t.id);
    const toOthers = tokenDocs.filter(t => !unpaidKeys.has(t.who)).map(t => t.id);
    let n = 0;
    if (unpaidNames.length) {
      n += await sendTo(toUnpaid, "💸 Rappel de paiement", MESSAGE_NON_PAYE, "relance-moi");
      for (const nom of unpaidNames) n += await sendTo(toOthers, `💸 ${nom} n'a pas encore payé`, MESSAGE_PAYE.replaceAll("{nom}", nom), "relance-" + nom);
    }
    await a.ref.update({ sentAt: new Date().toISOString(), delivered: n });
    console.log(`Relance : ${unpaidNames.join(", ") || "personne"} — ${toUnpaid.length} téléphone(s) non-payé(s), ${toOthers.length} autre(s), ${n} notification(s)`);
    continue;
  }
  const title = `✅ ${d.label || "Facture"} : complétée !`;
  const n = tokens.length ? await sendToAll(title, MESSAGE_FACTURE, "facture-" + a.id) : 0;
  await a.ref.update({ sentAt: new Date().toISOString(), delivered: n });
  console.log(`${title} — ${MESSAGE_FACTURE} (${n} téléphone(s))`);
}

// ---------- 2) Rappels de paiement ----------
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

if (!tokens.length) { console.log("Aucun téléphone inscrit aux notifications."); process.exit(0); }

// Une notification par personne non payée, envoyée à tout le monde.
let sent = 0;
for (const nom of unpaid) {
  const title = `💸 ${nom} n'a pas payé ${fmt(trip.amount)}`;
  const body = MESSAGE.replaceAll("{nom}", nom);
  sent += await sendToAll(title, body, "rappel-" + nom);
  console.log(title + " — " + body);
}
if (expired) await tripRef.set({ lastNotifiedAt: now.toISOString() }, { merge: true });
console.log(`${unpaid.length} rappel(s) envoyé(s), ${sent} notification(s) livrée(s). Jetons expirés retirés : ${removed}.`);
