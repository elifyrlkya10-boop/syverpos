---
name: kod-denetim-yontemi
description: "SyverPOS denetim ajanlarının ortak bulgu biçimi, önem ölçeği ve kanıt kuralları. Hata avı, kod denetimi, güvenlik taraması, bulgu raporu yazarken kullan."
---

# Kod denetim yöntemi

Denetçiler aynı biçimde yazdığında orkestratör bulguları kayıpsız birleştirebilir. Bu yüzden biçim sabit.

## Bulgu biçimi
```
### [ÖNEM] Kısa başlık
- Yer: dosya:satır
- Ne oluyor: tek cümle
- Yeniden üretme: adımlar ya da girdi → hatalı sonuç
- Kanıt: okuyarak | çalıştırarak
- Öneri: düzeltme yönü (kodu sen değiştirme)
```

## Önem ölçeği
- **Kritik:** alerjen güvenliğini bozar ya da veri/para kaybettirir (alerjenli ürün onaysız hazır olur, SQL enjeksiyonu).
- **Yüksek:** yanlış sonuç ya da çökme, ama güvenliği doğrudan bozmaz.
- **Orta:** kenar durum, tutarsızlık, bakım riski.
- **Düşük:** stil, belge uyumsuzluğu.

## Kurallar
- Neden: kanıtsız bulgu zaman kaybettirir. Okumadığın kodla ilgili iddia kurma.
- Emin olmadığın bulguyu "olası" diye işaretle, gizleme.
- Hiçbir kaynak dosyayı değiştirme; sadece `_agents_workspace/` altına yaz.
