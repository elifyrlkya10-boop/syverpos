<?php
/*
 * Veritabanı bağlantı ayarları
 * ----------------------------
 * XAMPP'te varsayılan kullanıcı "root", şifre boştur.
 * MySQL hangi portta çalışıyorsa (XAMPP Control Panel'de görünür) o kullanılır.
 * Listedeki portlar sırayla denenir, ilk bağlanan kullanılır.
 */
return [
    'host'     => '127.0.0.1',
    'ports'    => [3306, 3307],
    'database' => 'syverpos_db',
    'user'     => 'root',
    'password' => '',
    'timezone' => 'Europe/Istanbul',
];
