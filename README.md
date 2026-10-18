# JUIT — kişisel portfolyo sitesi

Siyah açılış, ortada JT logosu, solda Mobu & videolar, sağda oyun salonu; üç oynanabilir mekanik deneyi; sitede yaşayan Mobu.

## Çalıştırma

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # dist/ klasörüne üretim derlemesi
npm run preview    # dist/ önizlemesi
```

Bağımlılık yalnızca Vite. Çatı yok; düz ES modülleri + canvas.

## İçerikleri nereden değiştiririm?

Tek dosya: **`src/content.config.js`**

| Ne | Alan |
|---|---|
| Sosyal bağlantılar (YouTube, itch.io, LinkedIn…) | `socials` — URL boşsa düğme gizlenir |
| İletişim e-postası | `contact.email` (şu an örnek adres) |
| Videolar | `videos[]` — `youtubeId` girince site içi oynatıcı açılır ve "örnek" rozeti kalkar. Poster/loop dosyaları `public/videos/posters/NN.jpg`, `public/videos/loops/NN.mp4` |
| Deneyler | `labs[]` — `status: 'ready' | 'soon'` |
| Oyunlar (atari kabinleri) | `games[]` — `url`, `itchId` (itch.io widget'ı), `embedUrl` (web sürümü varsa kabin ekranı oynanabilir olur), `cover` (`public/games/`), `role`, `tint` |
| Hakkımda metinleri ve masadaki nesneler | `about` |
| Gizli çekmece | `secret.items[]` |

Logo: `public/logo/jt_logo.png` (şeffaf). Vektör geometri `src/logo.js` içinde (intro + hub).
Mobu referansı: `src/mobu/mobu-draw.js` (Shorts kitindeki onaylı çizimle aynı).

## Yapı

```
src/
  main.js            açılış sırası: hub → intro → Mobu
  router.js          #/ #/mobu #/arcade #/lab #/about #/cekmece
  intro/intro.js     canvas açılış (atlanabilir, kısa sürüm, reduced-motion)
  hub/hub.js         iki dünya + yakınlık tepkisi
  mobu/mobu-actor.js sitede yaşayan Mobu (sahneler, tepkiler, tıklama, uyku)
  mobu/mobu-draw.js  Mobu çizim kütüphanesi
  worlds/            mobu-world (videolar + deney masası), arcade, lab-page, lab-mount
  lab/               coyote.js, vision.js, telegraph.js (+ LAB_SPEC.md sözleşme)
  about/             masa sahnesi (desk.js SVG) + iletişim
  secret/            gizli çekmece
  ui/                modal, toast
  audio.js           sentez SFX (varsayılan kapalı, üst çubuktan açılır)
  styles/            tokens, base, intro, topbar, hub, worlds
```

Gizli alan: klavyede `mobu` yazmak ya da ana sayfadaki logoya 5 kez tıklamak.

Not: aynı klasörde ayrı bir "Mobu'nun Oyun Laboratuvarı" çalışması var (`lab.html`, `src/labworld`, `src/core`, `src/experiments`, `vite.lab.config.js`, `npm run dev:lab`). Bu site onları kullanmaz; iki iş birbirinden bağımsız derlenir.
