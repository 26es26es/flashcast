FlashCast


Projenin amacı ve kapsamı.

FlashCast, canlı yayınlara gerçek zamanlı reklam yerleştiren karar tabanlı bir reklam motorudur. Reklamverenler bütçe, maksimum CPM ve hedefleme ile kampanya tanımlar. Yayında bir reklam alanı açıldığında sistem, uygun kampanyalar arasından kazananı seçer, gösterim maliyetini o kampanyanın bütçesinden düşer ve gösterim/tıklama verisini analiz için kaydeder.

Amaç, yüksek trafik altında doğru ve hızlı karar veren, bu kararların parasal sonucunu kayıpsız kaydeden bir sistemdir. Sistemi anlamanın en kolay yolu paranın izini sürmektir: reklamverenin bütçesi PostgreSQL'de kalıcı olarak tutulur ve karar anındaki hızlı erişim için Redis'e yansıtılır; bir alan açıldığında Karar Motoru bir kampanya seçer ve maliyeti Redis üzerinden atomik olarak düşer; gösterim veya tıklama olayı Kafka üzerinden ClickHouse'a akar; panolar bu olayları canlı özetler olarak geri okur.

Bu dokümanın kapsadığı parçalar backend servisleri, API katmanı, React frontend ve operatör demo/yük testi panelidir; hepsi Docker Compose ile lokalde çalışır.


Sistem mimarisi ve bileşenlerin açıklaması.

Sistem, altyapı konteynerlerinin önünde duran tek bir Rust servisinden (Inbound Gateway ve Karar Motoru birlikte) oluşur. Rust binary'si host üzerinde çalışır ve Postgres, Redis, Kafka ile ClickHouse'a localhost üzerinden bağlanır. Frontend ayrı olarak sunulan bir Vite/React uygulamasıdır.

Bileşenler:

Inbound Gateway ve Karar Motoru (Rust, Axum, Tokio). HTTP ve WebSocket isteklerini karşılar, doğrular, kampanya seçimini yürütür, hedeflemeyi değerlendirir ve bütçeyi yönetir. Aynı süreç, gösterim olaylarını ClickHouse'a boşaltan arka plan Kafka worker görevini de çalıştırır ve trafik simülatörünü sürer.

PostgreSQL. Kalıcı kayıt ve doğruluk kaynağı. Kullanıcı hesapları, reklamveren bilgileri ve kampanya tanımları burada tutulur.

Redis (Lua ile). Cache ve canlı bütçe sayacı. Aktif kampanya bütçeleri buraya yansıtılır, böylece karar yolu bakiye kontrolü için hiç Postgres'e gitmez.

Kafka (Zookeeper ile). Gösterim ve tıklama olaylarını soğuran dayanıklı kuyruk; böylece karar yolu analitik yazımları tarafından bloklanmaz.

ClickHouse (iki shard ve Keeper). Analitik deposu. Gösterim olayları buraya toplu insert edilir ve grafiklerin gösterdiği zaman serisi verisine dönüştürülür.

Prometheus ve Grafana. Operasyonel izleme. Prometheus servisin /metrics ucunu toplar; Grafana istek hızını, karar gecikmesini ve hata oranını görselleştirir.

Frontend (React, Recharts). Giriş ekranı, reklamverenin kendi kampanyalarını ve canlı grafiklerini gördüğü kampanya panosu, ve operatörün canlı karar akışını, şirket bütçelerini, harcama grafiklerini ve trafik simülatörünü gördüğü demo paneli.


Kimlik doğrulama akışı ve rol modeli.

Erişim JWT tabanlıdır. Kullanıcı POST /auth/login ucuna e-posta ve parola gönderir. Parola, Postgres'te tutulan Argon2 özeti ile doğrulanır. Başarılı olursa sunucu, kullanıcı id'sini (sub), rolü ve bir saat sonrasına ayarlı son kullanma süresini taşıyan, sunucunun gizli anahtarıyla imzalanmış bir JWT üretir. Frontend bu token'ı saklar ve her API isteğinde Authorization: Bearer başlığı olarak gönderir; çıkışta token'ı atar.

Roller için açık kayıt akışı yoktur; kullanıcılar ve rolleri seed edilir. İki rol vardır:

Operatör. Demo/kontrol panelini görür, yük simülasyonlarını başlatır/durdurur ve tüm şirketlerin analitiğine erişir.

Reklamveren. Yalnızca kendi kampanyalarını yönetir ve yalnızca kendi analitiğini görür. Bir reklamveren başka bir reklamverenin kampanyasına erişemez; sahiplik her kampanya ucunda kontrol edilir.

Parolalar Argon2 ile özetlenir. Açılışta bir migration, Argon2 formatında olmayan her parolayı tarar ve yeniden özetler; böylece başlangıçta düz bir yer tutucu olarak saklanan seed operatör hesabı, ilk çalıştırmada gerçek bir özete yükseltilir. Reklamveren hesapları giriş ekranındaki "New company" sekmesinden oluşturulabilir; bu operatör değil, reklamveren kullanıcısı yaratır.


Veri katmanı bölüşümünün gerekçesi (PostgreSQL / Redis / ClickHouse).

Veri, her biri farklı işi en iyi yaptığı için bilinçli olarak üç depoya bölünmüştür.

PostgreSQL doğruluk kaynağıdır. Hesaplar, kampanyalar, hedefleme tanımları ve kesin kampanya harcaması burada yaşar. İlişkiseldir, tutarlıdır ve tartışmalı her rakamın çözüldüğü yerdir.

Redis canlı bütçe sayaçlarını tutar. Karar yolu her reklam isteğinde çalışır ve milisaniyenin altında olmalıdır; bu yüzden bakiye kontrolü ve düşüm Postgres'te değil burada yapılır. Bütçeler açılışta ve bir kampanya oluşturulduğunda/aktive edildiğinde Postgres'ten Redis'e yansıtılır. Postgres yetkili kalır; Redis hızlı çalışma kopyasıdır.

ClickHouse analitik olaylarını tutar. Gösterim ve tıklama olayları milyonlarca satıra ulaşır ve bunlara sorulan tek soru toplama sorularıdır (say, topla, zaman kovasına göre grupla). ClickHouse kolonsaldır ve tam bunun için yapılmıştır, bu yüzden tablo büyüdükçe bu özetler hızlı kalır. Bu hacmi karar yolunda Postgres'e yazmak tüm sistemi yavaşlatırdı.

Ayrıca gösterim ve tıklama satırlarının küçük bir ikinci kopyası doğrudan Postgres'e de (impressions_log, clicks_log) yazılır; bu, kampanya tablosunda gösterilen kesin harcanan ve kalan tutarları hesaplamak içindir. Yani aynı olaylar iki hedefe akar: zaman serisi grafikleri için ClickHouse, kesin kampanya bakiyeleri için Postgres.


Teknoloji seçimleri ve gerekçeleri (bütçe için Redis + Lua atomikliği, analitik için dağıtık ClickHouse vb.).

Bütçe atomikliği için Redis ve Lua. Temel doğruluk gereksinimi, bir bütçenin asla iki kez harcanmaması ve asla eksiye düşmemesidir. Bakiye kontrolü ve düşüm iki ayrı Redis komutu olsaydı, eş zamanlı iki reklam isteği aynı kalan bütçeyi okuyup ikisi de harcayabilirdi. Bunun yerine tek bir Lua script'i get, karşılaştır ve set işlemini tek bölünmez adımda yapar, böylece araya başka komut giremez. Maliyeti karşılayamayan kampanya reddedilir ve sıradaki aday denenir. Bu, projenin en önemli mühendislik noktasıdır.

Tampon olarak Kafka. Yüksek istek hızlarında her gösterimi doğrudan analitik veritabanına yazmak, her reklam kararını yavaş bir yazıma bekletirdi. Bunun yerine karar handler'ı küçük bir olayı serileştirip mikrosaniyeler içinde bir Kafka topic'ine bırakır ve reklamı hemen döner. Bir arka plan worker'ı Kafka'dan okur, olayları demetler (en fazla 500 satır veya bir saniye, hangisi önce gelirse) ve ClickHouse'a toplu insert eder. Demetleme önemlidir çünkü ClickHouse çok sayıda küçük insert yerine az sayıda büyük insert'i tercih eder.

Dağıtık ClickHouse. Analitik iki düğümlü bir kümedir. Her düğümde yerel bir ReplicatedMergeTree tablosu bulunur ve üzerinde bir Distributed tablo durur; yazımlar düğümler arasında parçalanır (sharding) ve okumalar tüm düğümlere dağılıp birleştirilir. Bir ClickHouse Keeper kümeyi koordine eder. Analitiğin hacimle ölçeklenmesini sağlayan budur.

Parolalar için Argon2 ve oturumlar için JWT. Argon2 modern, belleğe dayalı bir parola özet fonksiyonudur. JWT servisi durumsuz tutar: token kimliği ve rolü kendisi taşır, bu yüzden sunucu tarafında oturum deposu gerekmez.


Eşleştirme, karar ve bütçe mantığı.

Hedefleme şirket başına değil, kampanya başına tanımlanır. Her kampanya kendi hedefleme alanları listesine sahiptir. Bir alanın bir anahtarı, etiketi, ağırlığı, türü, hedef değeri ve "forced" (zorunlu) bayrağı vardır. Üç alan türü vardır:

Aralık (range). Hedef alt ve üst sınırı ile bir falloff'a sahip sayısal alan (örneğin yaş veya gelir). Aralık içindeki bir izleyici 1.0 alır; dışında ise skor falloff'a göre doğrusal olarak azalır.

Kategorik (categorical). Hedeflenen bir alt kümesi olan seçenek kümesi (örneğin cinsiyet veya medya türü). Değeri hedef kümede olan bir izleyici 1.0 alır; boş hedef "herkese uy" demektir.

Boolean. Hedefi evet, hayır veya umursama olan evet/hayır özelliği (örneğin risk alan).

Bir alan açıldığında POST /decisions, isteği yapan izleyiciye karşı şu boru hattını çalıştırır:

Önce, uygunluk. Forced işaretli her alan sert bir filtredir. İzleyicinin değeri forced bir alanın hedefinin dışına düşerse (yaş aralığın dışında, kategori kümede değil, boolean eşit değil), kampanya yarıştan tamamen çıkarılır ve o izleyiciye gösterilemez.

Sonra, skorlama. Hayatta kalan her kampanya, kendi alanlarının bireysel skorlarının ağırlıklı ortalaması olan bir eşleşme skoru alır; böylece daha çok alanı olan bir kampanya, daha az alanı olana göre otomatik olarak öne çıkmaz.

Sonra, sıralama. Kampanyalar eşleşme skoruna göre sıralanır ve en iyi beşi tutulur.

Sonra, kazanan. Bu ilk beş içinden en yüksek maksimum CPM'e sahip kampanya alanı kazanır. Eşleştirme alanı daralttıktan sonra karar veren faktör CPM'dir (reklamverenin bin gösterim başına ödeyeceği fiyat). En yüksek CPM'li kazanan maliyeti karşılayamazsa, sıralı kümedeki bir sonraki aday denenir.

Gösterilen reklamın tıklanıp tıklanmadığı artık eşleşme skorunun bir fonksiyonu değil, sabit bir tıklanma oranıdır. Operatör bu oranı simülatörde belirler; gösterilen her reklam bu sabit olasılıkla tıklanır. Bu iki soruyu net biçimde ayırır: eşleştirme hangi reklamın gösterileceğine, tıklanma oranı ise tıklanıp tıklanmayacağına karar verir.

Ücret, kazananın maksimum CPM'inin 1000'e bölümü olarak hesaplanan gösterim maliyetidir. Tıklanan bir gösterim tam gösterim maliyeti kadar, tıklanmayan bir gösterim ise bunun daha küçük bir kesri kadar ücretlendirilir. Düşüm, yukarıda anlatılan atomik Redis Lua işlemidir. Başarılı bir düşümden sonra olay Kafka'ya yayınlanır, Postgres loglarına yazılır ve operatör akışına WebSocket üzerinden yayınlanır.

Operatör belirli bir şirketin simülatörünü çalıştırdığında, karar o şirketle sınırlanır: yalnızca o şirketin kampanyaları kendi simüle izleyicileri için yarışır, böylece o şirketin akışı ve grafikleri dolar. All Companies sekmesinde Start her şirket için aynı anda bir simülatör başlatır ve Stop hepsini durdurur.


Detaylı kurulum adımları ve hazır (seed) kullanıcı bilgileri.

Gereksinimler: Docker Desktop (Windows'ta WSL entegrasyonu açık), Rust ve Cargo, ve Node.js ile npm.

Adım 1, altyapıyı başlat:
    docker compose up -d
Bu, Postgres, Redis, Kafka (Zookeeper ile), iki ClickHouse düğümü ve Keeper, Prometheus ile Grafana'yı başlatır. Kafka ve ClickHouse'un hazır olması için kısa bir süre tanıyın; docker compose ps ile kontrol edin.

Adım 2, şemayı yükle (yalnızca ilk çalıştırmada veya veritabanı volume'u silindikten sonra):
    docker exec -i flashcast_db psql -U flashcast_admin -d flashcast < schema.sql
Bu, tabloları oluşturur ve operatör hesabını seed eder. Rust servisi açılışta yeni kolonları eklemek için idempotent migration'lar da çalıştırır; bu yüzden sonraki çalıştırmalarda zararsız "already exists, skipping" bildirimleri görürsünüz.

Adım 3, backend'i başlat (proje kökünden):
    cargo run
"Inbound Gateway listening on http://0.0.0.0:8000" satırını bekleyin.

Adım 4, frontend'i başlat (başka bir terminalde):
    cd frontend && npm install && npm run dev
Vite'ın yazdırdığı URL'yi açın, genellikle http://localhost:5173.

Seed kullanıcılar. Operatör hesabı schema.sql tarafından seed edilir:
    e-posta: operator@flashcast.com
    parola: dummy_hash_for_now
İlk açılışta yer tutucu parola Argon2 ile yeniden özetlenir ve giriş aynı bilgilerle çalışmaya devam eder. Reklamveren hesapları seed edilmez; giriş ekranındaki "New company" sekmesinden oluşturun.

Portlar: backend 8000, frontend 5173, Postgres 5432, Redis 6379, Kafka 9092, ClickHouse HTTP 8123 ve 8124, Prometheus 9090, Grafana 3000.


Kullanım rehberi ve demo panelinden yük testinin nasıl çalıştırılacağı.

Reklamveren olarak: giriş yapın, bir ad, bütçe, maksimum CPM ve kategori ile kampanya oluşturun ve hedefleme alanlarını tanımlayın (her biri bir tür, hedef, ağırlık ve isteğe bağlı forced bayrağı ile). Kampanya listesi aktif, taslak ve silinmiş kampanyaları gösterir; bir kampanyayı silmek onu Deleted sekmesine taşır, geri yüklemek ise Drafts sekmesine taşır. Reklamveren görünümü ayrıca o reklamverenin kendi kampanyaları için iki canlı grafik gösterir: zaman içinde gösterilen reklamlar ve zaman içinde tıklanma oranı.

Operatör olarak: demo paneli canlı karar akışını, harcama çubuklarıyla şirket bütçelerini ve harcama/gösterim grafiklerini gösterir. Bir şirket seçmek akışı, grafikleri ve simülatörü o şirketle sınırlar; All Companies sekmesi toplam harcamayı gösterir ve Start All ile Stop All sunar.

Panelden yük testi çalıştırmak. Bir şirket sekmesi seçin, trafik hızını, süreyi ve tıklanma oranını ayarlayın ve Start'a basın. Simülatör, yapılandırılmış kitleden çekilen izleyiciler üretir ve seçilen hızda karar motoruna gönderir; akış ve grafikler canlı güncellenir. Durdurmak için Stop'a basın. All Companies sekmesinde Start her şirket için aynı anda bir simülatör çalıştırır.

Doğrulama. Bir çalışma durduğunda, harcanan bütçe kayda geçen toplam harcamayla eşleşir; bu, karar anından kalıcı kayda kadar hiçbir olayın kaybolmadığını gösterir. Sistemin temel doğruluk değişmezi budur.


API ve WebSocket dokümantasyonu.

Tüm uçlar Gateway tarafından 8000 portunda sunulur. Login ve herkese açık reklamveren listesi dışındaki uçlar Authorization: Bearer token gerektirir.

Kimlik
    POST /auth/login            gövde { email, password_hash }, döner { token, role, id, logo }
    POST /auth/change-password  gövde { current_password, new_password }

Kampanya (reklamveren)
    POST   /campaigns              kampanya oluştur (name, total_budget, max_cpm, target_categories, status, target_fields)
    PUT    /campaigns/{id}         kampanyayı güncelle
    GET    /campaigns/mine         çağıranın kampanyalarını harcama ve kalan ile listeler
    GET    /campaigns/all          tüm kampanyaları listeler (yalnızca operatör)
    GET    /campaigns/{id}/stats   tek kampanyanın toplamları
    POST   /campaigns/{id}/activate  taslağı yayınla, veya silinmiş kampanyayı taslaklara geri yükle
    DELETE /campaigns/{id}         yumuşak silme (Deleted'a taşır)
    DELETE /campaigns/{id}/purge   silinmiş kampanyayı kalıcı olarak sil
    POST   /campaigns/{id}/budget  bütçeyi ayarla, gövde { amount } (pozitif ekler, negatif çıkarır)

Reklamverenler
    GET    /advertisers            şirketleri bütçe özetleriyle listeler (herkese açık)
    POST   /advertisers            reklamveren oluştur, gövde { email, password }
    DELETE /advertisers/{id}       reklamvereni ve kampanyalarını sil
    GET    /advertisers/{id}/fields  o şirketin kampanyalarındaki hedefleme alanlarının birleşimi
    GET    /advertisers/logos      mevcut logo seçenekleri
    GET    /advertisers/{id}/logo  bir şirketin logosunu al
    PUT    /advertisers/{id}/logo  bir şirketin logosunu ayarla, gövde { logo }

Kararlar
    POST /decisions        gövde { category, user veya user_fields, click_rate, advertiser_id }
                           kazanan kampanyayı, maliyeti, durumu ve clicked bayrağını döner
    POST /decisions/click  tıklama kaydet, gövde { campaign_id }

Analitik
    GET /analytics?advertiser_id=<id>  son pencere için zaman kovalı gösterim, tıklama ve harcama.
                                       Reklamveren her zaman kendi verisine sınırlanır; operatör advertiser_id geçebilir.

Simülatör (operatör)
    POST /simulate/start   gövde { rate, duration, click_rate, advertiser_id, audience }
    POST /simulate/stop    gövde { advertiser_id }
    GET  /simulate/status?advertiser_id=<id>  { running } döner

Metrikler
    GET /metrics           Prometheus formatında metrikler (scrape için)
    GET /metrics/summary    JSON özet (RPS, karar gecikmesi p95/p99, hata oranı), demo panelini besler

WebSocket
    GET /ws  her kararı gerçekleştiği anda yayınlayan bir WebSocket'e yükseltir. Her mesaj bir
             karar olayıdır: { campaign_id, campaign_name, cost, status, category, timestamp, clicked }.
             status şunlardan biridir: approved, no_fill veya budget_exhausted. Operatör akışı bu akışı tüketir.


Script'lerin kullanımı ve parametreleri.

simulate.sh gateway'e sentetik reklam alanı ve izleyici trafiği gönderir.
    ./simulate.sh --duration=<saniye> --rate=<istek/saniye> --click-rate=<yuzde>
    --duration    çalışma süresi, saniye (varsayılan 30)
    --rate        saniyede üretilen reklam alanı isteği (varsayılan 100)
    --click-rate  gösterilen bir reklamın tıklanma olasılığı, 0 ile 100 (varsayılan 10)
    BASE_URL      gateway adresi için ortam değişkeni (varsayılan http://localhost:8000)

k6_load_test.js ölçümlü yük senaryosudur, k6 ile çalışır. POST /decisions ucuna sanal kullanıcıları rampa ile bindirir ve karar gecikmesi ile onay oranını özel metrikler olarak kaydeder; performans hedeflerini doğrulamak için kullanılır (yaklaşık saniyede 2000 istek, p95 karar gecikmesi 20ms civarı).


Sorun giderme (troubleshooting) rehberi.

WSL'de "docker command not found" veya "could not be found in this WSL 2 distro". Docker Desktop'ın motoru distronuza bağlı değil. Docker Desktop'ın çalıştığından ve motorun başlatıldığından (Resource Saver tarafından duraklatılmadığından) emin olun, Settings, Resources, WSL Integration altında distronuz için entegrasyonu açın, gerekirse PowerShell'de wsl --shutdown çalıştırıp Docker Desktop'ı yeniden açın.

Backend açılışta "Address already in use" ile panik veriyor. Başka bir instance zaten 8000 portunu tutuyor. Yenisini başlatmadan önce eski süreci durdurun.

Grafikler veya karar akışı belirli bir şirket için boş kalıyor. Karar motoru bir şirketin simülasyonu sırasında yalnızca o şirketin kampanyalarını gösterir ve bir kampanya ancak bir yarışı kazandığında görünür. Bir kampanyanın simüle izleyicilerin karşılamadığı bir forced alanı varsa, kasıtlı olarak dışarıda bırakılır. Şirketin aktif bir kampanyası olduğundan ve forced alanlarının kitleyi filtrelemediğinden emin olun.

Açılışta "column ... already exists, skipping" gibi migration bildirimleri. Bunlar hata değil, bilgilendirmedir. Açılış migration'ları idempotenttir ve zaten yapılmış işi atlar.

Hiç analitik verisi yok. ClickHouse konteynerlerinin ve Kafka broker'ının çalıştığını doğrulayın (docker compose ps). Özellikle broker, motor duraklatıldıktan sonra otomatik olarak yeniden başlamayabilir; docker compose up -d eksik konteyneri geri getirir.
