<?php
/*
 * GET api/menu.php
 * Menüyü, alerjenleri ve masa sayısını veritabanından okur.
 * Sunucu modunda ekranlar assets/js/data.js yerine bunu kullanır;
 * phpMyAdmin'den bir fiyatı değiştirince ekranda da değişir.
 */
require __DIR__ . '/db.php';

$alerjenler = array_map(
    fn ($a) => ['id' => (int) $a['id'], 'name' => $a['ad']],
    $db->query('SELECT id, ad FROM alerjenler ORDER BY id')->fetchAll()
);

$kategoriler = $db->query('SELECT ad FROM kategoriler ORDER BY sira, id')->fetchAll(PDO::FETCH_COLUMN);

$iliskiler = [];
foreach ($db->query('SELECT urun_id, alerjen_id, cikarilabilir FROM urun_alerjen ORDER BY urun_id, cikarilabilir, alerjen_id') as $r) {
    $iliskiler[$r['urun_id']][] = ['id' => (int) $r['alerjen_id'], 'removable' => (bool) $r['cikarilabilir']];
}

$urunler = [];
$sorgu = 'SELECT u.id, u.ad, k.ad AS kategori, u.fiyat
          FROM urunler u JOIN kategoriler k ON k.id = u.kategori_id
          ORDER BY k.sira, u.id';
foreach ($db->query($sorgu) as $u) {
    $urunler[] = [
        'id'        => (int) $u['id'],
        'name'      => $u['ad'],
        'category'  => $u['kategori'],
        'price'     => (float) $u['fiyat'],
        'allergens' => $iliskiler[$u['id']] ?? [],
    ];
}

cevap([
    'ok'   => true,
    'menu' => [
        'tableCount' => (int) $db->query('SELECT COUNT(*) FROM masalar')->fetchColumn(),
        'allergens'  => $alerjenler,
        'categories' => $kategoriler,
        'products'   => $urunler,
    ],
]);
