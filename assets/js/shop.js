/* B2C-Schaufenster: lädt Produkte live aus dem Google Sheet und rendert das filterbare Grid. */
(function () {
  const { getProducts, fmtEUR, esc, safeUrl, buyLink, CATEGORIES } = window.TTS;

  const grid = document.getElementById('grid');
  const chips = document.getElementById('chips');
  const count = document.getElementById('count');
  const empty = document.getElementById('empty');
  const search = document.getElementById('search');
  const sortSel = document.getElementById('sort');
  document.getElementById('year').textContent = new Date().getFullYear();

  const state = { all: [], cat: 'Alle', q: '', sort: 'new' };

  const ICONS = {
    Tech: '<path d="M4 6h16v10H4zM8 20h8M12 16v4"/>',
    Beauty: '<path d="M9 3h6v4H9zM8 7h8l1 14H7z"/>',
    Haushalt: '<path d="M3 11l9-7 9 7M5 10v10h14V10"/>',
    Sonstiges: '<path d="M3 8l9-5 9 5-9 5zM3 8v8l9 5 9-5V8M12 13v8"/>',
  };
  const icon = (cat) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round">${ICONS[cat] || ICONS.Sonstiges}</svg>`;

  const PLAY = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
  const SEND = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21.9 4.3L18.7 19.4c-.2 1-.9 1.3-1.7.8l-4.8-3.5-2.3 2.2c-.3.3-.5.5-1 .5l.3-4.9 8.9-8c.4-.3-.1-.5-.6-.2L6.5 13.2l-4.7-1.5c-1-.3-1-1 .2-1.5L20.5 3c.9-.3 1.6.2 1.4 1.3z"/></svg>';
  const CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12l5 5L20 7"/></svg>';

  const discount = (p) =>
    p.originalPrice > 0 && p.price < p.originalPrice ? Math.round((1 - p.price / p.originalPrice) * 100) : 0;

  const displayName = (p) => {
    if (p.name) return p.name;
    if (p.videoTitle) {
      const t = p.videoTitle.replace(/#\S+/g, '').replace(/\s+/g, ' ').trim();
      if (t) return t.length > 70 ? t.slice(0, 67) + '…' : t;
    }
    return 'TikTok Shop Produkt';
  };

  function cardHTML(p) {
    const off = discount(p);
    const video = safeUrl(p.videoLink);
    const thumb = safeUrl(p.thumbnail);
    const name = displayName(p);
    return `
      <article class="card">
        <div class="card__media">
          <div class="placeholder">${icon(p.category)}</div>
          ${thumb ? `<img src="${esc(thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}
          <span class="badge badge--cat">${esc(p.category)}</span>
          ${off ? `<span class="badge badge--off">−${off} %</span>` : ''}
        </div>
        <div class="card__body">
          <h3 class="card__title">${esc(name)}</h3>
          <div class="price">
            <span class="price__now">${fmtEUR(p.price)}</span>
            ${p.originalPrice ? `<s class="price__was" aria-label="Originalpreis">${fmtEUR(p.originalPrice)}</s>` : ''}
            ${off ? `<span class="price__save">Du sparst ${fmtEUR(p.originalPrice - p.price)}</span>` : ''}
          </div>
          <p class="cond">${CHECK}<span>Zustand: Wie neu – nur 1x für Video ausgepackt</span></p>
          ${p.userId ? `<p class="seller">Verkauft von <b>@${esc(p.userId)}</b></p>` : ''}
          <div class="card__actions">
            ${video
              ? `<a class="btn btn--video" href="${esc(video)}" target="_blank" rel="noopener noreferrer">${PLAY}Video-Nachweis ansehen</a>`
              : `<button class="btn btn--video" disabled>${PLAY}Video folgt</button>`}
            <a class="btn btn--accent" href="${esc(buyLink(p))}" target="_blank" rel="noopener noreferrer">${SEND}Jetzt kaufen</a>
          </div>
        </div>
      </article>`;
  }

  function skeletons(n) {
    grid.innerHTML = Array.from({ length: n }, () => `
      <div class="card skeleton" aria-hidden="true">
        <div class="card__media"></div>
        <div class="card__body">
          <div class="sk" style="width:80%"></div>
          <div class="sk" style="width:45%;height:26px"></div>
          <div class="sk" style="width:70%"></div>
          <div class="sk" style="height:44px;border-radius:12px;margin-top:8px"></div>
          <div class="sk" style="height:44px;border-radius:12px"></div>
        </div>
      </div>`).join('');
  }

  function renderChips() {
    const counts = state.all.reduce((m, p) => ((m[p.category] = (m[p.category] || 0) + 1), m), {});
    chips.innerHTML = ['Alle', ...CATEGORIES]
      .map((c) => `<button class="chip" type="button" data-cat="${c}" aria-pressed="${c === state.cat}">${c}${
        c === 'Alle' ? '' : counts[c] ? ` · ${counts[c]}` : ''}</button>`)
      .join('');
  }

  function render() {
    const q = state.q.toLowerCase();
    let list = state.all.filter((p) =>
      (state.cat === 'Alle' || p.category === state.cat) &&
      (!q || `${displayName(p)} ${p.userId} ${p.category}`.toLowerCase().includes(q)));

    const sorters = {
      'price-asc': (a, b) => a.price - b.price,
      'price-desc': (a, b) => b.price - a.price,
      discount: (a, b) => discount(b) - discount(a),
    };
    if (sorters[state.sort]) list = list.slice().sort(sorters[state.sort]);

    grid.innerHTML = list.map(cardHTML).join('');
    empty.hidden = list.length > 0;
    count.textContent = `${list.length} ${list.length === 1 ? 'Angebot' : 'Angebote'}`;
  }

  chips.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-cat]');
    if (!btn) return;
    state.cat = btn.dataset.cat;
    renderChips();
    render();
  });
  search.addEventListener('input', () => { state.q = search.value.trim(); render(); });
  sortSel.addEventListener('change', () => { state.sort = sortSel.value; render(); });

  async function load() {
    skeletons(6);
    renderChips();
    try {
      state.all = await getProducts();
      renderChips();
      render();
    } catch (err) {
      grid.innerHTML = '';
      count.textContent = '';
      empty.hidden = false;
      empty.innerHTML = `<h3>Produkte konnten nicht geladen werden</h3><p>${esc(err.message)}</p>
        <button class="btn btn--sm" type="button" id="retry" style="margin-top:12px">Erneut versuchen</button>`;
      document.getElementById('retry').onclick = () => {
        empty.hidden = true;
        empty.innerHTML = '<h3>Keine Produkte gefunden</h3><p>Probier eine andere Kategorie oder einen anderen Suchbegriff.</p>';
        load();
      };
    }
  }
  load();
})();
