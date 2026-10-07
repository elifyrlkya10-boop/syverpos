<?php
/*
 * SyverPOS API ortak dosyası
 * --------------------------
 * Veritabanına bağlanır, JSON cevap yardımcılarını ve ekranların
 * kullandığı "durum" verisini oluşturan fonksiyonu içerir.
 */
declare(strict_types=1);

$ayar = require __DIR__ . '/config.php';
date_default_timezone_set($ayar['timezone']);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

// İş kuralı ihlali: kullanıcıya gösterilecek, anlaşılır bir mesaj taşır.
class IsKuraliHatasi extends RuntimeException {}

function cevap(array $veri, int $kod = 200): void
{
    http_response_code($kod);
    echo json_encode($veri, JSON_UNESCAPED_UNICODE);
    exit;
}

function baglan(array $ayar): PDO
{
    $sonHata = null;
    foreach ((array) $ayar['ports'] as $port) {
        try {
            $dsn = "mysql:host={$ayar['host']};port={$port};dbname={$ayar['database']};charset=utf8mb4";
            return new PDO($dsn, $ayar['user'], $ayar['password'], [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
                PDO::ATTR_TIMEOUT            => 3,
            ]);
        } catch (PDOException $e) {
            $sonHata = $e;
        }
    }
    throw $sonHata;
}

try {
    $db = baglan($ayar);
} catch (PDOException $e) {
    cevap([
        'ok'   => false,
        'hata' => "Veritabanına bağlanılamadı. XAMPP'te MySQL'in çalıştığını, syverpos_db.sql dosyasının içe aktarıldığını ve api/config.php ayarlarını kontrol et.",
    ], 500);
}

/* ---------- Küçük yardımcılar ---------- */

function simdi(): string
{
    return date('Y-m-d H:i:s');
}

// Veritabanındaki tarih → ekranların anladığı ISO 8601 (2026-10-07T16:48:00+03:00)
function iso(?string $tarih): ?string
{
    return $tarih === null ? null : (new DateTime($tarih))->format(DATE_ATOM);
}

function surum(PDO $db): int
{
    return (int) $db->query("SELECT deger FROM sistem WHERE anahtar = 'surum'")->fetchColumn();
}

/* ---------- Ekranlara gönderilen durum ---------- */

// Garson ve mutfak ekranı bu tek nesneyle çizilir. Yapısı tarayıcıdaki
// demo modunun localStorage verisiyle birebir aynıdır.
function durumOlustur(PDO $db): array
{
    $masalar = [];
    foreach ($db->query('SELECT id FROM masalar ORDER BY id') as $m) {
        $masalar[(string) $m['id']] = ['id' => (int) $m['id'], 'guests' => [], 'lines' => []];
    }

    $alerjiler = [];
    foreach ($db->query('SELECT misafir_id, alerjen_id FROM misafir_alerjen ORDER BY alerjen_id') as $r) {
        $alerjiler[$r['misafir_id']][] = (int) $r['alerjen_id'];
    }

    foreach ($db->query('SELECT id, masa_id, ad FROM misafirler ORDER BY masa_id, sira') as $k) {
        $masalar[(string) $k['masa_id']]['guests'][] = [
            'id'        => (string) $k['id'],
            'name'      => $k['ad'],
            'allergies' => $alerjiler[$k['id']] ?? [],
        ];
    }

    $durumlar = ['yeni' => 'new', 'mutfakta' => 'sent', 'hazir' => 'ready'];
    foreach ($db->query('SELECT id, masa_id, misafir_id, urun_id, adet, notlar, durum, fis_id FROM siparisler ORDER BY id') as $s) {
        $masalar[(string) $s['masa_id']]['lines'][] = [
            'id'        => (string) $s['id'],
            'productId' => (int) $s['urun_id'],
            'guestId'   => (string) $s['misafir_id'],
            'qty'       => (int) $s['adet'],
            'note'      => $s['notlar'],
            'status'    => $durumlar[$s['durum']],
            'ticketId'  => $s['fis_id'] === null ? null : (int) $s['fis_id'],
        ];
    }

    $fisler = [];
    foreach ($db->query('SELECT id, masa_id, durum, gonderim, hazir_zamani FROM mutfak_fisleri ORDER BY id') as $f) {
        $fisler[$f['id']] = [
            'id'      => (int) $f['id'],
            'tableId' => (int) $f['masa_id'],
            'sentAt'  => iso($f['gonderim']),
            'readyAt' => iso($f['hazir_zamani']),
            'status'  => $f['durum'] === 'hazir' ? 'ready' : 'waiting',
            'items'   => [],
        ];
    }
    foreach ($db->query('SELECT fis_id, siparis_id, urun_adi, adet, misafir_adi, alerjenler, cikarilacaklar, notlar FROM fis_kalemleri ORDER BY id') as $k) {
        if (!isset($fisler[$k['fis_id']])) continue;
        $fisler[$k['fis_id']]['items'][] = [
            'lineId'    => (string) $k['siparis_id'],
            'name'      => $k['urun_adi'],
            'qty'       => (int) $k['adet'],
            'guest'     => $k['misafir_adi'],
            'allergies' => json_decode($k['alerjenler'], true) ?: [],
            'remove'    => json_decode($k['cikarilacaklar'], true) ?: [],
            'note'      => $k['notlar'],
        ];
    }

    $bildirimler = [];
    foreach ($db->query('SELECT id, masa_id, fis_id, zaman, goruldu FROM bildirimler ORDER BY id') as $b) {
        $bildirimler[] = [
            'id'       => (string) $b['id'],
            'tableId'  => (int) $b['masa_id'],
            'ticketId' => (int) $b['fis_id'],
            'at'       => iso($b['zaman']),
            'seen'     => (bool) $b['goruldu'],
        ];
    }

    return [
        'v'       => 2,
        'tables'  => (object) $masalar,
        'tickets' => array_values($fisler),
        'notices' => $bildirimler,
    ];
}
