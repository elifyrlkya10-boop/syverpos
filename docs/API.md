# SyverPOS API

Sunucu modunda ekranlar üç adresle konuşur. Bütün cevaplar JSON'dur ve `ok` alanı taşır.

| Adres | Yöntem | Ne yapar? |
|---|---|---|
| `api/menu.php` | GET | Menü, kategoriler, alerjenler ve masa sayısı |
| `api/durum.php?surum=N` | GET | Masalar, adisyonlar, mutfak fişleri ve bildirimler |
| `api/islem.php` | POST | Bütün değişiklikler |

## durum.php

Ekranlar elindeki sürüm numarasını gönderir.

```
GET api/durum.php?surum=41
→ {"ok": true, "degismedi": true, "surum": 41}

GET api/durum.php?surum=40
→ {"ok": true, "surum": 41, "durum": { "tables": {...}, "tickets": [...], "notices": [...] }}
```

`durum` nesnesinin yapısı demo modundaki localStorage verisiyle aynıdır, bu yüzden ekranlar iki modda da aynı kodla çizilir.

## islem.php

```
POST api/islem.php
Content-Type: application/json

{"islem": "urun_ekle", "veri": {"masa": 3, "kisi": "12", "urun": 1}}
```

Başarılı olursa işlemin sonucu ve güncel durum döner:

```json
{"ok": true, "sonuc": {"satirId": "57"}, "surum": 42, "durum": {...}}
```

Bir iş kuralı ihlal edilirse **HTTP 409** ve kullanıcıya gösterilecek mesaj döner, veritabanında hiçbir şey değişmez:

```json
{"ok": false, "hata": "Bu ürünün ana malzemesine alerjiniz olduğundan başka bir öğün tercih ediniz :) (Teriyaki Somon: Soya ana malzemede.)"}
```

### İşlemler

| İşlem | Veri | Kural |
|---|---|---|
| `kisi_ekle` | `masa` | Boştaki en küçük numarayla "Kişi N" ekler. Sonuç: `kisiId` |
| `kisi_sil` | `masa`, `kisi` | Masada en az bir kişi kalır. Adisyonda ürünü olan kişi silinemez |
| `alerji_degistir` | `masa`, `kisi`, `alerjen`, `acik` | `acik: true` alerjiyi ekler, `acik: false` kaldırır. `acik` mutlaka `true` ya da `false` olmalı; aynı istek tekrarlansa da sonuç değişmez. Kişinin mutfakta bekleyen satırlarının fiş kalemleri de güncellenir |
| `urun_ekle` | `masa`, `kisi`, `urun` | Ana malzemede kişinin alerjeni varsa reddedilir. Aynı kişiye aynı ürün tekrar eklenirse adet artar |
| `adet_degistir` | `masa`, `satir`, `fark` (`1` / `-1`) | Sadece mutfağa gitmemiş satırlar. Adet 0 olursa satır silinir |
| `satir_sil` | `masa`, `satir` | Sadece mutfağa gitmemiş satırlar |
| `not_kaydet` | `masa`, `satir`, `not` | En fazla 120 karakter |
| `mutfaga_gonder` | `masa` | Her satırı kişinin güncel alerjilerine göre yeniden kontrol eder; uygun olmayan varsa hiçbirini göndermez. Sonuç: `fisId` |
| `masa_kapat` | `masa` | Mutfakta bekleyen fiş varsa reddedilir. Hesabı `kapanan_hesaplar`'a yazar, masayı sıfırlar |
| `bildirim_goruldu` | `bildirim` | "Hazır" bildirimini kapatır |
| `masa_bildirimleri_goruldu` | `masa` | Masanın bütün bildirimlerini kapatır |
| `hazir` | `fis`, `kontrol` | Fişte ya da fişteki kişilerin güncel alerjilerinde alerjen varsa `kontrol` tam olarak `true` olmalı (`"true"`, `1` gibi değerler kabul edilmez). Garsona bildirim oluşturur |
| `hazir_geri_al` | `fis` | Yanlışlıkla "hazır" denen fişi bekleyen duruma döndürür |
| `sifirla` | | Bütün masaları, adisyonları ve fişleri siler. Menü ve geçmiş hesaplar kalır |

## Terminalden deneme

```bash
# Durum
curl http://localhost/syverpos/api/durum.php

# Soya alerjisi olan kişiye Teriyaki Somon eklemeyi dene → 409
curl -X POST http://localhost/syverpos/api/islem.php \
  -H "Content-Type: application/json" \
  -d '{"islem":"urun_ekle","veri":{"masa":1,"kisi":"1","urun":2}}'
```

## Eşzamanlılık

`islem.php` her işlemi bir veritabanı işlemi (transaction) içinde çalıştırır ve işe `sistem` tablosundaki sürüm sayacını artırarak başlar. Bu güncelleme satırı kilitler; aynı anda gelen ikinci işlem, birincisi bitene kadar bekler. Böylece iki garson aynı anda "mutfağa gönder"e bassa bile tek fiş oluşur. Hata olursa işlem geri alınır (rollback) ve sürüm artmaz.
