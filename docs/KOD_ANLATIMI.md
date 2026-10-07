# SyverPOS kod anlatımı

Sunumda ya da mülakatta projeyi anlatırken bu sırayı izleyebilirsin. Her başlık, ilgili dosyayı ve fonksiyonu gösterir.

## 1. Genel yapı

Proje iki ekrandan oluşur: garson ekranı (`adisyon.html`) ve mutfak ekranı (`mutfak.html`). İkisi de aynı dosyaları sırayla yükler:

1. `assets/js/data.js`: menü, fiyatlar ve alerjenler (demo modu için)
2. `assets/js/common.js`: alerjen hesabı, para biçimi, pencere, bildirim, ses
3. `assets/js/store.js`: veri katmanı. Veriyi tarayıcıda mı sunucuda mı tutacağını seçer
4. Ekranın kendi dosyası: `adisyon.js` ya da `mutfak.js`

Sunucu tarafı `api/` klasöründe PHP ile, veritabanı `database/syverpos_db.sql` dosyasında.

Katmanlar:

```
Ekran (adisyon.js, mutfak.js)   → sadece çizer ve kullanıcıyı uyarır
Veri katmanı (store.js)         → işlemleri doğru yere iletir
   ├─ Demo modu: localStorage   → kurallar store.js içinde
   └─ Sunucu modu: api/islem.php → kurallar PHP'de, veri MySQL'de
```

## 2. Veri: `data.js` ve veritabanı

`products` listesinde her ürünün adı, kategorisi, fiyatı ve alerjenleri vardır. Her alerjende `removable` alanı bulunur:

- `removable: false`: ana malzeme. Bu alerjisi olan kişiye ürün eklenmez.
- `removable: true`: çıkarılabilir. Ürün eklenir, mutfağa "çıkar" notu gider.

Bu, veritabanındaki `urun_alerjen.cikarilabilir` sütununun karşılığıdır. Sunucu modunda menü `api/menu.php` ile veritabanından okunur, `data.js` kullanılmaz.

## 3. Alerjen hesabı: `common.js`

`risk(ürün, alerjiler)` ürünün kişiye göre durumunu döndürür:

- `blocked`: ana malzemedeki alerjenler → ürün verilemez
- `removable`: çıkarılabilir malzemedeki alerjenler → mutfak çıkarır

Aynı mantık PHP'de `urunRiski()` fonksiyonundadır.

## 4. Veri katmanı: `store.js`

Ekranlar veriyi doğrudan değiştirmez. Adı olan bir işlem çağırır:

```js
await Syver.store.act('urun_ekle', { masa: 3, kisi: 'k1', urun: 1 });
```

- `init()`: açılışta `api/menu.php` ve `api/durum.php` adreslerine ulaşmayı dener. Cevap gelirse **sunucu modu**, gelmezse (GitHub Pages, dosyaya çift tıklama) **demo modu** başlar.
- `act(ad, veri)`: işlemi çalıştırır. Kural ihlali olursa `{ ok: false, error }` döner, ekran bunu pencerede gösterir.
- `onChange(cb)`: veri değişince (bu ekrandan, başka sekmeden ya da başka cihazdan) ekran yeniden çizilir.
- **Demo modu:** `localActions` içindeki fonksiyonlar kuralları uygular. Her işlem "en güncel veriyi oku → değiştir → kaydet" sırasıyla çalışır. Diğer sekmeler `storage` olayıyla haberdar olur.
- **Sunucu modu:** işlem `api/islem.php`'ye POST edilir. Ekran 1,5 saniyede bir `api/durum.php?surum=N` ile yeni bir şey olup olmadığını sorar. Sunucuya ulaşılamazsa üst çubukta "Bağlantı kesildi" yazar.

## 5. Garson ekranı: `adisyon.js`

- **Masa planı:** `renderTables()` masaları çizer. `tableStatus()` masanın boş, açık, mutfakta ya da hazır olduğunu bulur.
- **Masaya giriş:** adres `#masa-3` olur. Tarayıcının geri tuşu masa planına döner.
- **Kişi ve alerji:** `addGuest()`, `removeGuest()`, `toggleAllergy()` → `kisi_ekle`, `kisi_sil`, `alerji_degistir` işlemleri.
- **Ürün ekleme:** `addDish()` önce `risk()` ile kontrol eder. Ana malzemede alerjen varsa şu uyarıyı verir ve ürünü eklemez: "Bu ürünün ana malzemesine alerjiniz olduğundan başka bir öğün tercih ediniz :)"
- **Canlı kontrol:** `lineInfo()` her satırın alerji durumunu kişinin **güncel** alerjilerine göre hesaplar. Alerji sonradan işaretlenirse satır kırmızıya döner.
- **Mutfağa gönderme:** `sendToKitchen()` uygun olmayan satır varsa göndermez. Yoksa `mutfaga_gonder` işlemi bir fiş oluşturur. Fişe o anki alerji bilgisi, çıkarılacak malzemeler ve garson notu yazılır.
- **Fiş yazdırma:** `printReceipt()` 80 mm fiş hazırlar ve tarayıcının yazdırma penceresini açar.
- **Masa kapatma:** `closeTable()` mutfakta bekleyen sipariş varsa izin vermez. `masa_kapat` masayı sıfırlar, o masanın mutfak fişlerini ve bildirimlerini siler.

## 6. Mutfak ekranı: `mutfak.js`

- `render()` bekleyen fişleri eskiden yeniye çizer. Yeni fiş gelirse sesli uyarı verir ve fişin başlığını kısa süre vurgular.
- `itemHtml()` her alerjeni ayrı satırda büyük harfle yazar: `KİŞİ 1: SOYA ALERJİSİ VAR`.
- Alerjenli fişte "hazır" düğmesi, kontrol kutusu işaretlenmeden açılmaz.
- `markReady()` → `hazir` işlemi. Sunucu, alerjenli fiş için kontrol onayı gelmezse işlemi reddeder ve onayı `mutfak_fisleri.alerjen_kontrol` sütununa kaydeder.
- `undoReady()` → `hazir_geri_al`: yanlışlıkla "hazır" denen fişi geri alır.
- `refreshAges()` her fişin kaç dakikadır beklediğini günceller. 10 dakikayı geçen fiş sarıya döner.

## 7. Sunucu: `api/`

- `config.php`: veritabanı ayarları. 3306 ve 3307 portlarını sırayla dener.
- `db.php`: PDO bağlantısı, JSON cevap fonksiyonu `cevap()`, ekranlara giden veriyi hazırlayan `durumOlustur()`.
- `menu.php`: menüyü veritabanından okur.
- `durum.php`: sürüm numarası değişmediyse sadece `degismedi: true` döner, değiştiyse bütün durumu.
- `islem.php`: bütün işlemler `$islemler` dizisinde birer fonksiyondur. Çalıştırma sırası:
  1. `beginTransaction()`
  2. Sürüm sayacını artır (satır kilitlenir, aynı anda gelen işlem bekler)
  3. İşlemi çalıştır. Kural ihlalinde `IsKuraliHatasi` fırlatılır
  4. Hata yoksa `commit()`, varsa `rollBack()` ve HTTP 409 ile mesaj

Bütün sorgular hazırlanmış ifadelerle (`prepare` + `execute`) çalışır, kullanıcıdan gelen değer SQL metnine eklenmez.

## 8. Veritabanı: `database/syverpos_db.sql`

**Menü tabloları**
- `kategoriler`, `urunler`, `alerjenler`
- `urun_alerjen`: hangi üründe hangi alerjen var ve çıkarılabilir mi. Birincil anahtar `(urun_id, alerjen_id)`

**Servis tabloları**
- `masalar`, `misafirler`, `misafir_alerjen`
- `siparisler`: adisyon satırları. `durum`: yeni → mutfakta → hazir. Siparişi olan kişi yabancı anahtar sayesinde silinemez
- `mutfak_fisleri` ve `fis_kalemleri`: mutfağa giden fişler. Kalemler gönderim anındaki kişi adını ve alerjileri saklar
- `bildirimler`: "Masa X siparişi hazır"
- `kapanan_hesaplar`: kapatılan masaların toplamı
- `sistem`: sürüm sayacı

Dosyanın sonunda üç örnek sorgu var: alerjene göre engellenen ürünler, bugünkü satış, mutfakta bekleyen alerjenli fişler.

## 9. Tasarım kararları

- **Kırmızı yalnızca alerjen içindir.** Silme ya da kapatma düğmeleri kırmızı değildir. Böylece ekranda kırmızı görmek her zaman "alerji var" demektir.
- **Mutfak koyu, fişler kâğıt beyazı.** Uzaktan bakınca fişler zeminden ayrılır. Alerjenli fişin üstündeki kırmızı-beyaz şerit mutfağın her yerinden görünür.
- **Yazı tipi:** Atkinson Hyperlegible Next. Harfleri birbirine karışmayacak şekilde tasarlanmıştır (ör. I, l ve 1). Dosyaları repoda olduğu için internet olmadan da çalışır.
- **Kurallar iki yerde:** ekran hızlı uyarı versin diye tarayıcıda, kimse atlatamasın diye sunucuda.
