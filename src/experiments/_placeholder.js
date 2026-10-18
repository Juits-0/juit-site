// _placeholder.js — henüz yazılmamış deneyler için "Yakında" sahnesi (Mobu omuz silker).
import { Experiment } from '../core/experiment.js';
import { setBoil, GLOW } from '../core/ink.js';
import { mk, drawMobu, ARM_SHRUG, hop } from '../core/mobu.js';
import { txt, pill } from '../core/ui.js';
import { clamp, lin, eBack } from '../core/math.js';

export default class Placeholder extends Experiment {
  static id = '_placeholder';
  static kind = '2d';
  static controls = { joystick: false, buttons: [], pointer: null, hint: '' };
  static settings = [];
  render(g) {
    const W = this.view.w, H = this.view.h, T = this.time;
    setBoil(T);
    const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#0d0a14'); gr.addColorStop(1, '#160f22'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    const v = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, Math.max(W, H) * 0.7); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(60,20,120,.4)'); g.fillStyle = v; g.fillRect(0, 0, W, H);
    const m = mk(T, W / 2, H * 0.72, 0.5);
    const sh = lin(T % 3.2, 0.4, 0.9) * (1 - lin(T % 3.2, 1.6, 2.1));     // omuz silkme döngüsü
    if (sh > 0) { m.armL = m.armR = { e: [150, -250 + (1 - sh) * 60], h: [170 - (1 - sh) * 50, -222 + (1 - sh) * 100] }; m.face = 'sus'; hop(m, T % 3.2, 0.5, 0.75, 6); }
    drawMobu(g, m);
    const k = eBack(clamp(T / 0.4));
    g.save(); g.translate(W / 2, H * 0.2); g.scale(k, k);
    txt(g, 'Bu deney yakında', 0, 0, 26, '#F5F5F5');
    g.restore();
    txt(g, this.cfg.short, W / 2, H * 0.2 + 34, 14, GLOW, 'center', 700);
  }
}
