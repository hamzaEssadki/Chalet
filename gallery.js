// Photos de l'accueil : photo de groupe en fond d'en-tête, bande de trophées, mur complet et visionneuse.
// Lit photos/photos.json (modifiable dans GitHub pour changer les légendes).
(function () {
  const hero = document.getElementById("hero");
  const strip = document.getElementById("strip");
  if (!hero && !strip) return;
  const base = (strip && strip.dataset.base) || "photos/";
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const src = p => p.src || base + p.file;
  const trophy = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 3h10v2h3v3a4 4 0 0 1-4 4h-.3A5 5 0 0 1 13 14.9V18h3v3H8v-3h3v-3.1A5 5 0 0 1 8.3 12H8a4 4 0 0 1-4-4V5h3V3zm0 4H6v1a2 2 0 0 0 1 1.7V7zm10 0v2.7A2 2 0 0 0 18 8V7h-1z"/></svg>';
  let data = null, view = [], filter = "Tout", expanded = false, idx = 0, lb = null, touchX = 0;

  async function load() {
    if (window.GALLERY_DATA) return window.GALLERY_DATA;
    const r = await fetch(base + "photos.json", { cache: "no-cache" });
    if (!r.ok) throw new Error(r.status);
    return r.json();
  }

  function renderHero() {
    if (!hero || !data.hero) return;
    hero.classList.add("has-photo");
    hero.style.setProperty("--hero", `url("${src(data.hero)}")`);
    hero.setAttribute("role", "button"); hero.tabIndex = 0;
    hero.setAttribute("aria-label", "Agrandir la photo de groupe");
  }

  const card = (p, i, cls) => `<button class="${cls}" type="button" data-i="${i}" aria-label="${esc(p.prix)}">
    <span class="frame"><span class="ph">
      <img src="${esc(src(p))}" alt="${esc(p.prix)} — ${esc(p.texte)}" loading="lazy" width="${p.w || ""}" height="${p.h || ""}">
      <span class="award"><span>${trophy}${esc(p.prix)}</span></span></span>
      <span class="txt">${esc(p.texte)}</span>
    </span></button>`;

  function renderStrip() {
    if (!strip) return;
    const tags = ["Tout", ...new Set(data.photos.map(p => p.tag).filter(Boolean))];
    view = expanded ? data.photos.filter(p => filter === "Tout" || p.tag === filter) : data.photos;
    strip.innerHTML = `
      <div class="strip-head">
        <div><div class="eyebrow">Les trophées du chalet</div><b>${data.photos.length} moments à ne jamais oublier</b></div>
        <button type="button" class="strip-more" data-toggle>${expanded ? "Réduire" : "Voir tout"}</button>
      </div>
      ${expanded ? `
        <div class="wall-filters" role="group" aria-label="Filtrer les photos">
          ${tags.map(t => `<button type="button" data-f="${esc(t)}" aria-pressed="${t === filter}">${esc(t)}</button>`).join("")}
        </div>
        <div class="wall-grid">${view.map((p, i) => card(p, i, "pin")).join("")}</div>`
      : `<div class="strip-row">${view.map((p, i) => card(p, i, "pin pin-strip")).join("")}</div>`}`;
  }

  function open(i, isHero) {
    idx = i;
    lb = document.createElement("div");
    lb.className = "lb"; lb.setAttribute("role", "dialog"); lb.setAttribute("aria-modal", "true");
    document.body.appendChild(lb);
    show(isHero);
    requestAnimationFrame(() => lb && lb.classList.add("on"));
    document.body.style.overflow = "hidden";
  }
  function show(isHero) {
    const p = isHero ? { ...data.hero, prix: data.hero.titre, texte: data.hero.sous } : view[idx];
    lb.innerHTML = `<button class="x" type="button" data-close aria-label="Fermer">✕</button>
      <img src="${esc(src(p))}" alt="${esc(p.prix)}">
      <div class="meta"><b>${esc(p.prix)}</b><p>${esc(p.texte)}</p></div>
      ${isHero || view.length < 2 ? "" : `<div class="nav"><button type="button" data-prev>‹ Précédente</button><span class="pos">${idx + 1} / ${view.length}</span><button type="button" data-next>Suivante ›</button></div>`}`;
    lb.querySelector("[data-close]").focus();
  }
  function close() { if (lb) { lb.remove(); lb = null; document.body.style.overflow = ""; } }
  const step = d => { if (!lb || view.length < 2) return; idx = (idx + d + view.length) % view.length; show(false); };

  hero && hero.addEventListener("click", () => data && data.hero && open(0, true));
  hero && hero.addEventListener("keydown", e => { if ((e.key === "Enter" || e.key === " ") && data && data.hero) { e.preventDefault(); open(0, true); } });
  strip && strip.addEventListener("click", e => {
    if (e.target.closest("[data-toggle]")) { expanded = !expanded; filter = "Tout"; renderStrip(); return; }
    const f = e.target.closest("[data-f]");
    if (f) { filter = f.dataset.f; renderStrip(); return; }
    const pin = e.target.closest(".pin");
    if (pin) open(+pin.dataset.i, false);
  });
  document.addEventListener("click", e => {
    if (!lb) return;
    if (e.target.closest("[data-close]") || e.target === lb) close();
    else if (e.target.closest("[data-prev]")) step(-1);
    else if (e.target.closest("[data-next]")) step(1);
  });
  document.addEventListener("keydown", e => {
    if (!lb) return;
    if (e.key === "Escape") close();
    if (e.key === "ArrowLeft") step(-1);
    if (e.key === "ArrowRight") step(1);
  });
  document.addEventListener("touchstart", e => { if (lb) touchX = e.touches[0].clientX; }, { passive: true });
  document.addEventListener("touchend", e => {
    if (!lb) return; const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
  }, { passive: true });

  load().then(d => { data = d; renderHero(); renderStrip(); })
    .catch(() => { if (strip) strip.hidden = true; });
})();
