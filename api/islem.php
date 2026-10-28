<?php
/*
 * POST api/islem.php
 * Gövde: {"islem": "urun_ekle", "veri": {"masa": 3, "kisi": "12", "urun": 1}}
 *
 * Ekranların yaptığı her değişiklik buradan geçer. Alerjen kuralları burada da
 * kontrol edilir: tarayıcıdaki kontrol atlatılsa bile alerjene uygun olmayan
 * ürün adisyona eklenemez ve mutfağa gönderilemez.
 *
 * Başarılı cevap: {"ok": true, "sonuc": {...}, "surum": 42, "durum": {...}}
 * Kural ihlali:   {"ok": false, "hata": "Anlaşılır mesaj"}  (HTTP 409)
 */
require __DIR__ . '/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    cevap(['ok' => false, 'hata' => 'Bu adres POST ile çağrılmalı.'], 405);
}

$girdi = json_decode((string) file_get_contents('php://input'), true);
$islem = is_array($girdi) ? (string) ($girdi['islem'] ?? '') : '';
$veri  = is_array($girdi) && is_array($girdi['veri'] ?? null) ? $girdi['veri'] : [];

/* ---------- Doğrulama ve sorgu yardımcıları ---------- */

function sayi(array $veri, string $alan): int
{
    if (!isset($veri[$alan]) || !is_numeric($veri[$alan])) {
        throw new IsKuraliHatasi("Eksik ya da hatalı bilgi: {$alan}");
    }
    return (int) $veri[$alan];
}

function tekSatir(PDO $db, string $sql, array $parametreler): ?array
{
    $sorgu = $db->prepare($sql);
    $sorgu->execute($parametreler);
    $satir = $sorgu->fetch();
    return $satir === false ? null : $satir;
}

function calistir(PDO $db, string $sql, array $parametreler = []): int
{
    $sorgu = $db->prepare($sql);
    $sorgu->execute($parametreler);
    return $sorgu->rowCount();
}

function masaKontrol(PDO $db, int $masa): void
{
    if (!tekSatir($db, 'SELECT id FROM masalar WHERE id = ?', [$masa])) {
        throw new IsKuraliHatasi('Masa bulunamadı.');
    }
}

function misafirBul(PDO $db, int $masa, int $kisi): array
{
    $misafir = tekSatir($db, 'SELECT id, ad, sira FROM misafirler WHERE id = ? AND masa_id = ?', [$kisi, $masa]);
    if (!$misafir) {
        throw new IsKuraliHatasi('Kişi bulunamadı. Ekran güncel olmayabilir, sayfayı yenile.');
    }
    return $misafir;
}

function misafirAlerjileri(PDO $db, int $kisi): array
{
    $sorgu = $db->prepare('SELECT alerjen_id FROM misafir_alerjen WHERE misafir_id = ? ORDER BY alerjen_id');
    $sorgu->execute([$kisi]);
    return array_map('intval', $sorgu->fetchAll(PDO::FETCH_COLUMN));
}

// Ürünün, verilen alerjilere göre durumu (assets/js/common.js → risk ile aynı mantık)
function urunRiski(PDO $db, int $urun, array $alerjiler): array
{
    $sonuc = ['engel' => [], 'cikar' => []];
    if (!$alerjiler) return $sonuc;
    $sorgu = $db->prepare('SELECT alerjen_id, cikarilabilir FROM urun_alerjen WHERE urun_id = ?');
    $sorgu->execute([$urun]);
    foreach ($sorgu as $r) {
        if (!in_array((int) $r['alerjen_id'], $alerjiler, true)) continue;
        $sonuc[$r['cikarilabilir'] ? 'cikar' : 'engel'][] = (int) $r['alerjen_id'];
    }
    return $sonuc;
}

function alerjenAdlari(PDO $db, array $idler): array
{
    if (!$idler) return [];
    $adlar = $db->query('SELECT id, ad FROM alerjenler')->fetchAll(PDO::FETCH_KEY_PAIR);
    return array_map(fn ($id) => $adlar[$id] ?? "Alerjen {$id}", $idler);
}

function varsayilanMisafirler(PDO $db, int $masa): void
{
    calistir($db, "INSERT INTO misafirler (masa_id, ad, sira) VALUES (?, 'Kişi 1', 1), (?, 'Kişi 2', 2)", [$masa, $masa]);
}

/* ---------- İşlemler ---------- */

/**
 * Kişinin alerjileri değişince, mutfakta bekleyen satırlarının fiş kalemlerini günceller.
 * Böylece mutfak ekranı sonradan işaretlenen alerjiyi görür ve "hazır" kapısı onay ister.
 */
function fisAlerjileriniGuncelle(PDO $db, int $misafirId): void
{
    $satirlar = $db->prepare("SELECT id, urun_id FROM siparisler WHERE misafir_id = ? AND durum = 'mutfakta'");
    $satirlar->execute([$misafirId]);
    $alerjiler = misafirAlerjileri($db, $misafirId);
    foreach ($satirlar->fetchAll() as $s) {
        $risk = urunRiski($db, (int) $s['urun_id'], $alerjiler);
        calistir($db, 'UPDATE fis_kalemleri SET alerjenler = ?, cikarilacaklar = ? WHERE siparis_id = ?', [
            json_encode(alerjenAdlari($db, $alerjiler), JSON_UNESCAPED_UNICODE),
            json_encode(alerjenAdlari($db, $risk['cikar']), JSON_UNESCAPED_UNICODE),
            $s['id'],
        ]);
    }
}

$islemler = [

    'kisi_ekle' => function (PDO $db, array $v): array {
        $masa = sayi($v, 'masa');
        masaKontrol($db, $masa);
        $sorgu = $db->prepare('SELECT sira FROM misafirler WHERE masa_id = ?');
        $sorgu->execute([$masa]);
        $dolu = array_map('intval', $sorgu->fetchAll(PDO::FETCH_COLUMN));
        $n = 1;
        while (in_array($n, $dolu, true)) $n++;
        calistir($db, 'INSERT INTO misafirler (masa_id, ad, sira) VALUES (?, ?, ?)', [$masa, "Kişi {$n}", $n]);
        return ['kisiId' => (string) $db->lastInsertId()];
    },

    'kisi_sil' => function (PDO $db, array $v): array {
        $masa = sayi($v, 'masa');
        $misafir = misafirBul($db, $masa, sayi($v, 'kisi'));
        $sayi = (int) tekSatir($db, 'SELECT COUNT(*) AS n FROM misafirler WHERE masa_id = ?', [$masa])['n'];
        if ($sayi <= 1) {
            throw new IsKuraliHatasi('Masada en az bir kişi kalmalı.');
        }
        if (tekSatir($db, 'SELECT id FROM siparisler WHERE misafir_id = ? LIMIT 1', [$misafir['id']])) {
            throw new IsKuraliHatasi("{$misafir['ad']} için adisyonda ürün var. Yanlış kişiye eklendiyse önce o satırları sil.");
        }
        calistir($db, 'DELETE FROM misafirler WHERE id = ?', [$misafir['id']]);
        return [];
    },

    // Hedef durum açıkça gönderilir (acik: true/false). İşlem tekrarlanırsa sonuç değişmez.
    'alerji_degistir' => function (PDO $db, array $v): array {
        $misafir = misafirBul($db, sayi($v, 'masa'), sayi($v, 'kisi'));
        $alerjen = sayi($v, 'alerjen');
        if (!is_bool($v['acik'] ?? null)) {
            throw new IsKuraliHatasi('Eksik ya da hatalı bilgi: acik');
        }
        if (!tekSatir($db, 'SELECT id FROM alerjenler WHERE id = ?', [$alerjen])) {
            throw new IsKuraliHatasi('Alerjen bulunamadı.');
        }
        if ($v['acik']) {
            calistir($db, 'INSERT IGNORE INTO misafir_alerjen (misafir_id, alerjen_id) VALUES (?, ?)', [$misafir['id'], $alerjen]);
        } else {
            calistir($db, 'DELETE FROM misafir_alerjen WHERE misafir_id = ? AND alerjen_id = ?', [$misafir['id'], $alerjen]);
        }
        fisAlerjileriniGuncelle($db, (int) $misafir['id']);
        return [];
    },

    'urun_ekle' => function (PDO $db, array $v): array {
        $masa = sayi($v, 'masa');
        $misafir = misafirBul($db, $masa, sayi($v, 'kisi'));
        $urunId = sayi($v, 'urun');
        $urun = tekSatir($db, 'SELECT id, ad FROM urunler WHERE id = ?', [$urunId]);
        if (!$urun) {
            throw new IsKuraliHatasi('Ürün bulunamadı.');
        }
        $risk = urunRiski($db, $urunId, misafirAlerjileri($db, (int) $misafir['id']));
        if ($risk['engel']) {
            $adlar = implode(', ', alerjenAdlari($db, $risk['engel']));
            throw new IsKuraliHatasi("Bu ürünün ana malzemesine alerjiniz olduğundan başka bir öğün tercih ediniz :) ({$urun['ad']}: {$adlar} ana malzemede.)");
        }
        // Aynı kişiye aynı ürün tekrar eklenirse yeni satır açmak yerine adedi artır
        $ayni = tekSatir($db,
            "SELECT id FROM siparisler WHERE masa_id = ? AND misafir_id = ? AND urun_id = ? AND durum = 'yeni' AND notlar = '' LIMIT 1",
            [$masa, $misafir['id'], $urunId]);
        if ($ayni) {
            calistir($db, 'UPDATE siparisler SET adet = adet + 1 WHERE id = ?', [$ayni['id']]);
            return ['satirId' => (string) $ayni['id']];
        }
        calistir($db, 'INSERT INTO siparisler (masa_id, misafir_id, urun_id, adet, durum, olusturma) VALUES (?, ?, ?, 1, \'yeni\', ?)',
            [$masa, $misafir['id'], $urunId, simdi()]);
        return ['satirId' => (string) $db->lastInsertId()];
    },

    'adet_degistir' => function (PDO $db, array $v): array {
        $masa = sayi($v, 'masa');
        $satir = tekSatir($db, "SELECT id, adet FROM siparisler WHERE id = ? AND masa_id = ? AND durum = 'yeni'", [sayi($v, 'satir'), $masa]);
        if (!$satir) {
            throw new IsKuraliHatasi('Bu satır mutfağa gönderilmiş, artık değiştirilemez.');
        }
        $yeni = (int) $satir['adet'] + max(-1, min(1, sayi($v, 'fark')));
        if ($yeni <= 0) calistir($db, 'DELETE FROM siparisler WHERE id = ?', [$satir['id']]);
        else calistir($db, 'UPDATE siparisler SET adet = ? WHERE id = ?', [$yeni, $satir['id']]);
        return [];
    },

    'satir_sil' => function (PDO $db, array $v): array {
        calistir($db, "DELETE FROM siparisler WHERE id = ? AND masa_id = ? AND durum = 'yeni'", [sayi($v, 'satir'), sayi($v, 'masa')]);
        return [];
    },

    'not_kaydet' => function (PDO $db, array $v): array {
        $not = mb_substr(trim((string) ($v['not'] ?? '')), 0, 120);
        calistir($db, "UPDATE siparisler SET notlar = ? WHERE id = ? AND masa_id = ? AND durum = 'yeni'", [$not, sayi($v, 'satir'), sayi($v, 'masa')]);
        return [];
    },

    'mutfaga_gonder' => function (PDO $db, array $v): array {
        $masa = sayi($v, 'masa');
        masaKontrol($db, $masa);
        $sorgu = $db->prepare(
            "SELECT s.id, s.misafir_id, s.urun_id, s.adet, s.notlar, m.ad AS misafir_adi, u.ad AS urun_adi
             FROM siparisler s
             JOIN misafirler m ON m.id = s.misafir_id
             JOIN urunler u    ON u.id = s.urun_id
             WHERE s.masa_id = ? AND s.durum = 'yeni'
             ORDER BY m.sira, s.id
             FOR UPDATE");
        $sorgu->execute([$masa]);
        $satirlar = $sorgu->fetchAll();
        if (!$satirlar) {
            throw new IsKuraliHatasi('Gönderilecek yeni ürün yok.');
        }

        // Alerji ürün eklendikten sonra işaretlenmiş olabilir: her satırı yeniden kontrol et
        $kalemler = [];
        $uygunsuz = [];
        foreach ($satirlar as $s) {
            $alerjiler = misafirAlerjileri($db, (int) $s['misafir_id']);
            $risk = urunRiski($db, (int) $s['urun_id'], $alerjiler);
            if ($risk['engel']) {
                $uygunsuz[] = "{$s['misafir_adi']}: {$s['urun_adi']} (" . implode(', ', alerjenAdlari($db, $risk['engel'])) . ' ana malzemede)';
            }
            $kalemler[] = [$s, alerjenAdlari($db, $alerjiler), alerjenAdlari($db, $risk['cikar'])];
        }
        if ($uygunsuz) {
            throw new IsKuraliHatasi('Bu ürünler kişinin alerjisine uygun değil, adisyondan silip yeniden gönder: ' . implode('; ', $uygunsuz));
        }

        calistir($db, "INSERT INTO mutfak_fisleri (masa_id, durum, gonderim) VALUES (?, 'bekliyor', ?)", [$masa, simdi()]);
        $fisId = (int) $db->lastInsertId();
        $ekle = $db->prepare(
            'INSERT INTO fis_kalemleri (fis_id, siparis_id, urun_adi, adet, misafir_adi, alerjenler, cikarilacaklar, notlar)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        foreach ($kalemler as [$s, $alerjiAdlari, $cikarAdlari]) {
            $ekle->execute([
                $fisId, $s['id'], $s['urun_adi'], $s['adet'], $s['misafir_adi'],
                json_encode($alerjiAdlari, JSON_UNESCAPED_UNICODE),
                json_encode($cikarAdlari, JSON_UNESCAPED_UNICODE),
                $s['notlar'],
            ]);
            calistir($db, "UPDATE siparisler SET durum = 'mutfakta', fis_id = ? WHERE id = ?", [$fisId, $s['id']]);
        }
        return ['fisId' => $fisId];
    },

    'masa_kapat' => function (PDO $db, array $v): array {
        $masa = sayi($v, 'masa');
        masaKontrol($db, $masa);
        if (tekSatir($db, "SELECT id FROM mutfak_fisleri WHERE masa_id = ? AND durum = 'bekliyor' LIMIT 1", [$masa])) {
            throw new IsKuraliHatasi('Mutfakta hazırlanan sipariş var. Mutfak "hazır" dedikten sonra masayı kapatabilirsin.');
        }
        $hesap = tekSatir($db,
            'SELECT COALESCE(SUM(s.adet), 0) AS adet, COALESCE(SUM(s.adet * u.fiyat), 0) AS toplam
             FROM siparisler s JOIN urunler u ON u.id = s.urun_id WHERE s.masa_id = ?', [$masa]);
        if ((int) $hesap['adet'] > 0) {
            calistir($db, 'INSERT INTO kapanan_hesaplar (masa_id, urun_adedi, toplam, kapanis) VALUES (?, ?, ?, ?)',
                [$masa, $hesap['adet'], $hesap['toplam'], simdi()]);
        }
        calistir($db, 'DELETE FROM siparisler WHERE masa_id = ?', [$masa]);
        calistir($db, 'DELETE FROM mutfak_fisleri WHERE masa_id = ?', [$masa]); // kalemler ve bildirimler de silinir
        calistir($db, 'DELETE FROM misafirler WHERE masa_id = ?', [$masa]);     // alerjiler de silinir
        varsayilanMisafirler($db, $masa);
        return ['toplam' => (float) $hesap['toplam']];
    },

    'bildirim_goruldu' => function (PDO $db, array $v): array {
        calistir($db, 'UPDATE bildirimler SET goruldu = 1 WHERE id = ?', [sayi($v, 'bildirim')]);
        return [];
    },

    'masa_bildirimleri_goruldu' => function (PDO $db, array $v): array {
        calistir($db, 'UPDATE bildirimler SET goruldu = 1 WHERE masa_id = ? AND goruldu = 0', [sayi($v, 'masa')]);
        return [];
    },

    'hazir' => function (PDO $db, array $v): array {
        $fisId = sayi($v, 'fis');
        $fis = tekSatir($db, "SELECT id, masa_id FROM mutfak_fisleri WHERE id = ? AND durum = 'bekliyor' FOR UPDATE", [$fisId]);
        if (!$fis) {
            throw new IsKuraliHatasi('Bu fiş zaten hazır ya da masa kapatılmış.');
        }
        // Fiş kalemlerine ek olarak kişilerin şu anki alerjilerine de bak
        $alerjenli = tekSatir($db, "SELECT id FROM fis_kalemleri WHERE fis_id = ? AND alerjenler <> '[]' LIMIT 1", [$fisId])
            ?: tekSatir($db, 'SELECT ma.misafir_id FROM siparisler s JOIN misafir_alerjen ma ON ma.misafir_id = s.misafir_id WHERE s.fis_id = ? LIMIT 1', [$fisId]);
        if ($alerjenli && ($v['kontrol'] ?? null) !== true) {
            throw new IsKuraliHatasi('Alerjenli fiş, alerjen kontrolü onaylanmadan hazır yapılamaz.');
        }
        $zaman = simdi();
        calistir($db, "UPDATE mutfak_fisleri SET durum = 'hazir', hazir_zamani = ?, alerjen_kontrol = ? WHERE id = ?",
            [$zaman, $alerjenli ? 1 : 0, $fisId]);
        calistir($db, "UPDATE siparisler SET durum = 'hazir' WHERE fis_id = ?", [$fisId]);
        calistir($db, 'INSERT INTO bildirimler (masa_id, fis_id, zaman) VALUES (?, ?, ?)', [$fis['masa_id'], $fisId, $zaman]);
        return [];
    },

    'hazir_geri_al' => function (PDO $db, array $v): array {
        $fisId = sayi($v, 'fis');
        $guncellenen = calistir($db,
            "UPDATE mutfak_fisleri SET durum = 'bekliyor', hazir_zamani = NULL, alerjen_kontrol = 0 WHERE id = ? AND durum = 'hazir'", [$fisId]);
        if ($guncellenen === 0) {
            throw new IsKuraliHatasi('Bu fiş geri alınamaz. Masa kapatılmış olabilir.');
        }
        calistir($db, "UPDATE siparisler SET durum = 'mutfakta' WHERE fis_id = ?", [$fisId]);
        calistir($db, 'DELETE FROM bildirimler WHERE fis_id = ?', [$fisId]);
        return [];
    },

    'sifirla' => function (PDO $db, array $v): array {
        $db->exec('DELETE FROM siparisler');
        $db->exec('DELETE FROM mutfak_fisleri');
        $db->exec('DELETE FROM misafirler');
        foreach ($db->query('SELECT id FROM masalar')->fetchAll(PDO::FETCH_COLUMN) as $masa) {
            varsayilanMisafirler($db, (int) $masa);
        }
        return [];
    },
];

if (!isset($islemler[$islem])) {
    cevap(['ok' => false, 'hata' => "Bilinmeyen işlem: {$islem}"], 400);
}

/* ---------- Çalıştır ---------- */

try {
    $db->beginTransaction();
    // Sürümü en başta artırmak satırı kilitler: aynı anda gelen iki işlem
    // sırayla çalışır, biri diğerinin kontrolünü atlatamaz.
    $db->exec("UPDATE sistem SET deger = deger + 1 WHERE anahtar = 'surum'");
    $sonuc = $islemler[$islem]($db, $veri);
    $db->commit();
} catch (IsKuraliHatasi $e) {
    $db->rollBack();
    cevap(['ok' => false, 'hata' => $e->getMessage()], 409);
} catch (Throwable $e) {
    if ($db->inTransaction()) $db->rollBack();
    error_log('SyverPOS: ' . $e->getMessage());
    cevap(['ok' => false, 'hata' => 'Sunucuda beklenmeyen bir hata oldu. Ayrıntı PHP hata kaydında.'], 500);
}

$db->beginTransaction();
$surum = surum($db);
$durum = durumOlustur($db);
$db->commit();

cevap(['ok' => true, 'sonuc' => $sonuc, 'surum' => $surum, 'durum' => $durum]);
