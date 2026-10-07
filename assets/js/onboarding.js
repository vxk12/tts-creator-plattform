/* Stufe 1: Intelligentes Onboarding-Formular (einmalig). */
(function () {
  const { register, session, telegramBotLink } = window.TTS;

  const form = document.getElementById('wizard');
  const errorBox = document.getElementById('error');
  const bars = document.querySelectorAll('#progress span');
  const userInput = document.getElementById('userId');
  const rateInput = document.getElementById('rate');
  const rateYes = document.getElementById('rateYes');
  const rateNo = document.getElementById('rateNo');
  const submitBtn = document.getElementById('submit');

  const data = { isShopCreator: null, userId: '', knowsRate: null, statusCode: null };

  const USER_RE = /^[A-Za-z0-9._]{2,24}$/;

  function show(step) {
    form.querySelectorAll('[data-step]').forEach((s) => { s.hidden = s.dataset.step !== String(step); });
    const n = { 1: 1, 2: 2, 3: 3, success: 3, denied: 1 }[step] || 1;
    bars.forEach((b, i) => b.classList.toggle('on', i < n));
    document.getElementById('progress').hidden = step === 'success' || step === 'denied';
    hideError();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function showError(msg) { errorBox.textContent = msg; errorBox.hidden = false; }
  function hideError() { errorBox.hidden = true; }

  function press(group, btn) {
    form.querySelectorAll(group).forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
  }

  // Feld 1: JA / NEIN
  form.querySelectorAll('[data-creator]').forEach((btn) => btn.addEventListener('click', () => {
    press('[data-creator]', btn);
    data.isShopCreator = btn.dataset.creator === 'yes';
    if (data.isShopCreator) {
      show(2);
      setTimeout(() => userInput.focus(), 250);
    } else {
      show('denied'); // Nutzung wird sofort verweigert
    }
  }));

  // Zurück-Buttons
  form.querySelectorAll('[data-back]').forEach((btn) =>
    btn.addEventListener('click', () => show(btn.dataset.back)));

  // Feld 2: Username
  function validateUser() {
    const v = userInput.value.trim().replace(/^@+/, '');
    userInput.value = v;
    const ok = USER_RE.test(v);
    userInput.setAttribute('aria-invalid', String(!ok));
    if (!ok) showError('Bitte gib einen gültigen TikTok-Username ein (2–24 Zeichen: Buchstaben, Zahlen, Punkt, Unterstrich).');
    else { hideError(); data.userId = v; }
    return ok;
  }
  document.getElementById('toStep3').addEventListener('click', () => { if (validateUser()) show(3); });
  userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); if (validateUser()) show(3); }
  });

  // Feld 3: Grenzsteuersatz bekannt?
  form.querySelectorAll('[data-knows]').forEach((btn) => btn.addEventListener('click', () => {
    press('[data-knows]', btn);
    data.knowsRate = btn.dataset.knows === 'yes';
    data.statusCode = null;
    press('[data-income]', null);
    rateYes.hidden = !data.knowsRate;
    rateNo.hidden = data.knowsRate;
    hideError();
    if (data.knowsRate) setTimeout(() => rateInput.focus(), 50);
  }));

  // WENN NEIN: Einkommensabfrage → 0.00 / 0.30 / 0.42
  form.querySelectorAll('[data-income]').forEach((btn) => btn.addEventListener('click', () => {
    press('[data-income]', btn);
    data.statusCode = Number(btn.dataset.income);
    hideError();
  }));

  function resolveStatusCode() {
    if (data.knowsRate === null) return showError('Bitte wähle JA oder NEIN.'), null;
    if (data.knowsRate) {
      // WENN JA: Eingabe in %, gespeichert als Dezimalzahl (35 → 0.35)
      const pct = Number(String(rateInput.value).replace(',', '.'));
      const ok = rateInput.value !== '' && isFinite(pct) && pct >= 0 && pct <= 100;
      rateInput.setAttribute('aria-invalid', String(!ok));
      if (!ok) return showError('Bitte gib deinen Grenzsteuersatz in Prozent ein (0–100).'), null;
      return Math.round(pct * 100) / 10000;
    }
    if (data.statusCode === null) return showError('Bitte wähle dein geschätztes Gesamteinkommen.'), null;
    return data.statusCode;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validateUser()) return show(2);
    const statusCode = resolveStatusCode();
    if (statusCode === null) return;

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner"></span>Wird gespeichert …';
    try {
      const res = await register({ isShopCreator: data.isShopCreator === true, userId: data.userId, statusCode });
      session.set({ userId: res.creator.userId, creatorKey: res.creatorKey });

      document.getElementById('okUser').textContent = '@' + res.creator.userId;
      document.getElementById('sumUser').textContent = '@' + res.creator.userId;
      document.getElementById('sumRate').textContent =
        (res.creator.statusCode * 100).toLocaleString('de-DE', { maximumFractionDigits: 2 }) + ' %';
      document.getElementById('creatorKey').textContent = res.creatorKey;
      document.getElementById('telegramBtn').href = telegramBotLink(res.creator.userId);
      show('success');
    } catch (err) {
      showError(err.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Registrierung absenden';
    }
  });

  document.getElementById('copyKey').addEventListener('click', async (e) => {
    const key = document.getElementById('creatorKey').textContent;
    try {
      await navigator.clipboard.writeText(key);
      e.target.textContent = 'Kopiert ✓';
    } catch (_) {
      const r = document.createRange();
      r.selectNodeContents(document.getElementById('creatorKey'));
      const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    }
  });

  show(1);
})();
