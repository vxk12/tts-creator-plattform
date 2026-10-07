/**
 * TTS Creator-Plattform – Backend (Google Apps Script)
 *
 * Einrichtung (siehe README.md):
 *   Google Sheet öffnen → Erweiterungen → Apps Script → diesen Code einfügen
 *   → einmal `setup` ausführen → Bereitstellen → Neue Bereitstellung → Web-App
 *     (Ausführen als: Ich, Zugriff: Jeder) → Web-App-URL in assets/js/config.js eintragen.
 */

const CONFIG = {
  PRODUCTS_SHEET: 'Tabellenblatt1',
  CREATORS_SHEET: 'Creators',
  // Formel für Spalte H (Schnäppchenpreis). {r} wird durch die Zeilennummer ersetzt.
  PRICE_FORMULA: '=IF(F{r}="","",IF(I{r}=0,ROUND(F{r}*0.82,2),ROUND(F{r}*(1-I{r}),2)))',
  CATEGORIES: ['Tech', 'Beauty', 'Haushalt', 'Sonstiges'],
  THUMB_CACHE_SECONDS: 21600, // 6 Stunden
};

// Spalten im Produkt-Blatt (1-basiert)
const P = { ID: 1, USER: 2, STATUS: 3, NAME: 4, SHOP: 5, PRICE: 6, VIDEO: 7, SALE: 8, TAX: 9, CAT: 10, CREATED: 11 };
const P_HEADERS = ['Produkt_ID', 'User_ID', 'Status_Code', 'Produkt_Name', 'TTS_Shop_Link', 'Einkaufspreis',
  'TikTok_Video_Link', 'Empfohlener_Verkaufspreis', 'Tax_Rate', 'Kategorie', 'Erstellt_Am'];

// Spalten im Creator-Blatt (1-basiert) – B = User_ID, C = Status_Code wie in der Spezifikation
const C = { CREATED: 1, USER: 2, STATUS: 3, TELEGRAM: 4, KEY_HASH: 5 };
const C_HEADERS = ['Registriert_Am', 'User_ID', 'Status_Code', 'Telegram_Username', 'Creator_Key_Hash'];

/* ------------------------------------------------------------------ */
/* HTTP-Einstiegspunkte                                                */
/* ------------------------------------------------------------------ */

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || 'products';
  try {
    if (action === 'products') return json_({ ok: true, products: listProducts_() });
    return json_({ ok: false, error: 'Unbekannte Aktion.' });
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (_) {
    return json_({ ok: false, error: 'Ungültige Anfrage.' });
  }
  try {
    switch (body.action) {
      case 'register': return json_(register_(body));
      case 'login': return json_(login_(body));
      case 'addProduct': return json_(addProduct_(body));
      case 'updateProfile': return json_(updateProfile_(body));
      default: return json_({ ok: false, error: 'Unbekannte Aktion.' });
    }
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

/** Einmal manuell ausführen: legt das Creator-Blatt und fehlende Spaltenköpfe an. */
function setup() {
  ensureSheets_();
}

/* ------------------------------------------------------------------ */
/* Aktionen                                                            */
/* ------------------------------------------------------------------ */

function register_(body) {
  if (body.isShopCreator !== true) {
    throw new Error('Die Plattform ist nur für offizielle TikTok Shop Creator.');
  }
  const userId = normalizeUser_(body.userId);
  const statusCode = parseRate_(body.statusCode);

  return withLock_(() => {
    const sheet = creatorsSheet_();
    if (findCreator_(userId)) {
      throw new Error('Dieser TikTok-Username ist bereits registriert. Bitte logge dich im Dashboard ein.');
    }
    const creatorKey = Utilities.getUuid().replace(/-/g, '');
    const row = sheet.getLastRow() + 1;
    sheet.getRange(row, 1, 1, C_HEADERS.length)
      .setValues([[new Date(), userId, statusCode, '', hash_(creatorKey)]]);
    return { ok: true, creator: { userId: userId, statusCode: statusCode, telegram: '' }, creatorKey: creatorKey };
  });
}

function login_(body) {
  const creator = auth_(body);
  return { ok: true, creator: publicCreator_(creator) };
}

function addProduct_(body) {
  const creator = auth_(body);
  const shopLink = parseUrl_(body.shopLink, 'TikTok Shop Produkt-Link');
  const videoLink = parseUrl_(body.videoLink, 'TikTok-Video-Link');
  const price = Number(String(body.price || '').replace(',', '.'));
  if (!isFinite(price) || price <= 0 || price > 100000) {
    throw new Error('Bitte gib den Einkaufspreis als Zahl ein (z. B. 27.90).');
  }
  const name = String(body.name || '').trim().slice(0, 120);
  const category = CONFIG.CATEGORIES.indexOf(body.category) >= 0 ? body.category : '';

  return withLock_(() => {
    const sheet = productsSheet_();
    const row = sheet.getLastRow() + 1;
    const id = Utilities.getUuid();
    const values = new Array(P_HEADERS.length).fill('');
    values[P.ID - 1] = id;
    values[P.USER - 1] = creator.userId;          // hinterlegte User_ID
    values[P.STATUS - 1] = creator.statusCode;    // hinterlegter Status_Code (Spalte C)
    values[P.NAME - 1] = name;
    values[P.SHOP - 1] = shopLink;
    values[P.PRICE - 1] = Math.round(price * 100) / 100;
    values[P.VIDEO - 1] = videoLink;
    values[P.TAX - 1] = creator.statusCode;       // Tax_Rate (Spalte I) – wird von der Formel in H genutzt
    values[P.CAT - 1] = category;
    values[P.CREATED - 1] = new Date();

    sheet.getRange(row, P.ID).setNumberFormat('@');
    sheet.getRange(row, 1, 1, values.length).setValues([values]);
    sheet.getRange(row, P.SALE).setFormula(CONFIG.PRICE_FORMULA.replace(/\{r\}/g, row));
    SpreadsheetApp.flush();

    const sale = sheet.getRange(row, P.SALE).getValue();
    return {
      ok: true,
      product: {
        id: id, row: row, name: name, category: category,
        originalPrice: values[P.PRICE - 1],
        price: typeof sale === 'number' ? sale : null,
        videoLink: videoLink,
      },
    };
  });
}

function updateProfile_(body) {
  const creator = auth_(body);
  const telegram = String(body.telegram || '').trim()
    .replace(/^https?:\/\/(www\.)?t(elegram)?\.me\//i, '')
    .replace(/^@+/, '');
  if (telegram && !/^[A-Za-z0-9_]{5,32}$/.test(telegram)) {
    throw new Error('Ungültiger Telegram-Username (5–32 Zeichen, nur Buchstaben, Zahlen, _).');
  }
  creatorsSheet_().getRange(creator.row, C.TELEGRAM).setValue(telegram);
  creator.telegram = telegram;
  return { ok: true, creator: publicCreator_(creator) };
}

/* ------------------------------------------------------------------ */
/* Schaufenster                                                        */
/* ------------------------------------------------------------------ */

function listProducts_() {
  const sheet = productsSheet_();
  const last = sheet.getLastRow();
  if (last < 2) return [];
  const rows = sheet.getRange(2, 1, last - 1, P_HEADERS.length).getValues();

  const telegramByUser = {};
  creatorsData_().forEach((c) => { telegramByUser[c.userId.toLowerCase()] = c.telegram; });

  const products = [];
  rows.forEach((r, i) => {
    const sale = r[P.SALE - 1];
    if (typeof sale !== 'number' || !(sale > 0)) return; // nur Zeilen mit berechnetem Preis
    const userId = String(r[P.USER - 1] || '').trim();
    const original = r[P.PRICE - 1];
    products.push({
      id: String(r[P.ID - 1] || 'row' + (i + 2)),
      userId: userId,
      name: String(r[P.NAME - 1] || '').trim(),
      originalPrice: typeof original === 'number' ? original : null,
      price: sale,
      videoLink: String(r[P.VIDEO - 1] || '').trim(),
      category: CONFIG.CATEGORIES.indexOf(r[P.CAT - 1]) >= 0 ? r[P.CAT - 1] : 'Sonstiges',
      createdAt: r[P.CREATED - 1] instanceof Date ? r[P.CREATED - 1].toISOString() : null,
      telegram: telegramByUser[userId.toLowerCase()] || '',
    });
  });

  enrichWithTikTok_(products);
  return products.reverse(); // neueste zuerst
}

/** Holt Vorschaubild + Titel der TikTok-Videos (oEmbed), gecacht. */
function enrichWithTikTok_(products) {
  const cache = CacheService.getScriptCache();
  const links = products.map((p) => p.videoLink).filter((l) => /^https?:\/\//.test(l));
  const unique = links.filter((l, i) => links.indexOf(l) === i);
  const keys = unique.map((l) => 'oe_' + hash_(l).slice(0, 40));
  const cached = keys.length ? cache.getAll(keys) : {};

  const missing = unique.filter((l, i) => cached[keys[i]] === undefined).slice(0, 25);
  if (missing.length) {
    // Kurzlinks (vm.tiktok.com) zuerst auflösen
    const resolved = missing.slice();
    const shortIdx = missing.map((l, i) => (/\/\/(vm|vt)\.tiktok\.com\//.test(l) ? i : -1)).filter((i) => i >= 0);
    if (shortIdx.length) {
      const res = UrlFetchApp.fetchAll(shortIdx.map((i) => ({ url: missing[i], followRedirects: false, muteHttpExceptions: true })));
      res.forEach((r, j) => {
        const loc = r.getHeaders()['Location'] || r.getHeaders()['location'];
        if (loc) resolved[shortIdx[j]] = String(loc).split('?')[0];
      });
    }
    const responses = UrlFetchApp.fetchAll(resolved.map((l) => ({
      url: 'https://www.tiktok.com/oembed?url=' + encodeURIComponent(l), muteHttpExceptions: true,
    })));
    const toCache = {};
    responses.forEach((r, i) => {
      let data = { t: '', title: '' };
      if (r.getResponseCode() === 200) {
        try {
          const o = JSON.parse(r.getContentText());
          data = { t: o.thumbnail_url || '', title: o.title || '' };
        } catch (_) { /* ignorieren */ }
      }
      const key = keys[unique.indexOf(missing[i])];
      toCache[key] = JSON.stringify(data);
      cached[key] = toCache[key];
    });
    cache.putAll(toCache, CONFIG.THUMB_CACHE_SECONDS);
  }

  products.forEach((p) => {
    const idx = unique.indexOf(p.videoLink);
    if (idx < 0 || !cached[keys[idx]]) return;
    try {
      const d = JSON.parse(cached[keys[idx]]);
      p.thumbnail = d.t || '';
      if (!p.name && d.title) p.videoTitle = d.title;
    } catch (_) { /* ignorieren */ }
  });
}

/* ------------------------------------------------------------------ */
/* Creator-Hilfsfunktionen                                             */
/* ------------------------------------------------------------------ */

function auth_(body) {
  const userId = normalizeUser_(body.userId);
  const creator = findCreator_(userId);
  if (!creator || !body.creatorKey || hash_(String(body.creatorKey).trim()) !== creator.keyHash) {
    throw new Error('Login fehlgeschlagen. Username oder Creator-Key ist falsch.');
  }
  return creator;
}

function findCreator_(userId) {
  const needle = userId.toLowerCase();
  return creatorsData_().filter((c) => c.userId.toLowerCase() === needle)[0] || null;
}

function creatorsData_() {
  const sheet = creatorsSheet_();
  const last = sheet.getLastRow();
  if (last < 2) return [];
  return sheet.getRange(2, 1, last - 1, C_HEADERS.length).getValues()
    .map((r, i) => ({
      row: i + 2,
      userId: String(r[C.USER - 1] || '').trim(),
      statusCode: Number(r[C.STATUS - 1]) || 0,
      telegram: String(r[C.TELEGRAM - 1] || '').trim(),
      keyHash: String(r[C.KEY_HASH - 1] || ''),
    }))
    .filter((c) => c.userId);
}

function publicCreator_(c) {
  return { userId: c.userId, statusCode: c.statusCode, telegram: c.telegram };
}

/* ------------------------------------------------------------------ */
/* Allgemeine Helfer                                                   */
/* ------------------------------------------------------------------ */

function ensureSheets_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let products = ss.getSheetByName(CONFIG.PRODUCTS_SHEET);
  if (!products) products = ss.insertSheet(CONFIG.PRODUCTS_SHEET);
  const head = products.getRange(1, 1, 1, P_HEADERS.length).getValues()[0];
  P_HEADERS.forEach((h, i) => { if (!String(head[i]).trim()) products.getRange(1, i + 1).setValue(h); });

  let creators = ss.getSheetByName(CONFIG.CREATORS_SHEET);
  if (!creators) {
    creators = ss.insertSheet(CONFIG.CREATORS_SHEET);
    creators.getRange(1, 1, 1, C_HEADERS.length).setValues([C_HEADERS]).setFontWeight('bold');
    creators.getRange('B:B').setNumberFormat('@');
    creators.setFrozenRows(1);
  }
}

function productsSheet_() {
  const s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.PRODUCTS_SHEET);
  if (!s) { ensureSheets_(); return productsSheet_(); }
  return s;
}

function creatorsSheet_() {
  const s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.CREATORS_SHEET);
  if (!s) { ensureSheets_(); return creatorsSheet_(); }
  return s;
}

function normalizeUser_(v) {
  const u = String(v || '').trim().replace(/^@+/, '');
  if (!/^[A-Za-z0-9._]{2,24}$/.test(u)) {
    throw new Error('Bitte gib einen gültigen TikTok-Username ein (2–24 Zeichen: Buchstaben, Zahlen, Punkt, Unterstrich).');
  }
  return u;
}

function parseRate_(v) {
  const n = Number(v);
  if (!isFinite(n) || n < 0 || n > 1) throw new Error('Ungültiger Steuersatz.');
  return Math.round(n * 10000) / 10000;
}

function parseUrl_(v, label) {
  const s = String(v || '').trim();
  if (!/^https?:\/\/\S+$/i.test(s) || s.length > 500) throw new Error('Bitte füge einen gültigen ' + label + ' ein.');
  return s;
}

function hash_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)
    .map((b) => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
