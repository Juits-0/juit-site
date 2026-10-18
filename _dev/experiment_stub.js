export class Experiment {
  constructor(o) { Object.assign(this, o); }
  hud() {}
  toast(t) { console.log('toast', t); }
  complete(r) { console.log('COMPLETE', JSON.stringify(r)); }
}
