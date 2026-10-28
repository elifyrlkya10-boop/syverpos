/*
 * SyverPOS veri katmanı
 * ---------------------
 * Ekranlar veriyi doğrudan değiştirmez, adı olan işlemler çağırır:
 *     await Syver.store.act('urun_ekle', { masa: 3, kisi: 'k1', urun: 1 })
 *
 * İki çalışma modu vardır. Ekranlar hangisinde olduklarını bilmek zorunda değildir.
 *
 *   Sunucu modu: api/ klasöründeki PHP çalışıyorsa (XAMPP gibi). Veri MySQL'de
 *                tutulur, farklı cihazlar aynı masaları görür.
 *   Demo modu:   PHP yoksa (GitHub Pages ya da dosyaya çift tıklama). Veri bu
 *                tarayıcının localStorage'ında tutulur.
 *
 * İki modda da işlem adları, kurallar ve veri yapısı aynıdır.
 */
(function () {
  const S = window.Syver;
  const D = S.data;

  const API = 'api/';
  const POLL_MS = 1500;   // sunucuya kaç milisaniyede bir "yeni bir şey var mı?" diye sorulur
  const LOCAL_KEY = 'syverpos_v2';

  const store = {
    mode: null,      // 'server' | 'local'
    online: true,    // sunucu modunda bağlantı durumu
    warning: '',     // sunucu bulundu ama veritabanına bağlanamadıysa mesaj
    state: null
  };
  const changeListeners = [];
  const statusListeners = [];

  // Kullanıcıya gösterilecek kural hatası
  class RuleError extends Error {}

  const emitChange = () => changeListeners.forEach((cb) => cb(store.state));
  const emitStatus = () => statusListeners.forEach((cb) => cb(store));

  function setOnline(value) {
    if (store.online === value) return;
    store.online = value;
    emitStatus();
  }

  /* =========================================================
     DEMO MODU: localStorage
     ========================================================= */

  const local = {
    lastRaw: null,
    memory: null, // localStorage kapalıysa (gizli sekme vb.) veri burada tutulur

    read() {
      try { return localStorage.getItem(LOCAL_KEY); } catch (e) { return this.memory; }
    },
    write(raw) {
      this.lastRaw = raw;
      try { localStorage.setItem(LOCAL_KEY, raw); } catch (e) { this.memory = raw; }
    },
    blankTable(id) {
      return {
        id,
        guests: [
          { id: 'k1', name: 'Kişi 1', allergies: [] },
          { id: 'k2', name: 'Kişi 2', allergies: [] }
        ],
        lines: []
      };
    },
    blankState() {
      const tables = {};
      for (let i = 1; i <= D.tableCount; i++) tables[i] = this.blankTable(i);
      return { v: 2, seq: 1, tables, tickets: [], notices: [] };
    },
    load() {
      let state = null;
      try { state = JSON.parse(this.read()); } catch (e) { state = null; }
      if (!state || state.v !== 2 || !state.tables) state = this.blankState();
      for (let i = 1; i <= D.tableCount; i++) {
        if (!state.tables[i]) state.tables[i] = this.blankTable(i);
      }
      if (!Array.isArray(state.tickets)) state.tickets = [];
      if (!Array.isArray(state.notices)) state.notices = [];
      if (!state.seq) state.seq = 1;
      return state;
    },
    start() {
      store.state = this.load();
      this.lastRaw = this.read();
      const check = () => {
        const now = this.read();
        if (now !== this.lastRaw) {
          this.lastRaw = now;
          store.state = this.load();
          emitChange();
        }
      };
      window.addEventListener('storage', (event) => {
        if (event.key === LOCAL_KEY || event.key === null) check();
      });
      setInterval(check, 1000); // storage olayı gelmeyen tarayıcılar için yedek kontrol
    },
    // Her işlem: en güncel veriyi oku → kuralı uygula → kaydet.
    // Böylece aynı tarayıcıdaki iki sekme birbirinin değişikliğini ezmez.
    async act(name, data) {
      const fn = localActions[name];
      if (!fn) throw new RuleError(`Bilinmeyen işlem: ${name}`);
      const state = this.load();
      const result = fn(state, data) || {};
      this.write(JSON.stringify(state));
      store.state = state;
      return result;
    }
  };

  /* ---------- Demo modu işlemleri (api/islem.php ile aynı kurallar) ---------- */

  const findTable = (s, masa) => {
    const table = s.tables[masa];
    if (!table) throw new RuleError('Masa bulunamadı.');
    return table;
  };
  const findGuest = (table, kisi) => {
    const guest = table.guests.find((g) => g.id === String(kisi));
    if (!guest) throw new RuleError('Kişi bulunamadı. Ekran güncel olmayabilir, sayfayı yenile.');
    return guest;
  };
  const names = (ids) => S.allergenNames(ids);

  const localActions = {
    kisi_ekle(s, { masa }) {
      const table = findTable(s, masa);
      let n = 1;
      while (table.guests.some((g) => g.name === `Kişi ${n}`)) n++;
      const guest = { id: S.uid('k'), name: `Kişi ${n}`, allergies: [] };
      table.guests.push(guest);
      table.guests.sort((a, b) => a.name.localeCompare(b.name, 'tr', { numeric: true }));
      return { kisiId: guest.id };
    },

    kisi_sil(s, { masa, kisi }) {
      const table = findTable(s, masa);
      const guest = findGuest(table, kisi);
      if (table.guests.length <= 1) throw new RuleError('Masada en az bir kişi kalmalı.');
      if (table.lines.some((l) => l.guestId === guest.id)) {
        throw new RuleError(`${guest.name} için adisyonda ürün var. Yanlış kişiye eklendiyse önce o satırları sil.`);
      }
      table.guests = table.guests.filter((g) => g.id !== guest.id);
    },

    // Hedef durum açıkça gönderilir (acik: true/false), işlem tekrarlanırsa sonuç değişmez
    alerji_degistir(s, { masa, kisi, alerjen, acik }) {
      const table = findTable(s, masa);
      const guest = findGuest(table, kisi);
      const id = Number(alerjen);
      if (typeof acik !== 'boolean') throw new RuleError('Eksik ya da hatalı bilgi: acik');
      if (!S.allergen(id)) throw new RuleError('Alerjen bulunamadı.');
      const has = guest.allergies.includes(id);
      if (acik && !has) guest.allergies.push(id);
      if (!acik && has) guest.allergies.splice(guest.allergies.indexOf(id), 1);
      guest.allergies.sort((a, b) => a - b);

      // Mutfakta bekleyen fişlerdeki bu kişinin kalemleri güncel alerjiyi göstersin
      s.tickets.filter((t) => t.tableId === table.id && t.status === 'waiting').forEach((t) => {
        t.items.forEach((item) => {
          const line = table.lines.find((l) => l.id === item.lineId);
          if (!line || line.guestId !== guest.id) return;
          item.allergies = names(guest.allergies);
          item.remove = names(S.risk(S.product(line.productId), guest.allergies).removable);
        });
      });
    },

    urun_ekle(s, { masa, kisi, urun }) {
      const table = findTable(s, masa);
      const guest = findGuest(table, kisi);
      const product = S.product(Number(urun));
      if (!product) throw new RuleError('Ürün bulunamadı.');
      const risk = S.risk(product, guest.allergies);
      if (risk.blocked.length) {
        throw new RuleError(`Bu ürünün ana malzemesine alerjiniz olduğundan başka bir öğün tercih ediniz :) (${product.name}: ${names(risk.blocked).join(', ')} ana malzemede.)`);
      }
      // Aynı kişiye aynı ürün tekrar eklenirse yeni satır açmak yerine adedi artır
      const same = table.lines.find((l) => l.status === 'new' && l.productId === product.id && l.guestId === guest.id && !l.note);
      if (same) {
        same.qty += 1;
        return { satirId: same.id };
      }
      const line = { id: S.uid('L'), productId: product.id, guestId: guest.id, qty: 1, note: '', status: 'new', ticketId: null };
      table.lines.push(line);
      return { satirId: line.id };
    },

    adet_degistir(s, { masa, satir, fark }) {
      const table = findTable(s, masa);
      const line = table.lines.find((l) => l.id === String(satir) && l.status === 'new');
      if (!line) throw new RuleError('Bu satır mutfağa gönderilmiş, artık değiştirilemez.');
      line.qty += Math.max(-1, Math.min(1, Number(fark)));
      if (line.qty <= 0) table.lines = table.lines.filter((l) => l !== line);
    },

    satir_sil(s, { masa, satir }) {
      const table = findTable(s, masa);
      table.lines = table.lines.filter((l) => !(l.id === String(satir) && l.status === 'new'));
    },

    not_kaydet(s, { masa, satir, not }) {
      const line = findTable(s, masa).lines.find((l) => l.id === String(satir) && l.status === 'new');
      if (line) line.note = String(not || '').trim().slice(0, 120);
    },

    mutfaga_gonder(s, { masa }) {
      const table = findTable(s, masa);
      const order = table.guests.map((g) => g.id);
      const fresh = table.lines
        .filter((l) => l.status === 'new')
        .sort((a, b) => order.indexOf(a.guestId) - order.indexOf(b.guestId));
      if (!fresh.length) throw new RuleError('Gönderilecek yeni ürün yok.');

      // Alerji ürün eklendikten sonra işaretlenmiş olabilir: her satırı yeniden kontrol et
      const items = [];
      const unsuitable = [];
      fresh.forEach((l) => {
        const guest = findGuest(table, l.guestId);
        const product = S.product(l.productId);
        const risk = S.risk(product, guest.allergies);
        if (risk.blocked.length) unsuitable.push(`${guest.name}: ${product.name} (${names(risk.blocked).join(', ')} ana malzemede)`);
        items.push({
          lineId: l.id,
          name: product.name,
          qty: l.qty,
          guest: guest.name,
          allergies: names(guest.allergies),
          remove: names(risk.removable),
          note: l.note
        });
      });
      if (unsuitable.length) {
        throw new RuleError(`Bu ürünler kişinin alerjisine uygun değil, adisyondan silip yeniden gönder: ${unsuitable.join('; ')}`);
      }

      const ticketId = s.seq++;
      fresh.forEach((l) => { l.status = 'sent'; l.ticketId = ticketId; });
      s.tickets.push({ id: ticketId, tableId: table.id, sentAt: new Date().toISOString(), readyAt: null, status: 'waiting', items });
      return { fisId: ticketId };
    },

    masa_kapat(s, { masa }) {
      const table = findTable(s, masa);
      if (s.tickets.some((t) => t.tableId === table.id && t.status === 'waiting')) {
        throw new RuleError('Mutfakta hazırlanan sipariş var. Mutfak "hazır" dedikten sonra masayı kapatabilirsin.');
      }
      const total = S.tableTotal(table);
      s.tables[table.id] = local.blankTable(table.id);
      s.tickets = s.tickets.filter((t) => t.tableId !== table.id);
      s.notices = s.notices.filter((n) => n.tableId !== table.id);
      return { toplam: total };
    },

    bildirim_goruldu(s, { bildirim }) {
      const notice = s.notices.find((n) => n.id === String(bildirim));
      if (notice) notice.seen = true;
    },

    masa_bildirimleri_goruldu(s, { masa }) {
      s.notices.forEach((n) => { if (n.tableId === Number(masa)) n.seen = true; });
    },

    hazir(s, { fis, kontrol }) {
      const ticket = s.tickets.find((t) => t.id === Number(fis) && t.status === 'waiting');
      if (!ticket) throw new RuleError('Bu fiş zaten hazır ya da masa kapatılmış.');
      const table = s.tables[ticket.tableId];
      const liveAllergy = table && table.lines.some((l) => l.ticketId === ticket.id
        && table.guests.some((g) => g.id === l.guestId && g.allergies.length));
      const hasAllergy = liveAllergy || ticket.items.some((i) => i.allergies.length);
      if (hasAllergy && kontrol !== true) throw new RuleError('Alerjenli fiş, alerjen kontrolü onaylanmadan hazır yapılamaz.');
      ticket.status = 'ready';
      ticket.readyAt = new Date().toISOString();
      if (table) table.lines.forEach((l) => { if (l.ticketId === ticket.id) l.status = 'ready'; });
      s.notices.push({ id: `N${ticket.id}`, tableId: ticket.tableId, ticketId: ticket.id, at: ticket.readyAt, seen: false });
    },

    hazir_geri_al(s, { fis }) {
      const ticket = s.tickets.find((t) => t.id === Number(fis) && t.status === 'ready');
      if (!ticket) throw new RuleError('Bu fiş geri alınamaz. Masa kapatılmış olabilir.');
      ticket.status = 'waiting';
      ticket.readyAt = null;
      const table = s.tables[ticket.tableId];
      if (table) table.lines.forEach((l) => { if (l.ticketId === ticket.id) l.status = 'sent'; });
      s.notices = s.notices.filter((n) => n.ticketId !== ticket.id);
    },

    sifirla(s) {
      const fresh = local.blankState();
      Object.keys(s).forEach((k) => delete s[k]);
      Object.assign(s, fresh);
    }
  };

  /* =========================================================
     SUNUCU MODU: api/*.php
     ========================================================= */

  const server = {
    surum: -1,
    polling: false,

    async request(path, options = {}, timeoutMs = 6000) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(API + path, { cache: 'no-store', signal: controller.signal, ...options });
        let body;
        try { body = await res.json(); } catch (e) { throw new Error('Sunucudan JSON gelmedi.'); }
        return body;
      } finally {
        clearTimeout(timer);
      }
    },

    // Gelen veri elimizdekinden eskiyse (yavaş cevap) yok sayılır
    apply(body) {
      if (!body.durum || body.surum < this.surum) return;
      this.surum = body.surum;
      store.state = body.durum;
      emitChange();
    },

    async poll() {
      if (server.polling) return;
      server.polling = true;
      try {
        const body = await server.request(`durum.php?surum=${server.surum}`, {}, 4000);
        setOnline(Boolean(body.ok));
        if (body.ok && !body.degismedi) server.apply(body);
      } catch (e) {
        setOnline(false);
      } finally {
        server.polling = false;
      }
    },

    async act(name, data) {
      let body;
      try {
        body = await this.request('islem.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ islem: name, veri: data })
        });
      } catch (e) {
        setOnline(false);
        throw new RuleError('Sunucuya ulaşılamadı. Bağlantıyı kontrol edip tekrar dene.');
      }
      setOnline(true);
      if (!body.ok) throw new RuleError(body.hata || 'İşlem yapılamadı.');
      this.apply(body);
      return body.sonuc || {};
    },

    // api/ çalışıyor mu? Çalışıyorsa menüyü ve durumu yükler.
    // Dönüş: true (sunucu modu), false (PHP yok) ya da { hata } (PHP var, veritabanı yok)
    async detect() {
      if (!/^https?:$/.test(location.protocol)) return false; // dosyaya çift tıklayınca PHP yok
      let menu;
      let state;
      try {
        [menu, state] = await Promise.all([this.request('menu.php', {}, 3000), this.request('durum.php', {}, 3000)]);
      } catch (e) {
        return false; // GitHub Pages gibi PHP çalıştırmayan bir sunucu
      }
      if (!menu.ok || !state.ok) return { hata: menu.hata || state.hata || 'Sunucu hatası' };
      Object.assign(D, menu.menu); // menü artık veritabanından
      this.surum = state.surum;
      store.state = state.durum;
      return true;
    }
  };

  /* =========================================================
     Ekranların kullandığı arayüz
     ========================================================= */

  store.init = async function () {
    const detected = await server.detect();
    if (detected === true) {
      store.mode = 'server';
      setInterval(server.poll, POLL_MS);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) server.poll(); });
    } else {
      store.mode = 'local';
      store.warning = detected && detected.hata ? detected.hata : '';
      local.start();
    }
    emitStatus();
    return store.state;
  };

  // İşlem çalıştırır. Asla hata fırlatmaz: { ok, result } ya da { ok: false, error } döner.
  store.act = async function (name, data = {}) {
    try {
      const result = store.mode === 'server' ? await server.act(name, data) : await local.act(name, data);
      if (store.mode === 'local') emitChange();
      return { ok: true, result };
    } catch (e) {
      if (!(e instanceof RuleError)) console.error(e);
      return { ok: false, error: e instanceof RuleError ? e.message : 'Beklenmeyen bir hata oldu.' };
    }
  };

  store.onChange = (cb) => changeListeners.push(cb);
  store.onStatus = (cb) => statusListeners.push(cb);

  // Üst çubuktaki "Demo modu / Sunucuya bağlı" göstergesi
  store.bindStatusPill = function (el) {
    const paint = () => {
      el.classList.remove('is-server', 'is-offline');
      if (store.mode === 'server' && store.online) {
        el.textContent = 'Sunucuya bağlı';
        el.title = 'Veriler veritabanında. Aynı ağdaki tüm cihazlar aynı masaları görür.';
        el.classList.add('is-server');
      } else if (store.mode === 'server') {
        el.textContent = 'Bağlantı kesildi';
        el.title = 'Sunucuya ulaşılamıyor. Ekrandaki bilgiler güncel olmayabilir.';
        el.classList.add('is-offline');
      } else {
        el.textContent = 'Demo modu';
        el.title = 'Veriler bu tarayıcıda tutuluyor. Farklı cihazlarda kullanmak için sunucu modunu kur (README).';
      }
      el.hidden = !store.mode;
    };
    store.onStatus(paint);
    paint();
  };

  S.store = store;
})();
