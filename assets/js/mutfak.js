/*
 * SyverPOS mutfak ekranı
 * ----------------------
 * Garsonun her "Mutfağa gönder"i burada bir fiş olur. Fişler eskiden yeniye sıralanır.
 * Alerjenli fişte "hazır" düğmesi, aşçı kontrol kutusunu işaretlemeden açılmaz.
 */
(function () {
  const S = window.Syver;
  const store = S.store;
  const { esc } = S;

  let state = null;
  const checked = {};          // fiş anahtarı (no + gönderim zamanı) → alerjen kontrol kutusu işaretli mi
  let knownTicketIds = null;   // ilk çizimde ses çalmamak için null
  const freshIds = new Set();  // yeni gelen fişler kısa bir vurgu alır

  const $ = (id) => document.getElementById(id);
  const el = {
    queue: $('queue'),
    done: $('done'),
    nWaiting: $('n-waiting'),
    nAllergy: $('n-allergy')
  };

  // Aynı numara başka bir fiş için yeniden verilse bile (demo sıfırlama) onay taşınmasın
  const ckey = (ticket) => `${ticket.id}@${ticket.sentAt}`;
  const hasAllergy = (ticket) => ticket.items.some((i) => i.allergies.length);
  const ageText = (min) => (min < 1 ? 'Şimdi' : `${min} dk`);

  /* ---------- Çizim ---------- */

  function render() {
    if (!state) return;
    const waiting = state.tickets
      .filter((t) => t.status === 'waiting')
      .sort((a, b) => a.sentAt.localeCompare(b.sentAt));

    // Bekleme listesinden çıkan fişlerin onayı unutulur (hazır yapıldı, geri alındı, masa kapandı)
    const live = new Set(waiting.map(ckey));
    Object.keys(checked).forEach((key) => { if (!live.has(key)) delete checked[key]; });
    const done = state.tickets
      .filter((t) => t.status === 'ready')
      .sort((a, b) => b.readyAt.localeCompare(a.readyAt))
      .slice(0, 10);

    // Yeni fiş geldiyse ses ve kısa vurgu
    if (knownTicketIds) {
      const arrived = waiting.filter((t) => !knownTicketIds.has(t.id));
      if (arrived.length) {
        S.beep(arrived.some(hasAllergy) ? 3 : 1);
        arrived.forEach((t) => freshIds.add(t.id));
      }
    }
    knownTicketIds = new Set(state.tickets.map((t) => t.id));

    el.nWaiting.textContent = waiting.length;
    el.nAllergy.textContent = waiting.filter(hasAllergy).length;
    document.title = waiting.length ? `(${waiting.length}) SyverPOS Mutfak` : 'SyverPOS Mutfak';

    el.queue.innerHTML = waiting.length
      ? waiting.map(ticketHtml).join('')
      : '<div class="kempty"><strong>Bekleyen sipariş yok</strong>Garson ekranından gönderilen siparişler burada görünür.</div>';

    el.done.innerHTML = done.length
      ? done.map((t) => `
          <li>
            <div>
              <strong>${S.tableName(t.tableId)} <span class="muted">#${t.id}</span></strong>
              <span class="muted">${S.timeHM(t.readyAt)} hazır</span>
            </div>
            <button type="button" data-undo="${t.id}">Geri al</button>
          </li>`).join('')
      : '<li class="done-empty">Henüz hazır sipariş yok.</li>';

    freshIds.clear();
  }

  function ticketHtml(ticket) {
    const allergy = hasAllergy(ticket);
    const age = S.minutesSince(ticket.sentAt);
    const canFinish = !allergy || checked[ckey(ticket)];
    return `
      <article class="ticket ${allergy ? 'has-allergy' : ''} ${freshIds.has(ticket.id) ? 'is-new' : ''}">
        <header class="ticket-head">
          <span class="t-table">${S.tableName(ticket.tableId)}</span>
          <span class="t-no">#${ticket.id}</span>
          <span class="t-time">${S.timeHM(ticket.sentAt)}</span>
          <span class="t-age ${age >= 10 ? 'is-late' : ''}" data-age="${ticket.sentAt}">${ageText(age)}</span>
        </header>
        <ul class="t-items">${ticket.items.map(itemHtml).join('')}</ul>
        <footer class="ticket-foot">
          ${allergy ? `
            <label class="t-check">
              <input type="checkbox" data-check="${ticket.id}" ${checked[ckey(ticket)] ? 'checked' : ''}>
              <span>Tüm alerjenleri kontrol ettim, ayrı ekipman kullandım</span>
            </label>` : ''}
          <button type="button" class="t-ready" data-ready="${ticket.id}" ${canFinish ? '' : 'disabled'}>
            ${allergy ? 'Alerjen kontrol edildi, sipariş hazır' : 'Sipariş hazır'}
          </button>
        </footer>
      </article>`;
  }

  function itemHtml(item) {
    // Her alerjen ayrı satırda: "KİŞİ 1: SOYA ALERJİSİ VAR"
    const alert = item.allergies.length ? `
      <div class="t-alert">
        ${item.allergies.map((a) => `<p>${esc(S.upperTR(`${item.guest}: ${a} alerjisi var`))}</p>`).join('')}
        <p class="t-sub">${item.remove.length
          ? `Çıkar: ${esc(item.remove.join(', '))}. Temiz ekipman kullan.`
          : 'Üründe bu alerjen yok, çapraz bulaşmaya dikkat. Temiz ekipman kullan.'}</p>
      </div>` : '';
    return `
      <li class="t-item">
        <div class="t-line"><span class="t-qty">${item.qty}×</span><span class="t-name">${esc(item.name)}</span></div>
        <div class="t-guest">${esc(item.guest)}</div>
        ${alert}
        ${item.note ? `<div class="t-note">Not: ${esc(item.note)}</div>` : ''}
      </li>`;
  }

  function refreshAges() {
    document.querySelectorAll('[data-age]').forEach((node) => {
      const min = S.minutesSince(node.dataset.age);
      node.textContent = ageText(min);
      node.classList.toggle('is-late', min >= 10);
    });
  }

  /* ---------- İşlemler ---------- */

  async function run(name, data) {
    const res = await store.act(name, data);
    if (!res.ok) {
      S.openModal({ title: 'İşlem yapılamadı', body: `<p>${esc(res.error)}</p>` });
      return null;
    }
    return res.result;
  }

  async function markReady(ticketId) {
    const ticket = state.tickets.find((t) => t.id === ticketId);
    if (!ticket || (hasAllergy(ticket) && !checked[ckey(ticket)])) return;
    // Sunucu da alerjen onayı olmadan alerjenli fişi hazır yapmaz
    try {
      await run('hazir', { fis: ticketId, kontrol: checked[ckey(ticket)] === true });
    } finally {
      delete checked[ckey(ticket)];
      render(); // hata olsa da düğme kilitli kalmasın, onay yeniden alınsın
    }
  }

  function undoReady(ticketId) {
    knownTicketIds.add(ticketId); // geri alınan fiş için yeniden ses çalma
    run('hazir_geri_al', { fis: ticketId });
  }

  /* ---------- Olaylar ---------- */

  document.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button || button.closest('#modal') || !state) return;
    if (button.dataset.ready) {
      button.disabled = true; // çift dokunuşta iki kez gönderilmesin
      markReady(Number(button.dataset.ready));
    }
    else if (button.dataset.undo) undoReady(Number(button.dataset.undo));
  });

  document.addEventListener('change', (event) => {
    const box = event.target.closest('[data-check]');
    if (!box) return;
    const ticket = state.tickets.find((t) => t.id === Number(box.dataset.check) && t.status === 'waiting');
    if (!ticket) return;
    checked[ckey(ticket)] = box.checked;
    const ready = box.closest('.ticket').querySelector('[data-ready]');
    ready.disabled = !box.checked;
  });

  store.onChange((next) => { state = next; render(); });
  S.startClock($('clock'));
  S.setupSoundToggle($('sound'));
  store.bindStatusPill($('mode'));
  setInterval(refreshAges, 20000);
  store.init().then((initial) => {
    state = initial;
    render();
  });
})();
