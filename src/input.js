// =====================================================================
//  INPUT : clavier (flèches / WASD) + manette (PlayStation / Xbox, mapping « standard »)
//  - commandes de conduite analogiques lissées
//  - actions discrètes (caméra, pause, stands…) émises via un callback
//  - navigation de menu (flèches/Entrée/Échap, croix directionnelle, ✕ / ○)
// =====================================================================
import { settings } from './settings.js';

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

export class Input {
  constructor() {
    this.down = new Set();
    this.pressedOnce = new Set();
    this.listeners = [];
    this.lastDevice = 'keyboard';
    this.steer = 0;            // état lissé du clavier
    this.padPrev = [];
    this.padNavT = 0;
    this.menuMode = true;
    this.touchLike = false;
    this.pad = { connected: false, id: '', steer: 0, throttle: 0, brake: 0, boost: false, ps: false };
    window.addEventListener('keydown', (e) => this._kd(e));
    window.addEventListener('keyup', (e) => { this.down.delete(e.code); });
    window.addEventListener('blur', () => { this.down.clear(); });
    window.addEventListener('gamepadconnected', (e) => { this.pad.connected = true; this.pad.id = e.gamepad.id; this.pad.ps = /playstation|dualshock|dualsense|054c/i.test(e.gamepad.id); });
    window.addEventListener('gamepaddisconnected', () => { this.pad.connected = false; });
  }

  onAction(fn) { this.listeners.push(fn); }
  _emit(a) { for (const f of this.listeners) f(a); }

  _kd(e) {
    // évite le défilement avec flèches/espace pendant la course
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code) && !(e.target && /input|select|textarea/i.test(e.target.tagName))) e.preventDefault();
    if (e.repeat) { if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) this._nav(e.code); return; }
    this.down.add(e.code);
    this.lastDevice = 'keyboard';
    const k = settings.keys;
    const map = { [k.camera]: 'camera', [k.pit]: 'pit', [k.pause]: 'pause', [k.debug]: 'debug', [k.auto]: 'auto', [k.reset]: 'reset', Escape: 'pause', KeyL: 'lab', KeyM: 'mute', KeyH: 'help', KeyF: 'fullscreen',
      Digit1: 'tyre:S', Digit2: 'tyre:M', Digit3: 'tyre:H', Digit4: 'tyre:I', Digit5: 'tyre:W' };
    if (map[e.code]) this._emit(map[e.code]);
    this._nav(e.code);
  }
  _nav(code) {
    const nav = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'ok', NumpadEnter: 'ok', Escape: 'back', Backspace: 'back' };
    if (nav[code]) this._emit('nav:' + nav[code]);
  }

  isDown(code) { return this.down.has(code); }

  /** lit la manette (appelé à chaque frame) */
  _pollPad(dt) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = null; for (const p of pads) if (p && p.connected) { gp = p; break; }
    const P = this.pad;
    if (!gp) { P.connected = false; return; }
    P.connected = true; P.id = gp.id; P.ps = /playstation|dualshock|dualsense|054c|sony/i.test(gp.id);
    const b = (i) => (gp.buttons[i] ? gp.buttons[i].value : 0);
    const dz = settings.deadzone, sens = settings.sensitivity;
    let ax = gp.axes[0] || 0; if (Math.abs(ax) < dz) ax = 0; else ax = Math.sign(ax) * (Math.abs(ax) - dz) / (1 - dz);
    ax = Math.sign(ax) * Math.pow(Math.abs(ax), 1.35) * sens;
    const dpadX = (gp.buttons[15] && gp.buttons[15].pressed ? 1 : 0) - (gp.buttons[14] && gp.buttons[14].pressed ? 1 : 0);
    P.steer = clamp(ax || dpadX * 0.8, -1, 1);
    P.throttle = Math.max(b(7), 0); P.brake = Math.max(b(6), 0);
    // si les gâchettes sont absentes (mapping non standard) : stick vertical
    if (gp.mapping !== 'standard') { const ay = gp.axes[1] || 0; if (Math.abs(ay) > dz) { if (ay < 0) P.throttle = -ay; else P.brake = ay; } }
    P.boost = b(0) > 0.5;                       // ✕ / A
    const edge = (i, name) => { const now = (gp.buttons[i] && gp.buttons[i].pressed) || false; if (now && !this.padPrev[i]) { this.lastDevice = 'gamepad'; this._emit(name); } this.padPrev[i] = now; };
    edge(3, 'camera'); edge(2, 'pit'); edge(9, 'pause'); edge(8, 'debug'); edge(4, 'tyre:prev'); edge(5, 'tyre:next');
    // navigation de menu
    this.padNavT -= dt;
    const navNow = (i) => (gp.buttons[i] && gp.buttons[i].pressed) || false;
    const sx = gp.axes[0] || 0, sy = gp.axes[1] || 0;
    const dir = navNow(12) || sy < -0.6 ? 'up' : navNow(13) || sy > 0.6 ? 'down' : navNow(14) || sx < -0.6 ? 'left' : navNow(15) || sx > 0.6 ? 'right' : null;
    if (dir && (this.padNavT <= 0 || this._lastDir !== dir)) { this._emit('nav:' + dir); this.lastDevice = 'gamepad'; this.padNavT = this._lastDir === dir ? 0.14 : 0.32; }
    if (!dir) this._lastDir = null; else this._lastDir = dir;
    const okNow = navNow(0), backNow = navNow(1);
    if (okNow && !this._okPrev) { this._emit('nav:ok'); this.lastDevice = 'gamepad'; }
    if (backNow && !this._backPrev) { this._emit('nav:back'); this.lastDevice = 'gamepad'; }
    this._okPrev = okNow; this._backPrev = backNow;
  }

  /** commandes de conduite pour ce pas de temps */
  read(dt) {
    this._pollPad(dt);
    const k = settings.keys, d = this.down;
    const left = d.has(k.left) || d.has('ArrowLeft'), right = d.has(k.right) || d.has('ArrowRight');
    const acc = d.has(k.accel) || d.has('ArrowUp'), brk = d.has(k.brake) || d.has('ArrowDown');
    // direction clavier : rampe progressive (plus douce à haute vitesse gérée par le véhicule)
    const target = (right ? 1 : 0) - (left ? 1 : 0);
    const rate = target === 0 ? 6.5 : (Math.sign(target) !== Math.sign(this.steer) && this.steer !== 0 ? 9 : 4.2) * settings.sensitivity;
    this.steer += clamp(target - this.steer, -rate * dt, rate * dt);
    const P = this.pad;
    const usingPad = P.connected && (Math.abs(P.steer) > 0.02 || P.throttle > 0.02 || P.brake > 0.02);
    if (usingPad) this.lastDevice = 'gamepad';
    return {
      steer: usingPad && Math.abs(P.steer) > 0.02 ? P.steer : this.steer,
      throttle: Math.max(acc ? 1 : 0, P.throttle),
      brake: Math.max(brk ? 1 : 0, P.brake),
      boost: d.has(k.boost) || P.boost,
    };
  }

  /** libellés de touches selon le périphérique (pour l'interface) */
  glyph(action) {
    const ps = this.pad.ps;
    if (this.lastDevice === 'gamepad' && this.pad.connected) {
      const m = ps ? { ok: '✕', back: '○', camera: '△', pit: '□', boost: '✕', pause: 'OPTIONS', accel: 'R2', brake: 'L2', steer: 'Stick G' }
        : { ok: 'A', back: 'B', camera: 'Y', pit: 'X', boost: 'A', pause: 'MENU', accel: 'RT', brake: 'LT', steer: 'Stick G' };
      return m[action] || action;
    }
    const k = settings.keys; const nice = (c) => c.replace('Key', '').replace('Arrow', '↑').replace('Digit', '');
    const m = { ok: 'Entrée', back: 'Échap', camera: nice(k.camera), pit: nice(k.pit), boost: 'Espace', pause: 'P / Échap', accel: '↑ / ' + nice(k.accel), brake: '↓ / ' + nice(k.brake), steer: '← → / ' + nice(k.left) + nice(k.right) };
    return m[action] || action;
  }
}
