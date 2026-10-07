/* Gemeinsame Helfer + API-Anbindung (Google Apps Script). Ohne API_URL läuft alles im Demo-Modus. */
(function () {
  const cfg = window.TTS_CONFIG || {};
  const DEMO = !cfg.API_URL;
  const CATEGORIES = ['Tech', 'Beauty', 'Haushalt', 'Sonstiges'];

  /* ---------- Speicher (robust, falls localStorage blockiert ist) ---------- */
  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (_) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* ignorieren */ }
    },
    remove(key) {
      try { localStorage.removeItem(key); } catch (_) { /* ignorieren */ }
    },
  };

  const session = {
    get: () => store.get('tts_session', null),
    set: (s) => store.set('tts_session', s),
    clear: () => store.remove('tts_session'),
  };

  /* ---------- Formatierung & Sicherheit ---------- */
  const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
  const fmtEUR = (n) => (typeof n === 'number' && isFinite(n) ? eur.format(n) : '–');

  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const safeUrl = (u) => (/^https?:\/\//i.test(String(u || '').trim()) ? String(u).trim() : '');

  const b64url = (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  /** Link zum Telegram-Bot; start-Parameter = Base64url(TikTok-Username). */
  const telegramBotLink = (userId) =>
    `https://t.me/${cfg.TELEGRAM_BOT}` + (userId ? `?start=${b64url(userId)}` : '');

  /** Kaufen-Link: privater Chat des Creators, sonst Bot mit Produkt-Referenz. */
  const buyLink = (p) => {
    if (p.telegram) return `https://t.me/${encodeURIComponent(p.telegram)}`;
    const ref = String(p.id || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 58);
    return `https://t.me/${cfg.TELEGRAM_BOT}?start=kauf_${ref}`;
  };

  const salePrice = (purchase, rate) =>
    Math.round(purchase * (rate === 0 ? 0.82 : 1 - rate) * 100) / 100;

  /* ---------- Live-API ---------- */
  async function apiGet(action) {
    const res = await fetch(`${cfg.API_URL}?action=${encodeURIComponent(action)}`);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Unbekannter Fehler');
    return data;
  }

  async function apiPost(payload) {
    // text/plain vermeidet einen CORS-Preflight, den Apps Script nicht beantwortet
    const res = await fetch(cfg.API_URL, { method: 'POST', body: JSON.stringify(payload) });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Unbekannter Fehler');
    return data;
  }

  /* ---------- Demo-Modus (nur im Browser gespeichert) ---------- */
  const DEMO_PRODUCTS = [
    { id: 'demo-1', userId: 'techtina', name: 'Kabellose Noise-Cancelling Earbuds', originalPrice: 79.99, category: 'Tech', rate: 0.3 },
    { id: 'demo-2', userId: 'glowbylena', name: 'Medicube Booster Pro Gesichtsgerät', originalPrice: 189.0, category: 'Beauty', rate: 0.42 },
    { id: 'demo-3', userId: 'homehacks.max', name: 'Mini-Heißluftfritteuse 4 L', originalPrice: 64.9, category: 'Haushalt', rate: 0 },
    { id: 'demo-4', userId: 'techtina', name: 'Magnetische Powerbank 10.000 mAh', originalPrice: 34.99, category: 'Tech', rate: 0.3 },
    { id: 'demo-5', userId: 'glowbylena', name: 'Snail Mucin Essence 100 ml', originalPrice: 21.5, category: 'Beauty', rate: 0.42 },
    { id: 'demo-6', userId: 'homehacks.max', name: 'Akku-Milchaufschäumer mit Ständer', originalPrice: 27.0, category: 'Haushalt', rate: 0 },
    { id: 'demo-7', userId: 'gadgetguru', name: 'LED Sunset-Lampe mit App', originalPrice: 39.9, category: 'Sonstiges', rate: 0.3 },
    { id: 'demo-8', userId: 'gadgetguru', name: 'Smartwatch Fitness-Tracker', originalPrice: 99.0, category: 'Tech', rate: 0.42 },
  ].map((p) => ({ ...p, price: salePrice(p.originalPrice, p.rate), videoLink: 'https://www.tiktok.com/', telegram: '' }));

  const demo = {
    creators: () => store.get('tts_demo_creators', {}),
    products: () => store.get('tts_demo_products', []),
    find(userId) {
      const all = demo.creators();
      const key = Object.keys(all).find((k) => k.toLowerCase() === String(userId).toLowerCase());
      return key ? all[key] : null;
    },
    save(creator) {
      const all = demo.creators();
      all[creator.userId] = creator;
      store.set('tts_demo_creators', all);
    },
    auth({ userId, creatorKey }) {
      const c = demo.find(String(userId || '').replace(/^@+/, '').trim());
      if (!c || c.creatorKey !== String(creatorKey || '').trim()) {
        throw new Error('Login fehlgeschlagen. Username oder Creator-Key ist falsch.');
      }
      return c;
    },
  };

  const delay = (ms) => new Promise((r) => setTimeout(r, ms));

  /* ---------- Öffentliche Funktionen ---------- */
  async function getProducts() {
    if (!DEMO) return (await apiGet('products')).products;
    await delay(350);
    return [...demo.products().slice().reverse(), ...DEMO_PRODUCTS];
  }

  async function register({ isShopCreator, userId, statusCode }) {
    if (!DEMO) return apiPost({ action: 'register', isShopCreator, userId, statusCode });
    await delay(400);
    if (isShopCreator !== true) throw new Error('Die Plattform ist nur für offizielle TikTok Shop Creator.');
    const id = String(userId).replace(/^@+/, '').trim();
    if (demo.find(id)) throw new Error('Dieser TikTok-Username ist bereits registriert. Bitte logge dich im Dashboard ein.');
    const creatorKey = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
    const creator = { userId: id, statusCode, telegram: '', creatorKey };
    demo.save(creator);
    return { ok: true, creator: { userId: id, statusCode, telegram: '' }, creatorKey };
  }

  async function login(creds) {
    if (!DEMO) return apiPost({ action: 'login', ...creds });
    await delay(300);
    const c = demo.auth(creds);
    return { ok: true, creator: { userId: c.userId, statusCode: c.statusCode, telegram: c.telegram } };
  }

  async function addProduct(creds, product) {
    if (!DEMO) return apiPost({ action: 'addProduct', ...creds, ...product });
    await delay(500);
    const c = demo.auth(creds);
    const purchase = Number(String(product.price).replace(',', '.'));
    const p = {
      id: 'local-' + Date.now(),
      userId: c.userId,
      name: product.name || '',
      originalPrice: purchase,
      price: salePrice(purchase, c.statusCode),
      videoLink: product.videoLink,
      category: CATEGORIES.includes(product.category) ? product.category : 'Sonstiges',
      telegram: c.telegram,
    };
    store.set('tts_demo_products', [...demo.products(), p]);
    return { ok: true, product: p };
  }

  async function updateProfile(creds, telegram) {
    if (!DEMO) return apiPost({ action: 'updateProfile', ...creds, telegram });
    await delay(300);
    const c = demo.auth(creds);
    c.telegram = String(telegram || '').replace(/^https?:\/\/(www\.)?t(elegram)?\.me\//i, '').replace(/^@+/, '').trim();
    demo.save(c);
    return { ok: true, creator: { userId: c.userId, statusCode: c.statusCode, telegram: c.telegram } };
  }

  /* Demo-Hinweis einblenden */
  document.addEventListener('DOMContentLoaded', () => {
    const banner = document.getElementById('demoBanner');
    if (banner && DEMO) banner.hidden = false;
  });

  window.TTS = {
    DEMO, CATEGORIES, session, fmtEUR, esc, safeUrl, telegramBotLink, buyLink,
    getProducts, register, login, addProduct, updateProfile,
  };
})();
