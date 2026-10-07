-- ============================================================
-- SyverPOS veritabanı
-- MariaDB 10.11 ile test edildi. XAMPP'teki MariaDB 10.4 ve MySQL 8 ile de uyumlu.
--
-- İçe aktarma:
--   phpMyAdmin → İçe Aktar → bu dosyayı seç
--   ya da terminalden:  mysql -u root -p < syverpos_db.sql
--
-- DİKKAT: Dosya veritabanını sıfırdan kurar. Var olan SyverPOS
-- tabloları silinir ve örnek veriyle yeniden oluşturulur.
--
-- Tablolar iki gruba ayrılır:
--   Menü:     kategoriler, urunler, alerjenler, urun_alerjen
--   Servis:   masalar, misafirler, misafir_alerjen, siparisler,
--             mutfak_fisleri, fis_kalemleri, bildirimler,
--             kapanan_hesaplar, sistem
-- ============================================================

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
SET NAMES utf8mb4;

CREATE DATABASE IF NOT EXISTS `syverpos_db`
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
USE `syverpos_db`;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS `sistem`, `kapanan_hesaplar`, `bildirimler`, `fis_kalemleri`,
  `mutfak_fisleri`, `siparisler`, `misafir_alerjen`, `misafirler`, `masalar`,
  `urun_alerjen`, `urunler`, `kategoriler`, `alerjenler`;
SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- MENÜ
-- ============================================================

CREATE TABLE `alerjenler` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `ad` VARCHAR(50) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_alerjen_ad` (`ad`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `alerjenler` (`id`, `ad`) VALUES
(1, 'Gluten'),
(2, 'Süt Ürünleri'),
(3, 'Yumurta'),
(4, 'Soya'),
(5, 'Susam'),
(6, 'Balık'),
(7, 'Kabuklu Deniz Canlısı'),
(8, 'Kuruyemiş'),
(9, 'Pirinç');

CREATE TABLE `kategoriler` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `ad` VARCHAR(50) NOT NULL,
  `sira` INT NOT NULL DEFAULT 0 COMMENT 'Menüde görünme sırası',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_kategori_ad` (`ad`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `kategoriler` (`id`, `ad`, `sira`) VALUES
(1, 'Sushi & deniz', 1),
(2, 'Başlangıç', 2),
(3, 'Ana yemek', 3),
(4, 'Kebap & burger', 4),
(5, 'Tatlı', 5);

CREATE TABLE `urunler` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `ad` VARCHAR(100) NOT NULL,
  `kategori_id` INT NOT NULL,
  `fiyat` DECIMAL(10,2) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_urun_kategori` (`kategori_id`),
  CONSTRAINT `fk_urun_kategori` FOREIGN KEY (`kategori_id`) REFERENCES `kategoriler` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `urunler` (`id`, `ad`, `kategori_id`, `fiyat`) VALUES
(1,  'California Roll',             1, 420.00),
(2,  'Teriyaki Somon',              1, 540.00),
(3,  'Tavuk Katsu',                 3, 430.00),
(4,  'Sezar Salata',                2, 310.00),
(5,  'Kremalı Mantarlı Makarna',    3, 390.00),
(6,  'Cevizli Gavurdağı Salatası',  2, 285.00),
(7,  'Et Çökertme Kebabı',          4, 590.00),
(8,  'Geleneksel Mercimek Çorbası', 2, 190.00),
(9,  'Karides Güveç',               1, 620.00),
(10, 'Thai Yeşil Köri Tavuk',       3, 470.00),
(11, 'Humus (Etli)',                2, 330.00),
(12, 'Falafel Dürüm',               4, 260.00),
(13, 'Çikolatalı Sufle',            5, 240.00),
(14, 'Yoğurtlu Ali Nazik Kebabı',   4, 610.00),
(15, 'BBQ Soslu Burger',            4, 450.00);

-- cikarilabilir = 0 → ana malzeme: bu alerjisi olan kişiye ürün verilmez
-- cikarilabilir = 1 → çıkarılabilir: ürün verilir, mutfağa "çıkar" notu gider
CREATE TABLE `urun_alerjen` (
  `urun_id` INT NOT NULL,
  `alerjen_id` INT NOT NULL,
  `cikarilabilir` TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`urun_id`, `alerjen_id`),
  KEY `idx_ua_alerjen` (`alerjen_id`),
  CONSTRAINT `fk_ua_urun` FOREIGN KEY (`urun_id`) REFERENCES `urunler` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ua_alerjen` FOREIGN KEY (`alerjen_id`) REFERENCES `alerjenler` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `urun_alerjen` (`urun_id`, `alerjen_id`, `cikarilabilir`) VALUES
(1, 7, 0), (1, 3, 0), (1, 5, 1), (1, 9, 0),
(2, 6, 0), (2, 4, 0), (2, 5, 1),
(3, 1, 0), (3, 3, 0),
(4, 6, 0), (4, 3, 0), (4, 1, 1), (4, 2, 1),
(5, 1, 0), (5, 2, 0),
(6, 8, 1),
(7, 2, 0),
(8, 1, 0), (8, 2, 0),
(9, 7, 0), (9, 2, 1),
(10, 7, 0), (10, 6, 0),
(11, 5, 0), (11, 8, 1),
(12, 1, 0), (12, 5, 1),
(13, 1, 0), (13, 3, 0), (13, 2, 0), (13, 8, 1),
(14, 2, 0),
(15, 1, 0), (15, 4, 0), (15, 2, 1);

-- ============================================================
-- SERVİS
-- ============================================================

CREATE TABLE `masalar` (
  `id` INT NOT NULL,
  `ad` VARCHAR(30) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `masalar` (`id`, `ad`) VALUES
(1, 'Masa 1'), (2, 'Masa 2'), (3, 'Masa 3'), (4, 'Masa 4'),
(5, 'Masa 5'), (6, 'Masa 6'), (7, 'Masa 7'), (8, 'Masa 8'),
(9, 'Masa 9'), (10, 'Masa 10'), (11, 'Masa 11'), (12, 'Masa 12');

-- Masadaki kişiler (Kişi 1, Kişi 2 ...). sira, "Kişi N" içindeki N'dir.
CREATE TABLE `misafirler` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `masa_id` INT NOT NULL,
  `ad` VARCHAR(30) NOT NULL,
  `sira` INT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_masa_sira` (`masa_id`, `sira`),
  CONSTRAINT `fk_misafir_masa` FOREIGN KEY (`masa_id`) REFERENCES `masalar` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Her masaya başlangıçta iki kişi
INSERT INTO `misafirler` (`masa_id`, `ad`, `sira`)
SELECT `id`, 'Kişi 1', 1 FROM `masalar`
UNION ALL
SELECT `id`, 'Kişi 2', 2 FROM `masalar`;

CREATE TABLE `misafir_alerjen` (
  `misafir_id` INT NOT NULL,
  `alerjen_id` INT NOT NULL,
  PRIMARY KEY (`misafir_id`, `alerjen_id`),
  CONSTRAINT `fk_ma_misafir` FOREIGN KEY (`misafir_id`) REFERENCES `misafirler` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ma_alerjen` FOREIGN KEY (`alerjen_id`) REFERENCES `alerjenler` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Mutfağa giden her gönderim bir fiştir
CREATE TABLE `mutfak_fisleri` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `masa_id` INT NOT NULL,
  `durum` ENUM('bekliyor', 'hazir') NOT NULL DEFAULT 'bekliyor',
  `gonderim` DATETIME NOT NULL,
  `hazir_zamani` DATETIME DEFAULT NULL,
  `alerjen_kontrol` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Aşçı alerjen kontrolünü onayladı mı',
  PRIMARY KEY (`id`),
  KEY `idx_fis_masa_durum` (`masa_id`, `durum`),
  CONSTRAINT `fk_fis_masa` FOREIGN KEY (`masa_id`) REFERENCES `masalar` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Adisyon satırları. durum: yeni → mutfakta → hazir
-- misafir_id kısıtı ON DELETE RESTRICT: siparişi olan kişi silinemez.
CREATE TABLE `siparisler` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `masa_id` INT NOT NULL,
  `misafir_id` INT NOT NULL,
  `urun_id` INT NOT NULL,
  `adet` INT NOT NULL DEFAULT 1,
  `notlar` VARCHAR(120) NOT NULL DEFAULT '',
  `durum` ENUM('yeni', 'mutfakta', 'hazir') NOT NULL DEFAULT 'yeni',
  `fis_id` INT DEFAULT NULL,
  `olusturma` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_siparis_masa` (`masa_id`, `durum`),
  CONSTRAINT `fk_siparis_masa` FOREIGN KEY (`masa_id`) REFERENCES `masalar` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_siparis_misafir` FOREIGN KEY (`misafir_id`) REFERENCES `misafirler` (`id`),
  CONSTRAINT `fk_siparis_urun` FOREIGN KEY (`urun_id`) REFERENCES `urunler` (`id`),
  CONSTRAINT `fk_siparis_fis` FOREIGN KEY (`fis_id`) REFERENCES `mutfak_fisleri` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Fişin içeriği. Gönderim anındaki bilgiyi saklar: sonradan kişi adı ya da
-- alerjisi değişse bile mutfağa ne söylendiği kayıtta kalır.
-- alerjenler ve cikarilacaklar JSON dizi olarak tutulur: ["Soya","Susam"]
CREATE TABLE `fis_kalemleri` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `fis_id` INT NOT NULL,
  `siparis_id` INT NOT NULL,
  `urun_adi` VARCHAR(100) NOT NULL,
  `adet` INT NOT NULL,
  `misafir_adi` VARCHAR(30) NOT NULL,
  `alerjenler` VARCHAR(500) NOT NULL DEFAULT '[]',
  `cikarilacaklar` VARCHAR(500) NOT NULL DEFAULT '[]',
  `notlar` VARCHAR(120) NOT NULL DEFAULT '',
  PRIMARY KEY (`id`),
  KEY `idx_kalem_fis` (`fis_id`),
  CONSTRAINT `fk_kalem_fis` FOREIGN KEY (`fis_id`) REFERENCES `mutfak_fisleri` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- "Masa 3 siparişi hazır" bildirimleri
CREATE TABLE `bildirimler` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `masa_id` INT NOT NULL,
  `fis_id` INT NOT NULL,
  `zaman` DATETIME NOT NULL,
  `goruldu` TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_bildirim_masa` FOREIGN KEY (`masa_id`) REFERENCES `masalar` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_bildirim_fis` FOREIGN KEY (`fis_id`) REFERENCES `mutfak_fisleri` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Kapatılan her masanın hesabı (günlük satış raporu için)
CREATE TABLE `kapanan_hesaplar` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `masa_id` INT NOT NULL,
  `urun_adedi` INT NOT NULL,
  `toplam` DECIMAL(10,2) NOT NULL,
  `kapanis` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_hesap_kapanis` (`kapanis`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sürüm sayacı: her değişiklikte 1 artar. Ekranlar bu sayıya bakarak
-- yeni veri olup olmadığını anlar.
CREATE TABLE `sistem` (
  `anahtar` VARCHAR(30) NOT NULL,
  `deger` BIGINT NOT NULL,
  PRIMARY KEY (`anahtar`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `sistem` (`anahtar`, `deger`) VALUES ('surum', 1);

-- ============================================================
-- Örnek sorgular
-- ============================================================

-- 1) Soya (4) ve Susam (5) alerjisi olan bir misafir için hangi ürünler
--    engellenir, hangilerinden malzeme çıkarılır?
-- SELECT u.ad AS urun,
--        a.ad AS alerjen,
--        IF(ua.cikarilabilir = 1, 'Çıkarılarak verilir', 'Verilemez') AS sonuc
-- FROM urun_alerjen ua
-- JOIN urunler u    ON u.id = ua.urun_id
-- JOIN alerjenler a ON a.id = ua.alerjen_id
-- WHERE ua.alerjen_id IN (4, 5)
-- ORDER BY sonuc DESC, u.ad;

-- 2) Bugünkü satış
-- SELECT COUNT(*) AS masa, SUM(urun_adedi) AS urun, SUM(toplam) AS ciro
-- FROM kapanan_hesaplar
-- WHERE DATE(kapanis) = CURDATE();

-- 3) Mutfakta bekleyen alerjenli fişler
-- SELECT f.id, m.ad AS masa, k.misafir_adi, k.urun_adi, k.alerjenler
-- FROM mutfak_fisleri f
-- JOIN masalar m       ON m.id = f.masa_id
-- JOIN fis_kalemleri k ON k.fis_id = f.id
-- WHERE f.durum = 'bekliyor' AND k.alerjenler <> '[]';
