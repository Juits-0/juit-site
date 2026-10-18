// =====================================================================
//  JUIT SİTE İÇERİĞİ — tek dosyadan yönetilir.
//  Gerçek içerikleri buradan değiştir. "ÖRNEK" ile işaretli alanlar
//  henüz doğrulanmamış / yer tutucu içeriklerdir; sitede küçük bir
//  "örnek" rozeti ile gösterilirler. Boş bırakılan bağlantılar ("")
//  arayüzde otomatik gizlenir, çalışmayan düğme oluşmaz.
// =====================================================================

// Site bir alt klasörde yayınlanır (GitHub Pages: /juit-site/). public/ altındaki
// yerel dosyaların yolunu bu yardımcıyla yaz; geliştirmede ve yayında doğru
// ön ek otomatik eklenir. Boş değer boş kalır (düğme/kapak gizlenir).
import { EXPERIMENTS } from './config/experiments.js';   // laboratuvar deney listesi (id, no, başlık)

const RAW_BASE = import.meta.env.BASE_URL;                      // geliştirmede ve yayında '/juit-site/'
const BASE = RAW_BASE.endsWith('/') ? RAW_BASE.slice(0, -1) : RAW_BASE;
export const asset = p => (p ? BASE + (p.startsWith('/') ? p : '/' + p) : p);

export const site = {
  name: 'JUIT',
  tagline: 'Oyunların arkasını kurcalıyor, öğrendiklerimi Mobu ile anlatıyor ve kendi oyun fikirlerimi deniyorum.',
  // Sekme başlığı ve paylaşım açıklaması
  title: 'JUIT — Mobu & oyun laboratuvarı',
  description: 'Oyunların arkasındaki mekanikler, Mobu ile anlatılan videolar ve oynanabilir deneyler.',
  logo: asset('/logo/jt_logo.png'),
};

// ---------------------------------------------------------------------
//  Sosyal ve iletişim bağlantıları. URL boşsa düğme gizlenir.
// ---------------------------------------------------------------------
export const socials = {
  youtube: { label: 'YouTube', url: '', placeholder: true },   // ÖRNEK: kanal linkini ekle (https://www.youtube.com/@...)
  itch:    { label: 'itch.io', url: 'https://juit.itch.io/' },
  instagram: { label: 'Instagram', url: '' },
  x:       { label: 'X', url: '' },
  discord: { label: 'Discord', url: '' },
  github:  { label: 'GitHub', url: '' },
  linkedin: { label: 'LinkedIn', url: 'https://www.linkedin.com/in/emir-furkan-zengin-906b93321' },   // itch.io profilinden
};

export const contact = {
  email: 'merhaba@juit.example',   // ÖRNEK: gerçek e-posta adresini yaz
  placeholder: true,
  note: 'İş birliği, soru ya da sadece selam için.',
};

// ---------------------------------------------------------------------
//  YOUTUBE DÜNYASI — Mobu'lu Shorts videoları
//  youtubeId: videonun YouTube kimliği (ör. "dQw4w9WgXcQ"). Boşsa
//  site içi oynatıcı yerine "yakında" durumu + poster gösterilir.
//  poster/loop: sitedeki yerel önizleme dosyaları (public/videos/...)
//  face: o videoda Mobu'nun kartta takındığı ifade
//        (calm|happy|star|o|O|scared|T|proud|x|angry|sus|sad|closed|flat)
//  lab: videoyla aynı numaralı laboratuvar deneyi; labs listesinden otomatik bağlanır
// ---------------------------------------------------------------------
export const videos = [
  { n: 1,  slug: 'dusmanlar-sirayla',     title: 'Oyunlardaki düşmanlar neden sırayla saldırıyor?',            youtubeId: '', face: 'scared', topic: 'Saldırı yöneticisi' },
  { n: 2,  slug: 'dusmanlar-nasil-gorur', title: 'Oyunlardaki düşmanlar seni nasıl görüyor?',                  youtubeId: '', face: 'sus',    topic: 'Görüş konisi' },
  { n: 3,  slug: 'hatali-ziplamalar',     title: 'Oyunlar neden hatalı zıplamalarını affediyor?',              youtubeId: '', face: 'o',      topic: 'Coyote time' },
  { n: 4,  slug: 'yonlendirme',           title: 'Oyunlar seni fark ettirmeden nasıl yönlendiriyor?',          youtubeId: '', face: 'calm',   topic: 'Çevresel yönlendirme' },
  { n: 5,  slug: 'chunk',                 title: 'Sonsuz oyun dünyaları bilgisayarını neden patlatmıyor?',     youtubeId: '', face: 'O',      topic: 'Chunk yükleme' },
  { n: 6,  slug: 'odul',                  title: 'Oyunlarda ödül toplamak neden bu kadar tatmin edici?',       youtubeId: '', face: 'star',   topic: 'Geri bildirim' },
  { n: 7,  slug: 'boss-telegraph',        title: 'Bosslar neden saldırmadan önce haber veriyor?',              youtubeId: '', face: 'x',      topic: 'Telegraphing' },
  { n: 8,  slug: 'zaman-yavaslatma',      title: 'Oyunlarda zamanı nasıl yavaşlatıyorlar?',                    youtubeId: '', face: 'proud',  topic: 'Hit stop & slow-mo' },
  { n: 9,  slug: 'hitbox',                title: 'Oyunlarda ıskaladığın hâlde nasıl vuruyorsun?',              youtubeId: '', face: 'happy',  topic: 'Hitbox' },
  { n: 10, slug: 'iframes',               title: 'Oyunlarda vurulunca neden ölümsüz oluyorsun?',               youtubeId: '', face: 'angry',  topic: 'i-frames' },
  { n: 11, slug: 'lod',                   title: 'Oyunlarda uzaktaki nesneler neden daha kötü görünüyor?',     youtubeId: '', face: 'flat',   topic: 'LOD' },
  { n: 12, slug: 'ayna',                  title: 'Oyunlardaki aynalar neden bazen çalışmıyor?',                youtubeId: '', face: 'sad',    topic: 'Yansıma' },
].map(v => ({
  ...v,
  poster: asset(`/videos/posters/${String(v.n).padStart(2, '0')}.jpg`),
  loop:   asset(`/videos/loops/${String(v.n).padStart(2, '0')}.mp4`),
  placeholder: !v.youtubeId,   // youtubeId gelince rozet otomatik kalkar
  lab: EXPERIMENTS.find(e => e.no === v.n)?.id ?? null,   // aynı numaralı deney (lab.html#/deney/<id>)
}));

// ---------------------------------------------------------------------
//  DENEYLER — Mobu'nun Oyun Laboratuvarı (lab.html, aynı yayının ikinci sayfası)
//  Liste src/config/experiments.js'ten türetilir; her deney videoyla aynı
//  numarayı taşır. href: lab.html#/deney/<id> derin bağlantısı.
//  status: 'ready' → oynanabilir, 'soon' → listede görünür ama kilitli
// ---------------------------------------------------------------------
export const labHome = asset('/lab.html');
export const labs = EXPERIMENTS.map(e => ({
  id: e.id, no: e.no, videoN: e.no,
  title: e.short, question: e.title, blurb: e.goal, lesson: e.lesson,
  status: 'ready',
  href: `${labHome}#/deney/${e.id}`,
}));

// ---------------------------------------------------------------------
//  OYUN DÜNYASI — atari salonu
//  url: itch.io sayfası. itchId: itch.io oyun kimliği (sayfada
//  "itch.io/games-like/<id>/..." bağlantısından ya da Distribute → Embed
//  sayfasından). embedUrl: web sürümü olan oyunlar için itch'in
//  "embed-upload" adresi (Distribute → Embed → "Embed game" kutusu);
//  doluysa kabin ekranı doğrudan oynanabilir alana dönüşür.
//  cover: public/games/ altında yerel kapak; yoksa itch widget'ı kullanılır.
//  role: senin rolün; solo değilse ekip adı. tint: kabin ışık rengi.
// ---------------------------------------------------------------------
export const games = [
  {
    slug: 'cave-rush', title: 'Cave Rush',
    blurb: 'Sonsuz bir tünelden düşerken taşları topla, tuzaklardan kaç. 48 saatlik bir jam\'de tek başıma yaptığım ilk proje; mobil (eğimle kontrol) sürümü planda.',
    url: 'https://juit.itch.io/cave-rush', itchId: '3978786', embedUrl: '',
    platform: 'Windows (indirilebilir)', role: 'Solo — tasarım, kod, görsel', tags: ['3D', 'Endless Runner'],
    year: '2025', tint: '#8B3DFF', cover: '',   // kapak yok → kabin ekranı prosedürel çizilir; istersen public/games/cave-rush.png ekle
  },
  {
    slug: 'metalhead-against-fire', title: 'Metalhead Against Fire',
    blurb: 'Karanlık, kısa, sert bir shooter. Gördüğün figürler gerçekten düşman mı? Black Mirror "Men Against Fire" ilhamlı; EgeKAF Doge Gamejam\'25 birincisi.',
    url: 'https://agahgames.itch.io/metalhead-against-fire', itchId: '3363346', embedUrl: '',
    platform: 'Windows (indirilebilir)', role: 'Ekip — pixel art', tags: ['Shooter', 'PSX', 'Pixel Art'],
    year: '2025', tint: '#FFB347', cover: '/games/metalhead-against-fire.png',
  },
  {
    slug: 'respawn', title: 'Respawn',
    blurb: 'İstemeden yeniden doğan bir asker; her doğuşta rastgele bir yetenek, her turda farklı bir kısıt. Retro 3D FPS. YILDIZ JAM 2025 için yapıldı.',
    url: 'https://agahgames.itch.io/respawn', itchId: '3550698', embedUrl: '',
    platform: 'Windows (indirilebilir)', role: 'Ekip — pixel art', tags: ['FPS', 'Retro', '3D'],
    year: '2025', tint: '#FF4A5C', cover: '/games/respawn.jpg',
  },
  {
    slug: 'toy-saviour', title: 'Toy Saviour',
    blurb: 'Global Game Jam 2025 — tema kategorisi birincisi. Dash at, baloncuk fırlat, yakala.',
    url: 'https://l0fs.itch.io/toy-saviour', itchId: '3278088', embedUrl: '',
    platform: 'İndirilebilir', role: 'Ekip — pixel art & oyun tasarımı', tags: ['Action', 'GGJ 2025'],
    year: '2025', tint: '#7CFF9B', cover: '/games/toy-saviour.png',
  },
  {
    slug: 'illegaxolotl', title: 'Illegaxolotl',
    blurb: 'Yıldızını kaybetmiş bir şef, yasa dışı aksolotl lokantası ve polis baskınları. PSX havasında, 48 saatlik AnküJam 2025 oyunu; hâlâ geliştirmede.',
    url: 'https://agahgames.itch.io/illegaxolotl', itchId: '', embedUrl: '',
    platform: 'İndirilebilir', role: 'Ekip', tags: ['Simulation', 'First-Person', 'PSX'],
    year: '2025', tint: '#5CE1FF', cover: '/games/illegaxolotl.png',
  },
  {
    slug: 'egg-or-jam', title: 'Egg Or Jam',
    blurb: 'Glow Spore ekibinin EGGJAM oyunu. Yumurta mı reçelden, reçel mi yumurtadan?',
    url: 'https://l0fs.itch.io/egg-or-jam', itchId: '3239352', embedUrl: '',
    platform: 'Windows (indirilebilir)', role: 'Ekip', tags: ['Role Playing', 'Jam'],
    year: '2025', tint: '#FFE066', cover: '/games/egg-or-jam.png',
  },
].map(g => ({ ...g, cover: asset(g.cover) }));   // kapak yolları yayın adresine göre düzeltilir

// ---------------------------------------------------------------------
//  HAKKIMDA — masadaki nesneler. Her nesne bir üretim alanını açar.
// ---------------------------------------------------------------------
export const about = {
  intro: site.tagline,
  name: 'Juit',
  since: '2025 başından beri oyun geliştiriyorum.',   // itch.io profilindeki ifade
  objects: [
    { id: 'camera',  label: 'Kamera',        title: 'İçerik', text: 'Oyun mekaniklerini kısa videolarda, Mobu\'nun başına gelenler üzerinden anlatıyorum. Her video tek bir "neden?" sorusuna cevap verir.' },
    { id: 'gamepad', label: 'Kumanda',       title: 'Oyun geliştirme', text: 'Unity ve C# ile küçük projeler, jam oyunları ve mekanik prototipleri. Güçlü yanım görsel ve oyun tasarımı; kod tarafını her projede biraz daha ileri taşıyorum.' },
    { id: 'sketch',  label: 'Çizim defteri', title: 'Mobu & animasyon', text: 'Mobu konuşmaz; mimik, duruş ve zamanlamayla anlatır. Karakter animasyonlarını kod ile, kare kare deterministik olarak üretiyorum.' },
    { id: 'monitor', label: 'Monitör',       title: 'Deneyler', text: 'Coyote time, görüş konisi, telegraphing gibi mekanikleri doğrudan tarayıcıda oynanabilir deneylere çeviriyorum. Bu site de o laboratuvarın bir parçası.' },
  ],
};

// ---------------------------------------------------------------------
//  GİZLİ ÇEKMECE — keşfeden ziyaretçiye küçük ödül.
//  Açılış: klavyede "mobu" yazmak, ya da hub'daki logoya 5 kez tıklamak.
// ---------------------------------------------------------------------
export const secret = {
  title: 'Mobu\'nun çekmecesi',
  blurb: 'Yarım kalanlar, ilk çizimler ve komik bug\'lar burada birikecek.',
  items: [
    { kind: 'sketch', title: 'İlk Mobu eskizleri', text: 'Üç sivri saç, yuvarlak kulaklar ve "-_-" ifadesi ilk denemeden beri yerinde.', placeholder: true },
    { kind: 'bug',    title: 'Sol üstte beliren Mobu', text: 'Bir videoda Mobu taşınırken bir anlığına ekranın sol üstüne ışınlandı. Artık her kare kontrol ediliyor.', placeholder: false },
    { kind: 'proto',  title: 'Yarım kalan deney', text: 'ÖRNEK: Buraya bir prototipin kısa kaydı ya da gif\'i gelecek.', placeholder: true },
  ],
};
