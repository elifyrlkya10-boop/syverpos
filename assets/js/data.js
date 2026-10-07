/*
 * SyverPOS menü ve alerjen verisi
 * --------------------------------
 * Bu dosya database/syverpos_db.sql içindeki verinin aynısıdır.
 * SQL'de bir ürün, fiyat ya da alerjen değişirse burayı da güncelle.
 *
 * removable: false → ana malzeme. Bu alerjisi olan kişiye ürün eklenemez.
 * removable: true  → çıkarılabilir. Ürün eklenir, mutfağa "çıkar" notu gider.
 */
window.SyverData = {
  tableCount: 12,

  allergens: [
    { id: 1, name: 'Gluten' },
    { id: 2, name: 'Süt Ürünleri' },
    { id: 3, name: 'Yumurta' },
    { id: 4, name: 'Soya' },
    { id: 5, name: 'Susam' },
    { id: 6, name: 'Balık' },
    { id: 7, name: 'Kabuklu Deniz Canlısı' },
    { id: 8, name: 'Kuruyemiş' },
    { id: 9, name: 'Pirinç' }
  ],

  categories: ['Sushi & deniz', 'Başlangıç', 'Ana yemek', 'Kebap & burger', 'Tatlı'],

  products: [
    { id: 1,  name: 'California Roll',             category: 'Sushi & deniz',  price: 420, allergens: [{ id: 7, removable: false }, { id: 3, removable: false }, { id: 5, removable: true }, { id: 9, removable: false }] },
    { id: 2,  name: 'Teriyaki Somon',              category: 'Sushi & deniz',  price: 540, allergens: [{ id: 6, removable: false }, { id: 4, removable: false }, { id: 5, removable: true }] },
    { id: 9,  name: 'Karides Güveç',               category: 'Sushi & deniz',  price: 620, allergens: [{ id: 7, removable: false }, { id: 2, removable: true }] },

    { id: 8,  name: 'Geleneksel Mercimek Çorbası', category: 'Başlangıç',      price: 190, allergens: [{ id: 1, removable: false }, { id: 2, removable: false }] },
    { id: 11, name: 'Humus (Etli)',                category: 'Başlangıç',      price: 330, allergens: [{ id: 5, removable: false }, { id: 8, removable: true }] },
    { id: 4,  name: 'Sezar Salata',                category: 'Başlangıç',      price: 310, allergens: [{ id: 6, removable: false }, { id: 3, removable: false }, { id: 1, removable: true }, { id: 2, removable: true }] },
    { id: 6,  name: 'Cevizli Gavurdağı Salatası',  category: 'Başlangıç',      price: 285, allergens: [{ id: 8, removable: true }] },

    { id: 3,  name: 'Tavuk Katsu',                 category: 'Ana yemek',      price: 430, allergens: [{ id: 1, removable: false }, { id: 3, removable: false }] },
    { id: 10, name: 'Thai Yeşil Köri Tavuk',       category: 'Ana yemek',      price: 470, allergens: [{ id: 7, removable: false }, { id: 6, removable: false }] },
    { id: 5,  name: 'Kremalı Mantarlı Makarna',    category: 'Ana yemek',      price: 390, allergens: [{ id: 1, removable: false }, { id: 2, removable: false }] },

    { id: 7,  name: 'Et Çökertme Kebabı',          category: 'Kebap & burger', price: 590, allergens: [{ id: 2, removable: false }] },
    { id: 14, name: 'Yoğurtlu Ali Nazik Kebabı',   category: 'Kebap & burger', price: 610, allergens: [{ id: 2, removable: false }] },
    { id: 15, name: 'BBQ Soslu Burger',            category: 'Kebap & burger', price: 450, allergens: [{ id: 1, removable: false }, { id: 4, removable: false }, { id: 2, removable: true }] },
    { id: 12, name: 'Falafel Dürüm',               category: 'Kebap & burger', price: 260, allergens: [{ id: 1, removable: false }, { id: 5, removable: true }] },

    { id: 13, name: 'Çikolatalı Sufle',            category: 'Tatlı',          price: 240, allergens: [{ id: 1, removable: false }, { id: 3, removable: false }, { id: 2, removable: false }, { id: 8, removable: true }] }
  ],

  // Garsonun not penceresindeki hızlı seçimler
  quickNotes: ['Sos ayrı', 'Acısız', 'Wasabi yok', 'Paket']
};
