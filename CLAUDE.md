# SyverPOS

Alerjen kontrollü restoran adisyon sistemi (ön yüz: HTML/JS, arka uç: PHP + MySQL). Ayrıntı için `README.md` ve `docs/`.

## Harness: hata avı

**Goal:** SyverPOS kodundaki hataları (alerjen mantığı, API güvenliği, veritabanı, demo/sunucu uyumu) denetçi ajanlarla bulup öncelikli bir raporda birleştirmek.

**Entry point — applies to every prompt in this repo:** Bu depodaki herhangi bir isteğe cevap vermeden *önce* `hata-avi-orkestratoru` skill'ini çağır — yeni iş, takip, yeniden çalıştırma, soru ya da önceki sonucu değiştirme fark etmez. Tek giriş noktasıdır; onun dışında cevap üretme. Orkestratör önemsiz ya da hata avı dışındaki istekleri doğrudan cevaplar, ekibi yalnızca iş gerektirdiğinde çalıştırır.

**Change history:**
| Date | Change | Target | Reason |
|------|--------|--------|--------|
| 2026-10-28 | Initial setup | All | Hata avı için denetçi ajan ekibi kuruldu |
