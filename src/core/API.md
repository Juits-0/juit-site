# Deney API'si (src/core) — diğer deney yazarları için sözleşme

Okunacaklar: bu dosya + `src/experiments/coyote.js` (referans, tam ve cilalı). Çekirdek kaynağı okunmaz.
Kod yorumları ve TÜM arayüz metinleri Türkçe. Vanilla JS + ES modülü. Dosya: `src/experiments/<id>.js`, `export default class X extends Experiment`.
`<id>` `src/config/experiments.js` içindeki id ile aynıdır (`sirayla gorus coyote yonlendirme chunk odul boss zaman hitbox iframes lod ayna`). Dosya yoksa `_placeholder.js` ("Yakında") açılır.
Test: `npx vite --port 5180` → `http://localhost:5180/lab.html#/deney/<id>`. Çalışan deney `window.__exp` olarak erişilir.

## 1. Experiment sözleşmesi
```js
import { Experiment } from '../core/experiment.js';
export default class X extends Experiment {
  static id = 'x';  static kind = '2d';          // '2d' → render(g); 'dom' → this.container (div), render çağrılmaz
  static controls = { joystick:true|'horizontal'|false, buttons:[{name:'jump',label:'ZIPLA'}], pointer:'aim'|'tap'|null, hint:'← → yürü', hintTouch:'Joystick: yürü' };
  static settings = [ {key,label,type:'toggle'|'range'|'select'|'button',value,min,max,step,unit,options:[{value,label}],group} ];
  init(){}  reset(){}  update(dt){}  render(g){}  onSetting(key,value){}  onTech(on){}  resize(view){}  dispose(){}
}
```
- Panel ayarlardan otomatik kurulur; değer `this.s[key]`. `button` tipi `onSetting(key)` çağırır (değer yok). Aynı `group` adlı ayarlar bir araya gelir. İlk 2 `toggle`, mobilde canvas altında hızlı çip olur.
- Panelde ayrıca hazır grup: "Teknik görünüm" (`this.tech`, değişince `onTech(on)`), "Hareketi azalt" (`this.reduced`), "Yeniden başlat".
- `init()` bir kez, `reset()` Yeniden başlat/`R`/Tekrar ile çağrılır (init sonunda sen de çağır). `reset` içinde TÜM durumu sıfırla.
- `update(dt)`: **sabit dt = 1/120 sn**, kare başına 0–4 kez. `dt` ile fizik yaz; sabit saniye (`if (t>3.2)`) yazma, olayları zaman/olay tablosuna bağla. Sekme gizliyken durur.
- `render(g)` (kind 2d): `g` zaten mantıksal birimde ölçeklenmiş ve `[0,W]×[0,H]` alanına kırpılmış. **Önce tüm görünümü boya.** Her karede `setBoil(this.time)` çağır (çizgi titremesi).
- Temel alanlar: `this.view {w,h,scale,dpr,cssW,cssH}`, `this.s`, `this.tech`, `this.reduced`, `this.input`, `this.audio`, `this.store`, `this.cfg` (config kaydı: id,no,title,short,goal,lesson,video), `this.container` (kind dom), `this.time` (sn), `this.frame`, `this.completed`, `this.camera {x,y,z}`.
- Yardımcılar: `this.complete({title,text})` tamamlanma kartı (açıklama + damga + Tekrar/Laboratuvar/Sıradaki/Video) ve damgayı store'a yazar; çağırdıktan sonra `this.completed=true` olur, girdiyi yok say. `this.toast(text,ms)`, `this.hud({left:[..],right:[..]})` (sadece değişince DOM güncellenir; `this.hud(null)` temizler; teknik değerler için, tech kapalıyken boşalt), `this.setGoal(text)`, `this.shake(px)`, `this.flash(alpha)` (ikisi de `reduced`'da etkisiz), `this.setSetting(key,value)` (paneli günceller + `onSetting` çağırır), `this.worldToView(x,y)`, `this.viewToWorld(x,y)`, `this.applyCamera(g)` (g.save() ile sarıp kullan: `translate(W/2,H/2) scale(z) translate(-x,-y)`).
- kind `'dom'`: `this.container` içine kendi canvas/WebGL'ini kur, `resize(view)`'da boyutla, `dispose()`'da her şeyi sök. Girdi için yine `this.input` (pointer container üzerinde).

## 2. Mantıksal görünüm
Yükseklik SABİT `H=600`; `W = clamp(en/boy*600, 420, 1200)`. Telefon dikeyde W=420 → deneyi 420×600'de tasarla; geniş ekranda yanlar koyu boşluk (letterbox). İçeriği `this.view.w` ile ortala; sabit W varsayma.
Mobil okunurluk: metin ≥ 12 mantıksal px, dokunma hedefleri ≥ 44 css px (`44/view.scale`).

## 3. Input (`this.input`)
- `input.axis` → `{x,y}` −1..1 (WASD/oklar + sanal joystick, normalize).
- `held(name)`, `pressed(name)` (yalnız o adımda), `released(name)`: `jump` (Boşluk/W/↑/dokunma), `action` (E/Enter/dokunma B), `slow` (Shift), `reset` (R, runner halleder), `left right up down`.
- `input.pointer`: `{x,y (mantıksal), cx,cy (css px), down, pressed, released, dx,dy (css px, o adım), wheel, pinch (çarpan, 1=yok), inside, type}`.
- Dokunma: `controls.joystick`, `buttons`, `pointer` ayarına göre overlay otomatik çıkar (sadece dokunmatik cihazda). Düğmeler basılıyken `held(name)`. `pointer:'aim'` → joystick/düğme dışındaki dokunmalar pointer olur.
- Girdi alanı = canvas alanı; tuş olayları paneldeki input/select odaklıyken oyuna gitmez.

## 4. Mobu (`core/mobu.js`) — kanonik çizim, değiştirme
`mk(t,x,y,s)` → Mobu nesnesi; **(x,y) AYAK ALTI**. s=1 → ~470 px boy; oyunda s≈.3–.42 (≈140–200 px). Her karede yeniden `mk(this.time,...)` ile kur, pozları üstüne yaz, `drawMobu(g,m)` ile çiz (gölge + Mobu; gölge `m.gy` zemin y'sine düşer, `m.nosh=true` kapatır).
- Alanlar: `face`, `look` (−1..1), `lookY`, `smile`, `blink`, `rot`, `sx/sy` (ezilme), `hairBounce`, `legL/legR:[dx,dy]`, `armL/armR:{e:[x,y],h:[x,y]}` (yerel, sol aynalanır), `bw/bh`, `lie`, `sweat`, `tear`.
- Yüzler: `calm`(varsayılan), `happy`, `star`, `o`, `O`, `scared`, `T`, `proud`, `x`, `angry`(>_<), `sus`, `sad`, `closed`, `flat`. Mobu konuşmaz; tepkiyi yüz + hareketle ver, ifadeyi olayla AYNI karede değiştir.
- Kol pozları: `ARM_DEF, ARM_UPS, ARM_HIP, ARM_HEAD, ARM_CATCH, ARM_SHRUG, ARM_SCARED, ARM_PUNCH, ARM_WAVE(t)`; karıştır: `lerpArm(a,b,k)`; `m.armL=m.armR=pose`.
- `walk(m, faz, dir=1, sp=11, amp=1)`: yürüme; `faz` artan sayı (yola göre artır: `faz += |vx|*dt*0.05` ile sp=1 kullanımı coyote.js'te), `amp` 0..1.1. `hop(m,t,t0,t1,h)` yay zıplaması (t0..t1 arası; yükseklik px döner). `landSq(m,t,tl,amt=1,d=.22)` inişte ezilme (`tl` iniş zamanı). `pancake(m,k)` K.O. yassılaşma (k 0..1; yanında dönen yıldızlar çiz: `starPoly`). `rollAbout(m,th)`, `handPos(m,side)` (elin dünya konumu).
- Sıra: önce `mk`, sonra pozlar (`walk`/`hop`/`landSq`/`pancake` birbirini çarpar), en son `drawMobu`.
- Kural: önemli karakter durumu renk filtresinden/örtüden SONRA çizilir; Mobu kaybolmaz, ışınlanmaz (kesme dışında kare başına ≤ 45 px sıçrama); yüzü etiketle kapatma.

## 5. Düşman / boss (`core/enemy.js`)
- `enemy(g,e,i)`: `e {x,y(ayak),s(1→~165px),rot,flip,lift,foot,sx,sy,face:'angry'|'furious'|'wait'|'alert'|'confused'|'dizzy'|'happy',lookX}`; `i` her düşmana farklı sıra no (çizgi tohumu).
- `marker(g,x,y,t,a)`: düşman üstü "saldırı hakkı" işareti (zemin halkası + mor ünlem).
- `bossDraw(g,B)`: taş golem. `B {x,y(ayak),s (1.0 → ~1000px; ekrana sığdırmak için ≈.3–.45), bt (idle zamanı), rt (titreme zamanı), red 0..1 (gözler kırmızı), narrow, lean, drop, mouth, crack, hurt, tilt, eyeGlow, armL/armR:{raise 0..1, swing 0..1, slam 0..1 + tx,ty (dünya hedefi), tr (titreme), gl (yumruk parlaması)}}`. Kollar omuz→dirsek→yumruk eklemli zincirdir; kopuk parça yok. Ölçeği planlarken kaldırılmış kolun (≈ 1000 px) kadraja sığdığını kontrol et.

## 6. Çizim yardımcıları
- `core/ink.js`: renkler `PURPLE GLOW LAV INK RED GOLD BG PANEL LINE GRAY WHITE`, `FONT`, `MONO`; `setBoil(t)`; `drawGroup(g,[{pts|line,fill,hatch,seed}],ol)`, `poly(g,pts,fill,seed,ol,hatch)` (köşeli, elle çizilmiş kontur), `inkLine`, `quadInk`, `ell`, `heart`, `jit`, `smooth`, `HATCH_D/L/R`, `ik(S,T,sgn,L1,L2)`. Aynı `seed` her karede aynı şekli verir (boil ile titrer); her şekle farklı seed ver. Perspektifli zemindeki şekilleri o zeminin koordinatında kur, sonra yansıt.
- `core/fx.js`: `new Particles(max)` → `burst(x,y,{n,speed,life,size,col,g,kind,spread})`, `dust(x,y,n,dir)`, `sparks`, `stars`, `confetti(x,y,n)`, `zz(x,y)`, `update(dt)`, `draw(g)`, `clear()` (dünya koordinatında; kamera dönüşümü içindeyken çiz). `glowAt(g,x,y,r,'r,g,b',a)`, `ringFlash(g,x,y,dt,R,w,col)`, `starPoly(g,x,y,r,col,rot,ink)`, `speedLines(g,x,y,dir,k,s)`, `xStamp(g,x,y,k,size)`, `bangMark(g,x,y,sz,k,t)`, `twinkle`.
- `core/ui.js`: `txt(g,s,x,y,size,col,align='center',weight=900,mono)`, `txtInk` (konturlu), `chip(g,txt,x,y,on,size)`, `pill(g,txt,x,y,col,size,tcol)`, `bar(g,x,y,w,h,k,col,bg)`, `hearts(g,x,y,n,max)`, `roundBox`, `textW`, `jtLogo(g,x,y,s,p,col,glow)`.
- `core/math.js`: `clamp lin lerp lerp2 eOut eIn eIO eBack eEl S3 pulse popK win hash hash01 rng(seed) lerpCol segHit circleRect rectRect angDiff moveToward`. Görsel pop için `eBack` (kelime/olayla senkron giriş).

## 7. Ses (`this.audio.play(ad)`)
`click pop jump land coin hit hurt ko alarm boom tick whoosh laser warn success slowIn slowOut`. Hepsi kısa ve ölçülü; ilk etkileşimde açılır, kullanıcı kapatabilir (`audio.enabled`). Tamamlanmada `success`, ölümde `ko`, kontrol noktasında `pop`.

## 8. Teknik görünüm
`this.tech` açıkken oyunun arkasındaki gizli değerleri göster: hitbox, tolerans çubuğu/ms yazısı, hayalet kutu, mesafe, sayaç. Sayaçlar GERÇEK değerlerden gelir (uydurma sayaç yok). Değerler için `this.hud(...)`, dünya içi işaretler için render. Kapalıyken oyun temiz görünür.

## 9. Yapılmaması gerekenler
- Sabit saniye/uydurma sayaç yok; olayları durum ve süre alanlarına bağla.
- Oynanış sırasında uzun metin yok. Açıklama (`cfg.lesson`) sadece tamamlanma kartı ve "?" içinde. Amaç tek cümle (`cfg.goal`).
- `reduced` iken sarsıntı/flaş/yoğun parçacık yok (`shake/flash` zaten engeller; kendi ekran efektlerini `if(!this.reduced)` ile sar).
- Mobu kaybolmaz/ışınlanmaz; yüzü etiketle kapanmaz; tekrarlayan nesneler simetrik ve düzenli dizilir; amacı anlatılmayan nesne/ışık ekleme.
- Koyu tema korunur (zemin hafif morumsu ton + mor kenar vinyeti, abartısız); parlak yeşil/sarı paletler yok. Izgara/sınır çizgileri sadece anlatıldığı an görünür.
- Çekirdek dosyalarını (`src/core/**`) değiştirme; eksik bir yardımcı gerekiyorsa deney dosyasında yerel yaz ve raporla.
- Link uydurma: `cfg.video` null'dır, dokunma.
- Telefonda kontrol: parmak altında kalan UI yok; dokunma hedefleri ≥ 44 px; `controls.hintTouch` ayrı yaz.

## 10. Kontrol listesi
1. `http://localhost:5180/lab.html#/deney/<id>` 1280×720 ve 390×844'te çalışıyor, konsol hatası yok.
2. Amaç tamamlanabilir (botla ya da elle denendi); `complete()` bir kez çağrılıyor; Tekrar/R tüm durumu sıfırlıyor.
3. Teknik görünüm açık/kapalı çalışıyor; ayar değişince `onSetting` doğru davranıyor.
4. Mobu her karede görünür, yüzü kapanmıyor, ifadeler olayla senkron.
5. `npx vite build --config vite.lab.config.js` hatasız.
