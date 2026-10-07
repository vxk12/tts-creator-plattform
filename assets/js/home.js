/* TTS Deals – Startseite: Loader, Lenis, Spring-Motion, Reveals, Karussells, Live-Deals. */
const T = window.TTS;
const html = document.documentElement;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const hoverOK = () => innerWidth > 768;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* ---------------- Adaptives rem-Raster (Scale-up > 1920px) ---------------- */
function fitRoot() {
  const FONT_BASE = 16, BASE_W = 1920, COEF = 0.6666;
  const reduction = ((BASE_W - innerWidth) / BASE_W) * 100 * COEF;
  const size = FONT_BASE - (FONT_BASE * reduction) / 100;
  if (size > FONT_BASE) html.style.fontSize = size + 'px';
  else html.style.removeProperty('font-size');
}
fitRoot();
addEventListener('resize', fitRoot);

/* ---------------- Lenis (Smooth Scroll) ---------------- */
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
window.scrollTo(0, 0);
let lenis;
try {
  const { default: Lenis } = await import('lenis');
  lenis = new Lenis({ smoothWheel: true });
} catch (_) {
  // Fallback, falls das CDN nicht erreichbar ist
  lenis = {
    raf() {}, stop() {}, start() {}, on() {},
    scrollTo(t) { const el = typeof t === 'string' ? $(t) : t; (el || document.body).scrollIntoView({ behavior: 'smooth' }); },
  };
}
let locks = 0;
const lock = () => { if (locks++ === 0) { lenis.stop(); html.classList.add('is-locked'); } };
const unlock = () => { if (locks > 0 && --locks === 0) { html.classList.remove('is-locked'); lenis.start(); } };

/* ---------------- Mini-Spring (tension/friction wie react-spring) ---------------- */
const active = new Set();
const SMALL = new Set(['opacity', 'scale']);
class Spring {
  constructor(init, cfg, apply) {
    this.x = { ...init }; this.t = { ...init }; this.v = {};
    for (const k in init) this.v[k] = 0;
    this.cfg = { tension: 170, friction: 26, ...cfg };
    this.apply = apply;
    apply(this.x);
  }
  to(target, cfg) {
    if (cfg) this.cfg = { ...this.cfg, ...cfg };
    for (const k in target) { if (!(k in this.x)) { this.x[k] = target[k]; this.v[k] = 0; } this.t[k] = target[k]; }
    if (RM) { Object.assign(this.x, this.t); this.apply(this.x); return this; }
    active.add(this);
    return this;
  }
  set(vals) {
    Object.assign(this.x, vals); Object.assign(this.t, vals);
    for (const k in vals) this.v[k] = 0;
    active.delete(this); this.apply(this.x);
    return this;
  }
  step(dt) {
    const { tension, friction } = this.cfg;
    const n = Math.max(1, Math.round(dt * 1000)); const h = dt / n;
    let moving = false;
    for (const k in this.t) {
      let x = this.x[k], v = this.v[k] || 0; const tg = this.t[k];
      for (let i = 0; i < n; i++) { v += (-tension * (x - tg) - friction * v) * h; x += v * h; }
      const eps = SMALL.has(k) ? 0.0005 : 0.01;
      if (Math.abs(x - tg) < eps && Math.abs(v) < eps * 10) { x = tg; v = 0; } else moving = true;
      this.x[k] = x; this.v[k] = v;
    }
    this.apply(this.x);
    if (!moving) active.delete(this);
  }
}
const tf = (el) => (s) => {
  if ('opacity' in s) el.style.opacity = s.opacity;
  el.style.transform = `translate3d(${s.x || 0}px,${s.y || 0}px,0) scale(${s.scale ?? 1}) rotate(${s.rotate || 0}deg)`;
};

/* ---------------- Ready-Gate (Loader) ---------------- */
let ready = false;
const readyQueue = [];
const whenReady = (fn) => (ready ? fn() : readyQueue.push(fn));

/* ---------------- Inview ---------------- */
const io = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) { io.unobserve(e.target); e.target.__onView && e.target.__onView(); }
}, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
const onView = (el, fn) => { el.__onView = fn; io.observe(el); };

function inview(el, from, to, cfg, delay = 0, gated = false) {
  const s = new Spring(from, cfg, tf(el));
  onView(el, () => (gated ? whenReady : (f) => f())(() => setTimeout(() => s.to(to), delay)));
  return s;
}
function hover(trigger, target, from, to, cfg, apply) {
  const s = new Spring(from, cfg, apply || tf(target));
  trigger.addEventListener('pointerenter', () => { if (hoverOK()) s.to(to); });
  trigger.addEventListener('pointerleave', () => s.to(from));
  return s;
}

/* ---------------- Text-Reveals (Clip-Maske) ---------------- */
function stackedLines(el, { stagger = 120, delay = 0, duration = 950, gated = false } = {}) {
  const lines = (el.dataset.lines || el.textContent).split('|');
  el.setAttribute('aria-label', lines.join(' '));
  el.innerHTML = lines.map((l, i) =>
    `<span class="clip line" aria-hidden="true"><span style="--d:${duration}ms;--delay:${delay + i * stagger}ms">${T.esc(l)}</span></span>`).join('');
  onView(el, () => (gated ? whenReady : (f) => f())(() => el.classList.add('is-in')));
}
function words(el, { stagger = 140, duration = 1100, gated = false } = {}) {
  const ws = (el.dataset.words || el.textContent).trim().split(/\s+/);
  el.setAttribute('aria-label', ws.join(' '));
  el.innerHTML = ws.map((w, i) =>
    `<span class="clip" aria-hidden="true"><span style="--d:${duration}ms;--delay:${i * stagger}ms">${T.esc(w)}</span></span>`).join(' ');
  onView(el, () => (gated ? whenReady : (f) => f())(() => el.classList.add('is-in')));
}
function fadeWords(el, { stagger = 28, delay = 250 } = {}) {
  const ws = el.textContent.trim().split(/\s+/);
  el.setAttribute('aria-label', ws.join(' '));
  el.innerHTML = ws.map((w, i) => `<span class="fade-w" aria-hidden="true" style="--delay:${delay + i * stagger}ms">${T.esc(w)}</span>`).join(' ');
  onView(el, () => el.classList.add('is-in'));
}
function refire(clipEl, text) {
  clipEl.classList.remove('is-in');
  clipEl.firstElementChild.textContent = text;
  void clipEl.offsetWidth;
  clipEl.classList.add('is-in');
}

/* ---------------- Parallax ---------------- */
const parallax = [];
function addParallax(el, section, axis, from, to) { parallax.push({ el, section, axis, from, to }); }
function updateParallax() {
  const vh = innerHeight;
  for (const p of parallax) {
    const r = p.section.getBoundingClientRect();
    if (r.bottom < -50 || r.top > vh + 50) continue;
    const prog = clamp((vh - r.top) / (vh + r.height), 0, 1);
    const v = p.from + (p.to - p.from) * prog;
    p.el.style.transform = p.axis === 'y' ? `translate3d(0,${v}%,0)` : `translate3d(${v}%,0,0)`;
  }
}

/* ---------------- Haupt-Loop ---------------- */
let last = performance.now();
function frame(t) {
  lenis.raf(t);
  const dt = Math.min((t - last) / 1000, 1 / 20); last = t;
  for (const s of active) s.step(dt);
  updateParallax();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/* =====================================================================
   Loader
   ===================================================================== */
const MIN_VISIBLE_MS = RM ? 200 : 1400, MAX_VISIBLE_MS = 2600, EXIT_MS = RM ? 0 : 850;
const loader = $('#loader');
loader.style.animation = 'none';
lock();
new Spring({ opacity: 0, y: 16 }, { tension: 200, friction: 22 }, tf($('#loaderBrand'))).to({ opacity: 1, y: 0 });
requestAnimationFrame(() => requestAnimationFrame(() => loader.classList.add('is-filling')));

let countdown = false;
function startCountdown() { if (countdown) return; countdown = true; setTimeout(finishLoader, MIN_VISIBLE_MS); }
function finishLoader() {
  if (ready) return;
  ready = true;
  readyQueue.splice(0).forEach((fn) => fn());
  unlock();
  loader.style.transition = `transform ${EXIT_MS}ms var(--ease-in-out-cubic)`;
  loader.style.transform = 'translateY(-105%)';
  setTimeout(() => loader.remove(), EXIT_MS + 20);
}
if (document.readyState === 'complete') startCountdown();
else addEventListener('load', startCountdown, { once: true });
setTimeout(() => { if (!countdown) { countdown = true; finishLoader(); } }, MAX_VISIBLE_MS);

/* =====================================================================
   Statische Reveals
   ===================================================================== */
words($('#heroTitle'), { stagger: 140, duration: 1100, gated: true });
const tg = $('#heroTagline');
stackedLines(tg, { stagger: +tg.dataset.stagger, delay: +tg.dataset.delay, duration: +tg.dataset.duration, gated: true });
$$('[data-lines]').forEach((el) => { if (el !== tg) stackedLines(el); });
fadeWords($('#creatorBody'));

addParallax($('#heroPlate'), $('.hero'), 'y', 0, 12);

const rise = (y) => [{ opacity: 0, y }, { opacity: 1, y: 0 }];
inview($('#slider'), ...rise(28), { tension: 200, friction: 26 }, 650, true);
inview($('#member'), ...rise(28), { tension: 200, friction: 26 }, 780, true);
inview($('#pct'), { opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1 }, { tension: 220, friction: 22 });
inview($('#badgeCard'), ...rise(24), { tension: 200, friction: 26 }, 120);
inview($('#coach'), { opacity: 0, y: 60, scale: 0.92 }, { opacity: 1, y: 0, scale: 1 }, { tension: 170, friction: 26 });

$$('.steps .row').forEach((row, i) => {
  inview(row, ...rise(26), { tension: 190, friction: 26 }, i * 90);
  const arrow = $('.row__arrow > span', row);
  hover(row.closest('a'), arrow, { x: 0, opacity: 0.55 }, { x: 8, opacity: 1 }, { tension: 300, friction: 20 });
});
inview($('#creatorIcon'), { opacity: 0, scale: 0.85 }, { opacity: 1, scale: 1 }, { tension: 240, friction: 20 });
$$('.tiles figure').forEach((fig, i) => {
  inview(fig, ...rise(48), { tension: 180, friction: 26 }, i * 140);
  hover(fig, $('img', fig), { scale: 1 }, { scale: 1.03 }, { tension: 300, friction: 22 });
});
$$('.stat').forEach((el, i) => inview(el, ...rise(30), { tension: 180, friction: 24 }, i * 110));
$$('.faq li').forEach((li, i) => {
  inview(li, ...rise(40), { tension: 180, friction: 26 }, i * 120);
  const card = $('.qa', li);
  hover(card, card, { y: 0 }, { y: -8 }, { tension: 300, friction: 22 });
});
inview($('#footerCta'), ...rise(20), { tension: 200, friction: 24 }, 150);

// Pill-Pfeile, Arrow-Buttons, X-Icons
$$('.pill').forEach((p) => { const a = $('.arr', p); if (a) hover(p, a, { x: 0 }, { x: 5 }, { tension: 320, friction: 20 }); });
$$('.arrow-btn').forEach((b) => hover(b, $('.hv', b), { scale: 1 }, { scale: 1.15 }, { tension: 320, friction: 18 }));
$$('.x-btn').forEach((b) => hover(b, $('span', b), { rotate: 0 }, { rotate: 90 }, { tension: 300, friction: 18 }));

/* =====================================================================
   Trust-Karussell (Kategorien)
   ===================================================================== */
const SLIDES = [
  { headline: ['Einmal', 'Gefilmt,', 'Fast', 'Neu'], image: 'assets/img/cat-tech.webp', name: 'Tech', role: 'Kopfhörer, Gadgets & Zubehör', alt: 'Kopfhörer und Smartphone auf einem Schreibtisch' },
  { headline: ['Echte', 'Creator,', 'Echte', 'Deals'], image: 'assets/img/cat-beauty.webp', name: 'Beauty', role: 'Pflege, Make-up & Beauty-Tools', alt: 'Frau testet ein Beauty-Gerät' },
  { headline: ['Video', 'Checken,', 'Clever', 'Sparen'], image: 'assets/img/cat-haushalt.webp', name: 'Haushalt', role: 'Küche, Wohnen & Alltagshelfer', alt: 'Frisch aufgeschäumter Milchkaffee' },
];
SLIDES.forEach((s) => { const i = new Image(); i.src = s.image; });
const gws = $$('[data-gw]');
const trustSec = $('#trust');
const coachImg = $('#coachImg');
const photo = new Spring({ opacity: 1 }, { tension: 260, friction: 26 }, (s) => { coachImg.style.opacity = s.opacity; });
let slide = 0;
const PX = [[-3, 3], [3, -3], [-2, 4], [4, -3]];
gws.forEach((w, i) => addParallax(w, trustSec, 'x', PX[i][0], PX[i][1]));

function renderTrust(first = false) {
  const s = SLIDES[slide];
  $('#trust-title').setAttribute('aria-label', s.headline.join(' '));
  gws.forEach((w, i) => (first ? (w.firstElementChild.textContent = s.headline[i]) : refire(w, s.headline[i])));
  if (!first) { photo.set({ opacity: 0 }); }
  coachImg.src = s.image; coachImg.alt = s.alt;
  $('#coachName').textContent = s.name;
  $('#coachRole').textContent = s.role;
  if (!first) photo.to({ opacity: 1 });
  renderDots($('#trustDots'), SLIDES.length, slide, (i) => { slide = i; renderTrust(); });
}
function renderDots(box, n, idx, onPick) {
  box.innerHTML = Array.from({ length: n }, (_, i) =>
    `<button type="button" aria-label="${i + 1} von ${n}" aria-current="${i === idx}"><i></i></button>`).join('');
  $$('button', box).forEach((b, i) => b.addEventListener('click', () => onPick(i)));
}
renderTrust(true);
onView($('#trust-title'), () => gws.forEach((w) => w.classList.add('is-in')));
$('#trustPrev').addEventListener('click', () => { slide = (slide - 1 + SLIDES.length) % SLIDES.length; renderTrust(); });
$('#trustNext').addEventListener('click', () => { slide = (slide + 1) % SLIDES.length; renderTrust(); });

/* =====================================================================
   Menü-Overlay
   ===================================================================== */
const menu = $('#menu');
const menuBg = new Spring({ opacity: 0 }, { tension: 260, friction: 30 }, (s) => { $('#menuBg').style.opacity = s.opacity; });
const menuPanel = new Spring({ opacity: 0, y: -24 }, { tension: 220, friction: 28 }, tf($('#menuPanel')));
const menuLinks = $$('.menu__nav a').map((a) => new Spring({ opacity: 0, y: 28 }, { tension: 200, friction: 26 }, tf(a)));
let menuOpen = false;
let linkTimers = [];
function openMenu() {
  if (menuOpen) return; menuOpen = true;
  menu.classList.add('is-open'); menu.removeAttribute('inert'); menu.setAttribute('aria-hidden', 'false');
  $('#burger').setAttribute('aria-expanded', 'true');
  lock();
  menuBg.to({ opacity: 1 }); menuPanel.to({ opacity: 1, y: 0 });
  linkTimers = menuLinks.map((s, i) => setTimeout(() => s.to({ opacity: 1, y: 0 }), 120 + i * 70));
  setTimeout(() => $('#menuClose').focus(), 50);
}
function closeMenu() {
  if (!menuOpen) return; menuOpen = false;
  linkTimers.forEach(clearTimeout);
  menu.classList.remove('is-open'); menu.setAttribute('inert', ''); menu.setAttribute('aria-hidden', 'true');
  $('#burger').setAttribute('aria-expanded', 'false');
  menuBg.to({ opacity: 0 }); menuPanel.to({ opacity: 0, y: -24 });
  menuLinks.forEach((s) => s.to({ opacity: 0, y: 28 }));
  unlock();
}
$('#burger').addEventListener('click', openMenu);
$('#menuClose').addEventListener('click', closeMenu);
$('#menuBg').addEventListener('click', closeMenu);
addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });

/* Anker-Links → Lenis */
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#"]');
  if (!a) return;
  const id = a.getAttribute('href');
  if (id === '#') return;
  const target = $(id);
  if (!target) return;
  e.preventDefault();
  if (menuOpen) closeMenu();
  if (a.dataset.cat) {
    // Filter ändert die Seitenhöhe → Lenis-Maße erst aktualisieren, dann scrollen
    setCategory(a.dataset.cat);
    requestAnimationFrame(() => { lenis.resize && lenis.resize(); lenis.scrollTo(target, { offset: 0, duration: 1.2 }); });
    return;
  }
  lenis.scrollTo(target, { offset: 0, duration: 1.2 });
});

/* =====================================================================
   Live-Deals
   ===================================================================== */
const state = { all: [], cat: 'Alle', q: '', sort: 'new' };
const grid = $('#grid'), chips = $('#chips'), count = $('#count'), empty = $('#empty');

const discount = (p) => (p.originalPrice > 0 && p.price < p.originalPrice ? Math.round((1 - p.price / p.originalPrice) * 100) : 0);
const displayName = (p) => {
  if (p.name) return p.name;
  const t = (p.videoTitle || '').replace(/#\S+/g, '').replace(/\s+/g, ' ').trim();
  if (t) return t.length > 70 ? t.slice(0, 67) + '…' : t;
  return 'TikTok Shop Produkt';
};
const CAT_IMG = { Tech: 'cat-tech', Beauty: 'cat-beauty', Haushalt: 'cat-haushalt', Sonstiges: 'cat-sonstiges' };
const imageOf = (p) => T.safeUrl(p.thumbnail) || p.image || `assets/img/${CAT_IMG[p.category] || 'cat-sonstiges'}.webp`;

function dealHTML(p) {
  const off = discount(p);
  const video = T.safeUrl(p.videoLink);
  return `<li><article class="deal">
    <div class="deal__media">
      <img src="${T.esc(imageOf(p))}" alt="" loading="lazy" referrerpolicy="no-referrer"
        onerror="this.onerror=null;this.src='assets/img/${CAT_IMG[p.category] || 'cat-sonstiges'}.webp'">
      <span class="deal__cat">${T.esc(p.category)}</span>
      ${off ? `<span class="deal__off">−${off} %</span>` : ''}
    </div>
    <div class="deal__body">
      <h3 class="deal__name">${T.esc(displayName(p))}</h3>
      <div class="deal__price">
        <span class="deal__now">${T.fmtEUR(p.price)}</span>
        ${p.originalPrice ? `<s class="deal__was" aria-label="Originalpreis">${T.fmtEUR(p.originalPrice)}</s>` : ''}
      </div>
      <p class="deal__cond"><svg><use href="#i-check"/></svg><span>Zustand: Wie neu – nur 1x für Video ausgepackt</span></p>
      ${p.userId ? `<p class="deal__seller">von <b>@${T.esc(p.userId)}</b></p>` : ''}
      <div class="deal__actions">
        ${video
          ? `<a class="btn-deal btn-deal--video" href="${T.esc(video)}" target="_blank" rel="noopener noreferrer"><svg><use href="#i-play"/></svg>Video-Nachweis</a>`
          : `<span class="btn-deal btn-deal--video" aria-disabled="true"><svg><use href="#i-play"/></svg>Video folgt</span>`}
        <a class="btn-deal btn-deal--buy" href="${T.esc(T.buyLink(p))}" target="_blank" rel="noopener noreferrer"><svg><use href="#i-send"/></svg>Jetzt kaufen</a>
      </div>
    </div>
  </article></li>`;
}

function renderChips() {
  const counts = state.all.reduce((m, p) => ((m[p.category] = (m[p.category] || 0) + 1), m), {});
  chips.innerHTML = ['Alle', ...T.CATEGORIES].map((c) =>
    `<button class="chip" type="button" data-chip="${c}" aria-pressed="${c === state.cat}">${c}${c !== 'Alle' && counts[c] ? `<small>${counts[c]}</small>` : ''}</button>`).join('');
}
function setCategory(c) { state.cat = c; renderChips(); renderGrid(); }

function renderGrid() {
  const q = state.q.toLowerCase();
  let list = state.all.filter((p) =>
    (state.cat === 'Alle' || p.category === state.cat) &&
    (!q || `${displayName(p)} ${p.userId} ${p.category}`.toLowerCase().includes(q)));
  const sorters = { 'price-asc': (a, b) => a.price - b.price, 'price-desc': (a, b) => b.price - a.price, discount: (a, b) => discount(b) - discount(a) };
  if (sorters[state.sort]) list = list.slice().sort(sorters[state.sort]);

  grid.innerHTML = list.map(dealHTML).join('');
  empty.hidden = list.length > 0;
  if (!list.length) empty.innerHTML = '<h3>Keine Deals gefunden</h3><p>Probier eine andere Kategorie oder einen anderen Suchbegriff.</p>';
  count.textContent = `${list.length} ${list.length === 1 ? 'Angebot' : 'Angebote'}`;

  $$('li', grid).forEach((li, i) => {
    inview(li, ...rise(36), { tension: 190, friction: 26 }, (i % 4) * 90);
    const card = $('.deal', li);
    hover(card, card, { y: 0 }, { y: -6 }, { tension: 300, friction: 22 });
    hover(card, $('.deal__media img', li), { scale: 1 }, { scale: 1.04 }, { tension: 300, friction: 22 });
  });
}

function skeletons(n) {
  grid.innerHTML = Array.from({ length: n }, () => `<li aria-hidden="true"><div class="deal deal--sk"><div class="deal__media"></div>
    <div class="deal__body"><div class="sk" style="width:80%"></div><div class="sk" style="width:45%;height:1.8rem"></div><div class="sk" style="width:70%"></div>
    <div class="sk" style="height:2.6rem;border-radius:99rem;margin-top:.5rem"></div><div class="sk" style="height:2.6rem;border-radius:99rem"></div></div></div></li>`).join('');
}

chips.addEventListener('click', (e) => { const b = e.target.closest('[data-chip]'); if (b) setCategory(b.dataset.chip); });
$('#search').addEventListener('input', (e) => { state.q = e.target.value.trim(); renderGrid(); });
$('#sort').addEventListener('change', (e) => { state.sort = e.target.value; renderGrid(); });
$('#botLink').href = T.telegramBotLink('');

/* ---------- Hero-Deal-Slider ---------- */
let sliderIdx = 0, sliderTimer = null, sliderDeals = [];
function chipHTML(p) {
  return `<a class="deal-chip glass" href="#deals" data-cat="${T.esc(p.category)}">
    <img src="${T.esc(imageOf(p))}" alt="" referrerpolicy="no-referrer">
    <span class="deal-chip__txt">
      <span class="deal-chip__brand">${T.esc(p.category)} · ${T.fmtEUR(p.price)}</span>
      <span class="deal-chip__title">${T.esc(displayName(p))}</span>
      <span class="deal-chip__cta">Zum Deal →</span>
    </span></a>`;
}
function showSlide(i, first = false) {
  const stage = $('#sliderStage');
  const old = stage.firstElementChild;
  sliderIdx = (i + sliderDeals.length) % sliderDeals.length;
  const tpl = document.createElement('div');
  tpl.innerHTML = chipHTML(sliderDeals[sliderIdx]);
  const card = tpl.firstElementChild;
  stage.prepend(card);
  const cfg = { tension: 210, friction: 24 };
  if (!first) {
    new Spring({ opacity: 0, y: 16, scale: 0.96 }, cfg, tf(card)).to({ opacity: 1, y: 0, scale: 1 });
    if (old) {
      const s = new Spring({ opacity: 1, y: 0, scale: 1 }, cfg, tf(old)).to({ opacity: 0, y: -16, scale: 0.96 });
      setTimeout(() => old.remove(), 700);
      void s;
    }
  }
  renderDots($('#sliderDots'), sliderDeals.length, sliderIdx, (k) => { showSlide(k); restartAutoplay(); });
}
function restartAutoplay() {
  clearInterval(sliderTimer);
  if (sliderDeals.length > 1) sliderTimer = setInterval(() => showSlide(sliderIdx + 1), 3800);
}

/* ---------- Kennzahlen ---------- */
function computeStats(list) {
  const withOrig = list.filter((p) => p.originalPrice > 0);
  const avg = withOrig.length ? Math.round(withOrig.reduce((s, p) => s + discount(p), 0) / withOrig.length) : 0;
  const creators = new Set(list.map((p) => (p.userId || '').toLowerCase()).filter(Boolean)).size;
  const video = list.length ? Math.round((list.filter((p) => T.safeUrl(p.videoLink)).length / list.length) * 100) : 0;
  return { deals: list.length, creators, avg, video };
}
function countUp(el, value, suffix = '') {
  const start = performance.now(), dur = RM ? 1 : 1400;
  const ease = (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));
  (function tick(now) {
    const t = clamp((now - start) / dur, 0, 1);
    el.innerHTML = Math.round(value * ease(t)) + (suffix ? `<em>${suffix}</em>` : '');
    if (t < 1) requestAnimationFrame(tick);
  })(start);
}

async function loadDeals() {
  skeletons(4);
  renderChips();
  try {
    state.all = await T.getProducts();
  } catch (err) {
    grid.innerHTML = '';
    count.textContent = '';
    empty.hidden = false;
    empty.innerHTML = `<h3>Deals konnten nicht geladen werden</h3><p>${T.esc(err.message)}</p><button class="pill pill--light" type="button" id="retry">Erneut versuchen</button>`;
    $('#retry').onclick = () => { empty.hidden = true; loadDeals(); };
    return;
  }
  renderChips();
  renderGrid();

  const st = computeStats(state.all);
  $('#avgSave').textContent = st.avg ? `−${st.avg}%` : '–';
  const statsEl = $('.stats dl');
  onView(statsEl, () => {
    countUp($('[data-stat="deals"]'), st.deals);
    countUp($('[data-stat="creators"]'), st.creators);
    countUp($('[data-stat="avg"]'), st.avg, '%');
    countUp($('[data-stat="video"]'), st.video, '%');
  });

  sliderDeals = state.all.slice().sort((a, b) => discount(b) - discount(a)).slice(0, 3);
  if (sliderDeals.length) whenReady(() => { showSlide(0, true); restartAutoplay(); });
  else $('#slider').hidden = true;
}

if (T.DEMO) { const b = $('#demoBanner'); b.hidden = false; setTimeout(() => b.classList.add('is-gone'), 7000); }
loadDeals();
window.__homeReady = true;
