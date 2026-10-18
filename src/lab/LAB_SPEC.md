# JUIT LAB — deney modülü sözleşmesi

Her deney `src/lab/<id>.js` dosyasında yaşar ve tek bir fonksiyon dışa aktarır:

```js
export function mount<Ad>Lab(container, opts = {}) → handle
// opts: { onEvent(ev), reducedMotion: bool, sfx: { play(name) } | null }
// handle: { destroy(), reset(), setOption(key, value), getOptions() }
```

- `container` boş bir `<div class="lab">`. Modül içine **kendi** DOM'unu kurar:
  1. `<div class="lab-stage">` içinde `<canvas>` (oyun alanı, 16:9, 960×540 mantıksal birim; canvas CSS ile konteyner genişliğine uyar, devicePixelRatio'ya göre ölçeklenir, `ResizeObserver` ile yeniden boyutlanır).
  2. `<div class="lab-panel">` → "OYUN AYARLARI" paneli: anahtarlar (`<button class="lab-switch" role="switch" aria-checked>`), küçük sayaçlar (`<span class="lab-stat">`), `Sıfırla` düğmesi (`<button class="lab-btn">`).
  3. `<div class="lab-touch">` → dokunmatik düğmeler (`<button class="lab-key" data-key="left|right|jump|up|down|action">`). Sadece `(pointer: coarse)` eşleşince gösterilir (CSS halleder, sen sadece üret).
  4. `<p class="lab-hint">` → tek satır kontrol ipucu (klavye/dokunmatik).
- `destroy()` tüm dinleyicileri, rAF'ı ve gözlemcileri kaldırır, DOM'u boşaltır.
- Sayfa görünmezken (IntersectionObserver / `document.hidden`) oyun döngüsü durur.
- Fizik sabit adım (1/120 sn), `dt` 0.1 sn ile sınırlanır (sekme uyurken fırlamasın).
- Klavye: oyun yalnızca canvas odaklıyken (`tabindex="0"`) tuşları yakalar; `Space`/ok tuşlarının sayfayı kaydırmasını `preventDefault` ile engeller. Odak dışındayken tuşları dinleme.
- `reducedMotion` true ise: ekran sarsıntısı, flaş, yavaş çekim ve parçacık yok (oyun yine oynanır).
- Ses: `opts.sfx?.play?.('jump')` gibi **korumalı** çağır. İsimler: `jump, land, fail, win, switch, save, alarm, hit, step, pop`.
- Olaylar: `onEvent({ type, ...detail })`. Ortak tipler: `start, reset, toggle(key,value), win, fail`. Deneye özel tipler spec'inde.

## Görsel dil (site ile aynı)
- Zemin `#0A0A0A` (hafif mor ton: üstüne `rgba(139,61,255,.06)` radyal), vinyet. Platform/taş blok `#2B2B2B` dolgu, `#1B1426` kontur (4–5 px), köşeler keskin (yuvarlak değil). Önemli uyarı `#EF4A5C`, başarı `#B67CFF`, altın `#F5C542`, yazı `#F5F5F5`, soluk yazı `#8C8C8C`.
- Yazı: başlık `900 Npx "InterDisplay", Inter, system-ui` (büyük, mor gölge), sayaç/kapsül `700 Npx "JetBrains Mono", ui-monospace, monospace`.
- Pop girişleri `eBack` (kütüphanede var). Etiketler karakterin **önünde** ve yüzünü kapatmayacak yerde.
- Tekrarlanan nesneler simetrik ve düzenli dizilir; amacı anlatılmayan nesne/ışık ekleme.

## Mobu (oyuncu karakteri) — `../mobu/mobu-draw.js`
```js
import { mk, stageMobu, walk, airPose, squash, pancake, setBoil, ARM_UPS, ARM_HEAD, ARM_HIP, ARM_DEF, eBack, lerp, clamp } from '../mobu/mobu-draw.js';
setBoil(Math.floor(time * 8));                 // her karede: el çizimi titreşimi (8 fps)
const m = mk(time, x, y, 0.28);               // (x,y) AYAK ALTI; s=0.28 → boy ≈132 px
m.face = 'calm' | 'happy' | 'star' | 'o' | 'O' | 'scared' | 'T' | 'proud' | 'x' | 'angry' | 'sus' | 'sad' | 'closed' | 'flat';
m.look = -1..1 (bakış yönü); m.rot = radyan; m.armR = ARM_UPS; (sol kol aynalanır)
walk(m, phase, dir)   // yürüme döngüsü; phase = yol/ (px) * 0.08 gibi artan bir faz, dir ±1
airPose(m, u)         // havada u 0..1
squash(m, k)          // iniş ezilmesi k 0..1 (0.25 sn'de sönen darbe)
pancake(m, k)         // K.O. yassılaşma k 0..1
stageMobu(ctx, m)     // gölge + Mobu. Gölge m.gy'de (zemin); havadayken m.y küçülür, m.gy sabit kalır.
```
Mobu'nun yüz merkezi `(m.x, m.y - 326*m.s)`; etiketleri yüzün üstüne koyma (yüzün ≥ 40 px üstü ya da yanı).
Yere değince `squash`, zıplarken `airPose`, düşerken `face='scared'` + `ARM_HEAD`, başarıda `face='proud'` + `ARM_HIP`, K.O.'da `face='x'` + `pancake` + dönen yıldızlar.
Mobu hiçbir karede kaybolmaz/ışınlanmaz (sıfırlama hariç); kesmesiz sürekli konum.

## Kontroller
- Klavye: `ArrowLeft/ArrowRight/A/D` hareket, `Space/ArrowUp/W` zıpla, deney özelinde `Shift/K` aksiyon.
- Dokunmatik: `.lab-key` düğmeleri `pointerdown/pointerup/pointercancel` ile basılı durum verir (çoklu dokunuş: sol+zıpla aynı anda çalışmalı; `touch-action: none`).
- Oyun, canvas'a tıklanınca/dokununca odaklanır; ilk odakta ipucu (`.lab-hint`) kısa parlar.
