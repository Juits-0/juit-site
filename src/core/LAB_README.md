# Mobu'nun Oyun Laboratuvarı — çekirdek (motor + lab + referans deney)

## Çalıştırma
```
npm i
npm run dev:lab                            # geliştirme → http://localhost:5180/lab.html (vite.lab.config.js)
npx vite build --config vite.lab.config.js # üretim derlemesi → dist-lab/
npx vite preview --config vite.lab.config.js --port 5180
```
Giriş noktası kökte `lab.html` (`#app > #lab, #exp, #flash`), bootstrap `src/labworld/main.js` (`start()`), stiller `src/labworld/style.css`.
Ana site kabuğuna bağlarken yalnızca `import { start } from './labworld/main.js'` yeterlidir (modül import edilince başlar).
Rotalar (hash): `#/` laboratuvar, `#/deney/<id>` deney (örn. `lab.html#/deney/coyote`).

## Kontroller
- Laboratuvar: ←/→ ya da A/D yürü; istasyonda Boşluk/Enter/↑ ya da "GİR" çipi → gir; 1–9 ve 0 → 1–10. numaralı istasyona git ve gir; istasyona/zemine tıkla-dokun → Mobu yürür; alttaki hızlı şerit (12 çip) yürüyüp girer; Mobu'ya tıkla (sürpriz), 6 sn bekle (uyur).
- Deney: ok/WASD yürü, Boşluk zıpla, E/Enter eylem, Shift yavaş, R yeniden başlat. Dokunmatikte sanal joystick + düğmeler. "Hareketi azalt" (lab ve panelde) zoom/sarsıntı/flaşı kapatır.

## Klasör yapısı
```
lab.html, vite.lab.config.js
src/labworld/   main.js (hash yönlendirici, ekran geçişleri), style.css
src/config/     experiments.js (12 deney kaydı + CHANNEL)
src/core/       math ink mobu enemy fx ui input touch audio store view experiment runner  + API.md
src/lab/        lab.js (laboratuvar ortamı), previews.js (12 monitör önizlemesi)
src/experiments/ coyote.js (referans), _placeholder.js ("Yakında")
```
`src/experiments/<id>.js` varsa otomatik yüklenir (`import.meta.glob`), yoksa `_placeholder.js`.

## Yeni deney ekleme
`src/core/API.md` ve `src/experiments/coyote.js` okunur; `src/experiments/<id>.js` içinde `export default class X extends Experiment` yazılır. `config/experiments.js` kayıtları (başlık, amaç, ders metni) hazırdır; video bağlantıları `null` bırakılır.
