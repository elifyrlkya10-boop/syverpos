/*
 * SyverPOS garson (adisyon) ekranı
 * --------------------------------
 * Akış: masa seç → kişi seç → alerjisini işaretle → ürün ekle → mutfağa gönder.
 * Alerji kontrolü canlıdır: ürün eklendikten sonra alerji işaretlense bile
 * sistem satırı yakalar ve mutfağa gönderilmesine izin vermez.
 *
 * Bu dosya sadece ekranı çizer ve kullanıcıyı uyarır. Veriyi değiştiren her şey
 * store.js üzerinden adı olan bir işlemle yapılır (ör. "urun_ekle").
 */
(function () {
  const S = window.Syver;
  const D = S.data;
  const store = S.store;
  const { esc, money } = S;

  let state = null;
  let currentTableId = null;   // null → masa planı görünür
  const activeGuestByTable = {};
  let activeCategory = 'Tümü';
  let safeOnly = false;
  let knownNoticeIds = new Set();

  const $ = (id) => document.getElementById(id);
  const el = {
    tablesView: $('view-tables'),
    orderView: $('view-table'),
    tableGrid: $('table-grid'),
    notices: $('notices'),
    title: $('table-title'),
    guests: $('guests'),
    allergyLabel: $('allergy-label'),
    allergyChips: $('allergy-chips'),
    search: $('search'),
    safeOnlyWrap: $('safe-only-wrap'),
    safeOnly: $('safe-only'),
    cats: $('cats'),
    dishes: $('dishes'),
    checkTitle: $('check-title'),
    checkBody: $('check-body'),
    total: $('total'),
    send: $('send'),
    print: $('print'),
    closeTable: $('close-table'),
    mbCount: $('mb-count'),
    mbTotal: $('mb-total'),
    mbSend: $('mb-send'),
    printArea: $('print-area')
  };

  /* ---------- Yardımcılar ---------- */

  // İşlemi çalıştırır; kural hatası olursa kullanıcıya gösterir.
  async function run(name, data) {
    const res = await store.act(name, data);
    if (!res.ok) {
      S.openModal({ title: 'İşlem yapılamadı', body: `<p>${esc(res.error)}</p>` });
      return null;
    }
    return res.result;
  }

  const currentTable = () => state.tables[currentTableId];

  function activeGuest(table) {
    const wanted = activeGuestByTable[table.id];
    const guest = table.guests.find((g) => g.id === wanted) || table.guests[0];
    activeGuestByTable[table.id] = guest.id;
    return guest;
  }

  // Bir satırın alerji durumunu, kişinin GÜNCEL alerjilerine göre hesaplar.
  function lineInfo(table, line) {
    const guest = table.guests.find((g) => g.id === line.guestId);
    const product = S.product(line.productId);
    const allergies = guest ? guest.allergies : [];
    return { guest, product, allergies, risk: S.risk(product, allergies) };
  }

  const namesOf = (ids) => S.allergenNames(ids).join(', ');

  /* ---------- Sayfa yönlendirme (#masa-3) ---------- */

  function tableFromHash() {
    const match = location.hash.match(/^#masa-(\d+)$/);
    const id = match ? Number(match[1]) : null;
    return id && state.tables[id] ? id : null;
  }

  function onRouteChange() {
    currentTableId = tableFromHash();
    document.body.classList.remove('check-open');
    render();
    window.scrollTo(0, 0);
    // Masaya girince o masanın "hazır" bildirimleri görülmüş sayılır
    if (currentTableId && state.notices.some((n) => n.tableId === currentTableId && !n.seen)) {
      run('masa_bildirimleri_goruldu', { masa: currentTableId });
    }
  }

  const openTable = (id) => {
    if (id === currentTableId) onRouteChange(); // zaten bu masadaysak bildirimi kapat
    else location.hash = `masa-${id}`;
  };
  const openFloor = () => { history.pushState(null, '', location.pathname + location.search); onRouteChange(); };

  /* ---------- Çizim ---------- */

  function render() {
    if (!state) return;
    if (currentTableId && !state.tables[currentTableId]) currentTableId = null;
    renderNotices();
    const inTable = Boolean(currentTableId);
    el.tablesView.hidden = inTable;
    el.orderView.hidden = !inTable;
    document.title = inTable ? `${S.tableName(currentTableId)} – SyverPOS Garson` : 'SyverPOS Garson';
    if (inTable) renderOrder();
    else renderTables();
  }

  let lastNoticesHtml = '';
  function renderNotices() {
    const unseen = state.notices.filter((n) => !n.seen);
    const html = unseen.map((n) => `
      <div class="notice">
        <span class="notice-icon">${S.icons.bell}</span>
        <p><strong>${S.tableName(n.tableId)} siparişi hazır</strong> <span class="notice-time">${S.timeHM(n.at)}</span></p>
        <div class="notice-actions">
          <button type="button" class="btn btn-ok" data-go-table="${n.tableId}">Masaya git</button>
          <button type="button" class="btn" data-dismiss="${esc(n.id)}">Tamam</button>
        </div>
      </div>`).join('');
    // Sadece değiştiyse yeniden çiz; yoksa giriş animasyonu her tıklamada tekrar oynar
    if (html !== lastNoticesHtml) {
      el.notices.innerHTML = html;
      lastNoticesHtml = html;
    }
  }

  function tableStatus(table) {
    const waiting = state.tickets.some((t) => t.tableId === table.id && t.status === 'waiting');
    if (waiting) return { key: 'kitchen', label: 'Mutfakta' };
    if (state.notices.some((n) => n.tableId === table.id && !n.seen)) return { key: 'ready', label: 'Hazır' };
    if (table.lines.length) return { key: 'open', label: 'Açık' };
    return { key: 'empty', label: 'Boş' };
  }

  function renderTables() {
    el.tableGrid.innerHTML = Object.values(state.tables).map((table) => {
      const status = tableStatus(table);
      const itemCount = table.lines.reduce((sum, l) => sum + l.qty, 0);
      const hasAllergy = table.guests.some((g) => g.allergies.length);
      const label = `${S.tableName(table.id)}, ${status.label}${itemCount ? `, ${itemCount} ürün` : ''}${hasAllergy ? ', alerjili misafir var' : ''}`;
      return `
        <button type="button" class="ttile is-${status.key}" data-open-table="${table.id}" aria-label="${esc(label)}">
          <span class="ttile-num">${table.id}</span>
          ${hasAllergy ? '<span class="ttile-flag">Alerji</span>' : ''}
          <span class="ttile-status">${status.label}</span>
          <span class="ttile-meta">${itemCount ? `<span>${itemCount} ürün</span><span>${money(S.tableTotal(table))}</span>` : '<span>&nbsp;</span>'}</span>
        </button>`;
    }).join('');
  }

  function renderOrder() {
    const table = currentTable();
    const guest = activeGuest(table);
    el.title.textContent = S.tableName(table.id);
    el.checkTitle.textContent = `Adisyon, ${S.tableName(table.id)}`;

    // Kişiler
    el.guests.innerHTML = table.guests.map((g) => `
      <div class="guest ${g.id === guest.id ? 'is-active' : ''} ${g.allergies.length ? 'has-allergy' : ''}">
        <button type="button" class="guest-select" data-guest="${esc(g.id)}" aria-pressed="${g.id === guest.id}">
          ${esc(g.name)}
          ${g.allergies.length ? `<span class="guest-badge" title="${esc(namesOf(g.allergies))}">${g.allergies.length} alerji</span>` : ''}
        </button>
        ${table.guests.length > 1 ? `<button type="button" class="guest-remove" data-remove-guest="${esc(g.id)}" aria-label="${esc(g.name)} kişisini sil">${S.icons.close}</button>` : ''}
      </div>`).join('') +
      `<button type="button" class="guest-add" data-add-guest>${S.icons.plus}Kişi ekle</button>`;

    // Alerjenler
    el.allergyLabel.textContent = `${guest.name} için alerjiler`;
    el.allergyChips.innerHTML = D.allergens.map((a) => {
      const on = guest.allergies.includes(a.id);
      return `<button type="button" class="chip" data-allergen="${a.id}" aria-pressed="${on}">${on ? S.icons.check : ''}${esc(a.name)}</button>`;
    }).join('');

    // Kategoriler
    el.cats.innerHTML = ['Tümü', ...D.categories].map((c) =>
      `<button type="button" class="cat" data-cat="${esc(c)}" aria-pressed="${c === activeCategory}">${esc(c)}</button>`
    ).join('');

    el.safeOnlyWrap.hidden = !guest.allergies.length;
    el.safeOnly.checked = safeOnly;

    renderDishes(guest);
    renderCheck(table);
  }

  function renderDishes(guest) {
    const query = el.search.value.trim().toLocaleLowerCase('tr-TR');
    const useSafeFilter = safeOnly && guest.allergies.length;
    const list = D.products.filter((p) => {
      if (activeCategory !== 'Tümü' && p.category !== activeCategory) return false;
      if (query && !p.name.toLocaleLowerCase('tr-TR').includes(query)) return false;
      if (useSafeFilter && S.risk(p, guest.allergies).blocked.length) return false;
      return true;
    });

    if (!list.length) {
      el.dishes.innerHTML = `<p class="empty-note">Bu aramaya uyan ürün yok.${useSafeFilter ? ' "Sadece uygun ürünler" filtresi açık.' : ''}</p>`;
      return;
    }

    el.dishes.innerHTML = list.map((p) => {
      const risk = S.risk(p, guest.allergies);
      let kind = '';
      let verdict = '';
      if (risk.blocked.length) {
        kind = 'is-blocked';
        verdict = `${esc(guest.name)} için uygun değil: ${esc(namesOf(risk.blocked))} ana malzemede`;
      } else if (risk.removable.length) {
        kind = 'is-caution';
        verdict = `${esc(namesOf(risk.removable))} çıkarılarak hazırlanır`;
      } else if (guest.allergies.length) {
        kind = 'is-safe';
        verdict = `${esc(guest.name)} için uygun`;
      }
      const tags = p.allergens.map((a) => {
        const hit = guest.allergies.includes(a.id);
        return `<span class="tag ${a.removable ? 'is-removable' : ''} ${hit ? 'is-hit' : ''}">${esc(S.allergen(a.id).name)}</span>`;
      }).join('');
      return `
        <button type="button" class="dish ${kind}" data-dish="${p.id}">
          <span class="dish-name">${esc(p.name)}</span>
          <span class="dish-price">${money(p.price)}</span>
          <span class="dish-tags">${tags}</span>
          ${verdict ? `<span class="dish-verdict">${verdict}</span>` : ''}
        </button>`;
    }).join('');
  }

  function renderCheck(table) {
    const groups = [
      { key: 'new', title: 'Yeni, henüz gönderilmedi' },
      { key: 'sent', title: 'Mutfakta' },
      { key: 'ready', title: 'Hazır' }
    ];

    if (!table.lines.length) {
      el.checkBody.innerHTML = '<p class="check-empty">Henüz ürün yok. Menüden bir ürüne dokunarak ekle.</p>';
    } else {
      el.checkBody.innerHTML = groups.map((group) => {
        const lines = table.lines.filter((l) => l.status === group.key);
        if (!lines.length) return '';
        return `
          <section class="line-group is-${group.key}">
            <h3 class="group-title">${group.title}</h3>
            ${lines.map((line) => lineHtml(table, line)).join('')}
          </section>`;
      }).join('');
    }

    const freshCount = table.lines.filter((l) => l.status === 'new').length;
    const itemCount = table.lines.reduce((sum, l) => sum + l.qty, 0);
    const total = money(S.tableTotal(table));
    el.total.textContent = total;
    el.send.textContent = freshCount ? `Mutfağa gönder (${freshCount})` : 'Mutfağa gönder';
    el.send.disabled = !freshCount;
    el.mbSend.disabled = !freshCount;
    el.print.disabled = !table.lines.length;
    el.mbCount.textContent = itemCount ? `(${itemCount})` : '';
    el.mbTotal.textContent = total;
  }

  function lineHtml(table, line) {
    const { guest, product, allergies, risk } = lineInfo(table, line);
    const isNew = line.status === 'new';
    const guestName = guest ? guest.name : 'Silinmiş kişi';
    const flags = [];

    if (risk.blocked.length) {
      flags.push(isNew
        ? `<div class="line-flag is-blocked">${esc(guestName)} için uygun değil: ${esc(namesOf(risk.blocked))} ana malzemede. Bu satırı sil.</div>`
        : `<div class="line-flag is-blocked">Dikkat: ${esc(guestName)} için sonradan ${esc(namesOf(risk.blocked))} işaretlendi ve bu ürünün ana malzemesinde var. Mutfağa hemen haber ver.</div>`);
    } else if (allergies.length && isNew) {
      flags.push(`<div class="line-flag is-allergy">Mutfağa alerji notu gider: ${esc(namesOf(allergies))}</div>`);
      if (risk.removable.length) flags.push(`<div class="line-flag is-caution">Çıkarılacak: ${esc(namesOf(risk.removable))}</div>`);
    }

    const statusChip = isNew ? '' : `<span class="status is-${line.status}">${line.status === 'sent' ? 'Mutfakta' : 'Hazır'}</span>`;
    const id = esc(line.id);

    return `
      <article class="line">
        <div class="line-top">
          <div>
            <div class="line-name">${isNew ? '' : `${line.qty}× `}${esc(product.name)}</div>
            <div class="line-sub"><span>${esc(guestName)}</span>${statusChip}</div>
          </div>
          <div class="line-price">${money(S.linePrice(line))}</div>
        </div>
        ${flags.join('')}
        ${line.note ? `<div class="line-note">Not: ${esc(line.note)}</div>` : ''}
        ${isNew ? `
          <div class="line-tools">
            <div class="stepper">
              <button type="button" data-qty="-1" data-line="${id}" aria-label="Azalt">−</button>
              <span aria-label="Adet">${line.qty}</span>
              <button type="button" data-qty="1" data-line="${id}" aria-label="Artır">+</button>
            </div>
            <button type="button" class="link-btn" data-note="${id}">${line.note ? 'Notu düzenle' : 'Not ekle'}</button>
            <button type="button" class="link-btn" data-delete-line="${id}">Sil</button>
          </div>` : ''}
      </article>`;
  }

  /* ---------- İşlemler ---------- */

  function selectGuest(guestId) {
    activeGuestByTable[currentTableId] = guestId;
    render();
  }

  function toggleAllergy(allergenId) {
    const guest = activeGuest(currentTable());
    run('alerji_degistir', { masa: currentTableId, kisi: guest.id, alerjen: allergenId });
  }

  async function addGuest() {
    const masa = currentTableId;
    const result = await run('kisi_ekle', { masa });
    if (result) {
      activeGuestByTable[masa] = result.kisiId;
      render();
    }
  }

  function removeGuest(guestId) {
    const table = currentTable();
    const guest = table.guests.find((g) => g.id === guestId);
    if (table.lines.some((l) => l.guestId === guestId)) {
      S.openModal({
        title: `${guest.name} silinemez`,
        body: `<p>${esc(guest.name)} için adisyonda ürün var. Yanlış kişiye eklendiyse önce o satırları sil.</p>`
      });
      return;
    }
    run('kisi_sil', { masa: currentTableId, kisi: guestId });
  }

  async function addDish(productId) {
    const table = currentTable();
    const guest = activeGuest(table);
    const product = S.product(productId);
    const risk = S.risk(product, guest.allergies);

    if (risk.blocked.length) {
      S.openModal({
        title: 'Bu ürün eklenemez',
        body: `<p>Bu ürünün ana malzemesine alerjiniz olduğundan başka bir öğün tercih ediniz :)</p>
               <div class="alert-box">${esc(product.name)}: ${esc(namesOf(risk.blocked))} ana malzemede. ${esc(guest.name)} için uygun değil.</div>`
      });
      return;
    }

    const result = await run('urun_ekle', { masa: table.id, kisi: guest.id, urun: productId });
    if (result) S.toast(`${product.name} eklendi (${guest.name})`);
  }

  function changeQty(lineId, delta) {
    run('adet_degistir', { masa: currentTableId, satir: lineId, fark: delta });
  }

  function deleteLine(lineId) {
    run('satir_sil', { masa: currentTableId, satir: lineId });
  }

  function editNote(lineId) {
    const line = currentTable().lines.find((l) => l.id === lineId);
    if (!line) return;
    const masa = currentTableId;
    const product = S.product(line.productId);
    const modal = S.openModal({
      title: `Not: ${product.name}`,
      body: `
        <label class="sr-only" for="note-input">Mutfak notu</label>
        <textarea id="note-input" maxlength="120" placeholder="Mutfağın görmesi gereken not">${esc(line.note)}</textarea>
        <div class="quick-notes">${D.quickNotes.map((q) => `<button type="button" class="chip" data-quick="${esc(q)}">${esc(q)}</button>`).join('')}</div>`,
      actions: [
        { label: 'Vazgeç' },
        {
          label: 'Notu kaydet',
          kind: 'primary',
          onClick: (root) => {
            run('not_kaydet', { masa, satir: lineId, not: root.querySelector('#note-input').value.trim() });
          }
        }
      ]
    });
    const input = modal.querySelector('#note-input');
    modal.querySelectorAll('[data-quick]').forEach((button) => {
      button.addEventListener('click', () => {
        input.value = input.value.trim() ? `${input.value.trim()}, ${button.dataset.quick}` : button.dataset.quick;
        input.focus();
      });
    });
  }

  async function sendToKitchen() {
    const table = currentTable();
    const fresh = table.lines.filter((l) => l.status === 'new');
    if (!fresh.length) return;

    // Güvenlik kontrolü: alerji sonradan işaretlendiyse uygun olmayan satır gönderilmez.
    // (Aynı kontrol sunucuda / store.js'de de yapılır.)
    const blocked = fresh.map((l) => lineInfo(table, l)).filter((info) => info.risk.blocked.length);
    if (blocked.length) {
      S.openModal({
        title: 'Mutfağa gönderilemedi',
        body: `<p>Bu ürünler kişinin alerjisine uygun değil. Adisyondan silip yeniden gönder.</p>
               <div class="alert-box">${blocked.map((b) => `${esc(b.guest.name)}: ${esc(b.product.name)} (${esc(namesOf(b.risk.blocked))} ana malzemede)`).join('<br>')}</div>`
      });
      return;
    }

    el.send.disabled = true;
    el.mbSend.disabled = true;
    const result = await run('mutfaga_gonder', { masa: table.id });
    if (result) {
      document.body.classList.remove('check-open');
      S.toast('Mutfağa gönderildi');
    } else {
      render();
    }
  }

  function printReceipt() {
    const table = currentTable();
    if (!table.lines.length) return;
    const now = new Date();
    el.printArea.innerHTML = `
      <div class="r-head">
        <strong>SyverPOS</strong>
        <div>${S.tableName(table.id)}</div>
        <div>${now.toLocaleDateString('tr-TR')} ${now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</div>
      </div>
      <table class="r-lines">
        <thead><tr><th>Ürün</th><th>Birim</th><th>Tutar</th></tr></thead>
        <tbody>
          ${table.lines.map((line) => {
            const { guest, product, allergies, risk } = lineInfo(table, line);
            const extra = [
              guest ? guest.name : '',
              allergies.length ? `Alerji: ${namesOf(allergies)}` : '',
              risk.removable.length ? `Çıkar: ${namesOf(risk.removable)}` : '',
              line.note ? `Not: ${line.note}` : ''
            ].filter(Boolean).map((x) => `<div class="r-extra">${esc(x)}</div>`).join('');
            return `<tr><td>${line.qty}× ${esc(product.name)}${extra}</td><td>${money(product.price)}</td><td>${money(S.linePrice(line))}</td></tr>`;
          }).join('')}
        </tbody>
      </table>
      <div class="r-total"><span>TOPLAM</span><strong>${money(S.tableTotal(table))}</strong></div>
      <div class="r-foot">Afiyet olsun</div>`;
    window.print();
  }

  function closeTable() {
    const table = currentTable();
    const name = S.tableName(table.id);
    if (state.tickets.some((t) => t.tableId === table.id && t.status === 'waiting')) {
      S.openModal({
        title: 'Mutfak bekleniyor',
        body: `<p>${name} için mutfakta hazırlanan sipariş var. Mutfak "hazır" dedikten sonra masayı kapatabilirsin.</p>`
      });
      return;
    }
    const freshCount = table.lines.filter((l) => l.status === 'new').length;
    S.openModal({
      title: `${name} kapatılsın mı?`,
      body: `<p>Toplam <strong>${money(S.tableTotal(table))}</strong>. Adisyon, kişiler ve alerji seçimleri silinir; bu masanın mutfak fişleri de kaldırılır.</p>
             ${freshCount ? `<div class="warn-box">${freshCount} satır mutfağa hiç gönderilmedi. Bunlar da silinecek.</div>` : ''}`,
      actions: [
        { label: 'Vazgeç' },
        {
          label: 'Masayı kapat',
          kind: 'strong',
          onClick: async () => {
            const id = table.id;
            const result = await run('masa_kapat', { masa: id });
            if (!result) return;
            delete activeGuestByTable[id];
            openFloor();
            S.toast(`${name} kapatıldı`);
          }
        }
      ]
    });
  }

  function resetDemo() {
    const everywhere = store.mode === 'server';
    S.openModal({
      title: everywhere ? 'Tüm masalar sıfırlansın mı?' : 'Demo sıfırlansın mı?',
      body: `<p>Tüm masalar, adisyonlar ve mutfak fişleri silinir${everywhere ? ', bağlı bütün cihazlarda' : ''}.</p>`,
      actions: [
        { label: 'Vazgeç' },
        {
          label: 'Sıfırla',
          kind: 'strong',
          onClick: async () => {
            const result = await run('sifirla', {});
            if (!result) return;
            Object.keys(activeGuestByTable).forEach((k) => delete activeGuestByTable[k]);
            openFloor();
          }
        }
      ]
    });
  }

  function dismissNotice(noticeId) {
    run('bildirim_goruldu', { bildirim: noticeId });
  }

  /* ---------- Olaylar ---------- */

  document.addEventListener('click', (event) => {
    const t = event.target.closest('button');
    if (!t || t.closest('#modal') || !state) return;
    const d = t.dataset;
    if (d.openTable) openTable(Number(d.openTable));
    else if (d.goTable) openTable(Number(d.goTable));
    else if (d.dismiss) dismissNotice(d.dismiss);
    else if (d.guest) selectGuest(d.guest);
    else if (d.removeGuest) removeGuest(d.removeGuest);
    else if ('addGuest' in d) addGuest();
    else if (d.allergen) toggleAllergy(Number(d.allergen));
    else if (d.cat) { activeCategory = d.cat; render(); }
    else if (d.dish) addDish(Number(d.dish));
    else if (d.qty) changeQty(d.line, Number(d.qty));
    else if (d.note) editNote(d.note);
    else if (d.deleteLine) deleteLine(d.deleteLine);
  });

  $('back').addEventListener('click', openFloor);
  $('back').insertAdjacentHTML('afterbegin', S.icons.back);
  el.send.addEventListener('click', sendToKitchen);
  el.mbSend.addEventListener('click', sendToKitchen);
  el.print.addEventListener('click', printReceipt);
  el.closeTable.addEventListener('click', closeTable);
  $('open-check').addEventListener('click', () => document.body.classList.add('check-open'));
  $('check-close').addEventListener('click', () => document.body.classList.remove('check-open'));
  $('reset').addEventListener('click', resetDemo);
  el.search.addEventListener('input', () => renderDishes(activeGuest(currentTable())));
  el.safeOnly.addEventListener('change', () => { safeOnly = el.safeOnly.checked; renderDishes(activeGuest(currentTable())); });
  window.addEventListener('hashchange', onRouteChange);
  window.addEventListener('popstate', onRouteChange);

  // Veri değişince (bu ekrandan, başka sekmeden ya da başka cihazdan) yeniden çiz
  store.onChange((next) => {
    const fresh = next.notices.filter((n) => !n.seen && !knownNoticeIds.has(n.id));
    knownNoticeIds = new Set(next.notices.map((n) => n.id));
    state = next;
    if (fresh.length) S.beep(2);
    render();
  });

  S.startClock($('clock'));
  S.setupSoundToggle($('sound'));
  store.bindStatusPill($('mode'));

  store.init().then((initial) => {
    state = initial;
    knownNoticeIds = new Set(state.notices.map((n) => n.id));
    if (store.warning) {
      S.openModal({
        title: 'Sunucu modu açılamadı',
        body: `<p>${esc(store.warning)}</p><div class="warn-box">Şimdilik demo modunda çalışıyor: veriler sadece bu tarayıcıda tutulur.</div>`
      });
    }
    onRouteChange();
  });
})();
