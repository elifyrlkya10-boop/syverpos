/*
 * SyverPOS ortak yardımcılar
 * --------------------------
 * Menü ve alerjen hesapları, biçimlendirme, pencere, bildirim ve ses.
 * Verinin nerede tutulduğu (tarayıcı ya da sunucu) store.js'nin işidir.
 */
(function () {
  const D = window.SyverData;

  /* ---------- Menü ve alerjen yardımcıları ---------- */

  const product = (id) => D.products.find((p) => p.id === id);
  const allergen = (id) => D.allergens.find((a) => a.id === id);
  const allergenNames = (ids) => ids.map((id) => (allergen(id) ? allergen(id).name : `Alerjen ${id}`));

  // Bir ürünün, seçilen alerjilere göre durumu:
  // blocked   → ana malzemede alerjen var, ürün verilemez
  // removable → çıkarılabilir malzemede alerjen var, mutfak çıkarır
  function risk(prod, allergyIds) {
    const result = { blocked: [], removable: [] };
    prod.allergens.forEach((item) => {
      if (!allergyIds.includes(item.id)) return;
      if (item.removable) result.removable.push(item.id);
      else result.blocked.push(item.id);
    });
    return result;
  }

  const tableName = (id) => `Masa ${id}`;
  const linePrice = (line) => product(line.productId).price * line.qty;
  const tableTotal = (table) => table.lines.reduce((sum, line) => sum + linePrice(line), 0);

  /* ---------- Biçimlendirme ---------- */

  const money = (value) => `${Math.round(value).toLocaleString('tr-TR')} TL`;
  const upperTR = (text) => String(text).toLocaleUpperCase('tr-TR');
  const timeHM = (iso) => (iso ? new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '');
  const minutesSince = (iso) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));

  function esc(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  const uid = (prefix) => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  /* ---------- Arayüz: pencere, bildirim, saat, ses ---------- */

  let lastFocus = null;

  // actions: [{ label, kind: 'primary' | 'danger' | '', onClick }]
  function openModal({ title, body, actions }) {
    closeModal();
    lastFocus = document.activeElement;
    const root = document.createElement('div');
    root.className = 'modal-backdrop';
    root.id = 'modal';
    root.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <h2 id="modal-title">${esc(title)}</h2>
        <div class="modal-body">${body}</div>
        <div class="modal-actions"></div>
      </div>`;
    const actionsEl = root.querySelector('.modal-actions');
    (actions || [{ label: 'Tamam', kind: 'primary' }]).forEach((action) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `btn ${action.kind ? `btn-${action.kind}` : ''}`;
      button.textContent = action.label;
      button.addEventListener('click', () => {
        if (action.onClick && action.onClick(root) === false) return;
        closeModal();
      });
      actionsEl.appendChild(button);
    });
    root.addEventListener('click', (event) => { if (event.target === root) closeModal(); });
    document.body.appendChild(root);
    const focusTarget = root.querySelector('textarea, input') || actionsEl.lastElementChild;
    if (focusTarget) focusTarget.focus();
    return root;
  }

  function closeModal() {
    const existing = document.getElementById('modal');
    if (existing) {
      existing.remove();
      if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
    }
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeModal();
  });

  let toastTimer = null;
  function toast(message) {
    let el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      el.className = 'toast';
      el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
  }

  function startClock(el) {
    const tick = () => { el.textContent = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }); };
    tick();
    setInterval(tick, 5000);
  }

  // Tarayıcılar sesi ancak kullanıcı bir kere tıkladıktan sonra çalar.
  // Bu yüzden ses, "Sesli uyarı" düğmesiyle açılır.
  let audio = null;
  function setupSoundToggle(button) {
    const paint = () => {
      const on = Boolean(audio);
      button.setAttribute('aria-pressed', String(on));
      button.textContent = on ? 'Sesli uyarı açık' : 'Sesli uyarıyı aç';
    };
    button.addEventListener('click', () => {
      if (audio) {
        audio.close();
        audio = null;
      } else {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (Ctx) {
          audio = new Ctx();
          beep(2);
        }
      }
      paint();
    });
    paint();
  }

  function beep(times = 1) {
    if (!audio) return;
    for (let i = 0; i < times; i++) {
      const start = audio.currentTime + i * 0.22;
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
      osc.connect(gain).connect(audio.destination);
      osc.start(start);
      osc.stop(start + 0.2);
    }
  }

  /* ---------- Küçük simgeler (SVG) ---------- */

  const svg = (path) => `<svg class="icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
  const icons = {
    back: svg('<path d="M15 18l-6-6 6-6"/>'),
    close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
    plus: svg('<path d="M12 5v14M5 12h14"/>'),
    check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
    bell: svg('<path d="M6 16V11a6 6 0 0112 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 004 0"/>'),
    print: svg('<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>')
  };

  window.Syver = {
    data: D,
    icons,
    product, allergen, allergenNames, risk, tableName, linePrice, tableTotal,
    money, upperTR, timeHM, minutesSince, esc, uid,
    openModal, closeModal, toast, startClock, setupSoundToggle, beep
  };
})();
