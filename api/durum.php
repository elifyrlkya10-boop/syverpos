<?php
/*
 * GET api/durum.php?surum=N
 * Masaların, mutfak fişlerinin ve bildirimlerin güncel hâlini döndürür.
 * Ekranlar elindeki sürüm numarasını gönderir; değişiklik yoksa sadece
 * {"degismedi": true} döner, böylece her saniye büyük veri taşınmaz.
 */
require __DIR__ . '/db.php';

$istenen = isset($_GET['surum']) ? (int) $_GET['surum'] : -1;

$db->beginTransaction(); // sürüm ve veri aynı anın görüntüsü olsun
$surum = surum($db);
if ($istenen === $surum) {
    $db->commit();
    cevap(['ok' => true, 'degismedi' => true, 'surum' => $surum]);
}
$durum = durumOlustur($db);
$db->commit();

cevap(['ok' => true, 'surum' => $surum, 'durum' => $durum]);
