/* Stufe 2: Creator-Dashboard mit optionaler Web-Eingabemaske. */
(function () {
  const { login, addProduct, updateProfile, getProducts, session, fmtEUR, esc, telegramBotLink } = window.TTS;

  const $ = (id) => document.getElementById(id);
  const loginView = $('loginView');
  const dashView = $('dashView');
  const logoutBtn = $('logout');

  let creds = null;
  let creator = null;

  const pct = (rate) => (rate * 100).toLocaleString('de-DE', { maximumFractionDigits: 2 }) + ' %';

  function setBusy(btn, busy, label) {
    btn.disabled = busy;
    btn.innerHTML = busy ? '<span class="spinner"></span>Bitte warten …' : label;
  }

  function showLogin(msg) {
    dashView.hidden = true;
    logoutBtn.hidden = true;
    loginView.hidden = false;
    const s = session.get();
    if (s && s.userId) $('loginUser').value = s.userId;
    if (msg) { $('loginError').textContent = msg; $('loginError').hidden = false; }
  }

  function showDashboard() {
    loginView.hidden = true;
    dashView.hidden = false;
    logoutBtn.hidden = false;
    $('hello').textContent = 'Hi @' + creator.userId;
    $('statRate').textContent = pct(creator.statusCode);
    $('noteUser').textContent = '@' + creator.userId;
    $('noteRate').textContent = '(' + creator.statusCode + ')';
    $('tgUser').value = creator.telegram || '';
    $('botLink').href = telegramBotLink(creator.userId);
    renderTelegram();
    loadMine();
  }

  function renderTelegram() {
    $('statTg').innerHTML = creator.telegram
      ? `<span style="color:var(--accent)">●</span> @${esc(creator.telegram)}`
      : '<span class="muted">Noch kein Telegram-Username hinterlegt</span>';
  }

  async function loadMine() {
    const list = $('myList');
    try {
      const mine = (await getProducts()).filter((p) => p.userId.toLowerCase() === creator.userId.toLowerCase());
      $('statCount').textContent = mine.length;
      list.innerHTML = mine.length
        ? mine.map((p) => `<li><span class="n">${esc(p.name || p.videoTitle || 'TikTok Shop Produkt')}</span><span class="p">${fmtEUR(p.price)}</span></li>`).join('')
        : '<li class="muted">Noch keine Inserate. Leg oben dein erstes Produkt an.</li>';
    } catch (err) {
      list.innerHTML = `<li class="muted">${esc(err.message)}</li>`;
    }
  }

  async function doLogin(c) {
    const res = await login(c);
    creds = { userId: res.creator.userId, creatorKey: c.creatorKey };
    creator = res.creator;
    session.set(creds);
    showDashboard();
  }

  // Login
  loginView.addEventListener('submit', async (e) => {
    e.preventDefault();
    $('loginError').hidden = true;
    const userId = $('loginUser').value.trim().replace(/^@+/, '');
    const creatorKey = $('loginKey').value.trim();
    if (!userId || !creatorKey) {
      $('loginError').textContent = 'Bitte Username und Creator-Key eingeben.';
      $('loginError').hidden = false;
      return;
    }
    setBusy($('loginBtn'), true);
    try { await doLogin({ userId, creatorKey }); }
    catch (err) { $('loginError').textContent = err.message; $('loginError').hidden = false; }
    finally { setBusy($('loginBtn'), false, 'Einloggen'); }
  });

  logoutBtn.addEventListener('click', () => {
    session.clear();
    creds = creator = null;
    $('loginKey').value = '';
    showLogin();
  });

  // Web-Eingabemaske → neue Zeile im Google Sheet
  $('productForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('productError');
    err.hidden = true;
    const fields = { shopLink: $('shopLink'), price: $('price'), videoLink: $('videoLink') };
    Object.values(fields).forEach((f) => f.setAttribute('aria-invalid', 'false'));

    const urlOk = (v) => /^https?:\/\/\S+$/i.test(v);
    const shopLink = fields.shopLink.value.trim();
    const priceRaw = fields.price.value.trim().replace(/\s|€/g, '').replace(',', '.');
    const videoLink = fields.videoLink.value.trim();
    const problems = [];
    if (!urlOk(shopLink)) { problems.push('TikTok Shop Produkt-Link'); fields.shopLink.setAttribute('aria-invalid', 'true'); }
    if (!(Number(priceRaw) > 0)) { problems.push('Einkaufspreis (reine Zahl)'); fields.price.setAttribute('aria-invalid', 'true'); }
    if (!urlOk(videoLink)) { problems.push('TikTok-Video-Link'); fields.videoLink.setAttribute('aria-invalid', 'true'); }
    if (problems.length) {
      err.textContent = 'Bitte prüfe: ' + problems.join(', ') + '.';
      err.hidden = false;
      return;
    }

    setBusy($('productBtn'), true);
    try {
      const res = await addProduct(creds, {
        shopLink, price: Number(priceRaw), videoLink,
        name: $('pName').value.trim(), category: $('pCat').value,
      });
      const p = res.product;
      $('result').innerHTML = `<p>Inseriert! Dein Schnäppchenpreis im Schaufenster:</p>
        <span class="price__now">${fmtEUR(p.price)}</span>
        <p class="small">Einkaufspreis ${fmtEUR(p.originalPrice)} · <a class="link" href="./" target="_blank">Im Schaufenster ansehen</a></p>`;
      $('result').hidden = false;
      e.target.reset();
      loadMine();
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
    } finally {
      setBusy($('productBtn'), false, 'Produkt inserieren');
    }
  });

  // Telegram-Username speichern
  $('profileForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('profileMsg');
    setBusy($('profileBtn'), true);
    try {
      const res = await updateProfile(creds, $('tgUser').value);
      creator = res.creator;
      $('tgUser').value = creator.telegram;
      renderTelegram();
      msg.className = 'alert alert--ok';
      msg.textContent = 'Gespeichert.';
    } catch (ex) {
      msg.className = 'alert alert--error';
      msg.textContent = ex.message;
    } finally {
      msg.hidden = false;
      setBusy($('profileBtn'), false, 'Speichern');
    }
  });

  // Automatischer Login mit gespeicherter Session
  const saved = session.get();
  if (saved && saved.userId && saved.creatorKey) {
    doLogin(saved).catch((err) => { session.clear(); showLogin(err.message); });
  } else {
    showLogin();
  }
})();
