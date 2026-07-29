FlashCast Önyüz (Frontend)

Bu dizin, FlashCast reklam karar motorunun web arayüzünü içerir. React ve Vite ile geliştirilmiş tek sayfalık bir uygulamadır (SPA). Reklam veren şirketler kampanyalarını buradan yönetir, operatörler ise şirket bazında canlı simülasyonları çalıştırıp analiz grafiklerini buradan izler. Arayüz, Rust ile yazılmış backend'e HTTP ve WebSocket üzerinden bağlanır.


Teknoloji yığını

React 19 ile bileşen tabanlı arayüz kurulur.
Vite 8 geliştirme sunucusu ve üretim derlemesi için kullanılır; sıcak modül değişimi (HMR) sağlar.
react-router-dom 7 istemci tarafı yönlendirmeyi yönetir.
recharts 3 gerçek zamanlı alan grafiklerini (AreaChart) çizer.
Oxlint kod denetimi (lint) için kullanılır.
Ek bir CSS kütüphanesi yoktur; tüm stiller satır içi (inline) stil nesneleri ve tema/tokens.js içindeki tasarım anahtarları ile verilir.


Dizin yapısı

src/main.jsx uygulamanın giriş noktasıdır; React kök bileşenini DOM'a bağlar.

src/App.jsx yönlendirme ve oturum durumunu yönetir. Oturum bilgisi (token, rol, e-posta, id, logo) localStorage içinde flashcast_auth anahtarıyla saklanır, böylece sayfa yenilendiğinde oturum korunur. Rol tabanlı yönlendirme burada yapılır: operator rolü /operator sayfasına, advertiser rolü /advertiser sayfasına gider. Yetkisiz erişimlerde kullanıcı /login sayfasına geri gönderilir.

src/pages/ üç ana ekranı içerir.
  Login.jsx giriş ekranıdır. Ayrıca operatör için şirket (reklam veren) oluşturma ve silme işlemlerini de barındırır.
  AdvertiserDashboard.jsx reklam veren panelidir. Kampanya oluşturma, düzenleme, silme, taslak kaydetme, silinen kampanyayı geri alma (taslaklara döner) ve bütçe ekleme işlemleri buradadır. Ayrıca kampanya başına dinamik hedefleme alanları tanımlanır ve şirketin kendi gerçek zamanlı grafikleri (gösterilen reklam sayısı ve tıklanma oranı) burada gösterilir.
  OperatorDashboard.jsx operatör panelidir. Tüm şirketleri listeler, şirket bazında simülatör sekmeleri sunar ve WebSocket üzerinden gelen canlı karar akışını gösterir. Tüm Şirketler sekmesinde toplu Başlat/Durdur düğmeleri ve harcama grafikleri bulunur.

src/components/ tekrar kullanılabilir arayüz parçalarını içerir. Her bileşen tek bir dosyadadır.
  Düzen ve gösterim: Card, Header, StatBox, Tag, Pill, Chip.
  Form kontrolleri: Input, Select, Btn, Slider, RatioSlider, TriToggle, FieldLabel.
  Özel bileşenler: CampaignFieldsEditor (kampanya başına dinamik hedefleme alanlarını ve her alanın Forced anahtarını düzenler), AudiencePanel (simülasyon için izleyici kitlesi dağılımını ayarlar), Tooltip (parametre açıklamalarını gösteren bilgi baloncuğu), LogoPicker (şirket logosu seçimi), ThemeToggle (açık/koyu tema geçişi).

src/api/ backend ile konuşan tüm çağrıları gruplar. Her dosya bir konu alanını kapsar.
  client.js temel adresleri ve başlıkları tanımlar. API_BASE değeri http://localhost:8000, WebSocket adresi WS_URL ise ws://localhost:8000/ws şeklindedir. authHeader ve jsonHeaders yardımcıları JWT token'ı Authorization başlığına ekler.
  auth.js giriş ve şifre değiştirme.
  campaigns.js kampanya listeleme, oluşturma, güncelleme, silme, geri alma, kalıcı silme (purge) ve bütçe ekleme.
  simulate.js simülasyonu başlatma, durdurma ve durum sorgulama; her çağrı advertiser_id ve click_rate taşır.
  fields.js bir şirketin dinamik alan şemasını getirir.
  analytics.js ClickHouse üzerinden gelen zaman serisi analiz verilerini çeker.
  advertisers.js şirket listeleme, oluşturma, silme ve logo işlemleri.

src/constants/ sabit değerleri tutar. audience.js varsayılan hedefleme, varsayılan izleyici kitlesi, hazır kitle ön ayarları (presets) ve parametre açıklamalarını içerir. logos.js seçilebilir şirket logolarını tutar; anahtarlar backend'deki LOGO_OPTIONS listesiyle eşleşmek zorundadır.

src/theme/tokens.js tüm tasarım anahtarlarını içerir: renk paleti (C), yazı tipleri ve global CSS. Açık ve koyu tema burada tanımlanır.

src/assets/ görselleri (hero görseli ve ikonlar) barındırır.


Backend ile ilişki

Arayüz iki kanaldan backend'e bağlanır. Birincisi normal HTTP istekleridir (giriş, kampanya işlemleri, analiz sorguları). Kimlik doğrulama gereken uçlar, giriş sırasında alınan JWT token'ı Authorization: Bearer <token> başlığıyla gönderir. İkincisi WebSocket bağlantısıdır (ws://localhost:8000/ws): operatör paneli, her reklam kararını (gösterim, tıklama, dolduramama gibi) canlı olarak bu kanaldan alır ve akış kutusunda gösterir. Analiz grafikleri ise belirli aralıklarla /analytics ucunu sorgulayarak güncellenir.

Backend varsayılan olarak http://localhost:8000 adresinde çalışır. Adres değişirse src/api/client.js dosyasındaki API_BASE ve WS_URL güncellenmelidir.


Kurulum ve çalıştırma

Gereksinim: Node.js (18 veya üzeri önerilir) ve npm.

Bağımlılıkları kurmak için bu dizinde:
  npm install

Geliştirme sunucusunu başlatmak için:
  npm run dev
Vite varsayılan olarak http://localhost:5173 adresinde açılır ve HMR ile çalışır.

Üretim derlemesi almak için:
  npm run build
Çıktı dist/ dizinine üretilir.

Üretim derlemesini yerelde önizlemek için:
  npm run preview

Kod denetimi için:
  npm run lint

Not: Arayüzün anlamlı çalışması için backend'in ve bağlı servislerin (PostgreSQL, Redis, Kafka, ClickHouse) ayakta olması gerekir. Bu servislerin ayağa kaldırılması ve hazır (seed) kullanıcı bilgileri projenin kök dizinindeki README dosyasında anlatılmıştır.
