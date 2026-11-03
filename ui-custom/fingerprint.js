/* RF fingerprint locator: learns "what the WiFi signal looks like when someone stands at (x,y)"
 * and matches live readings to the nearest recorded spots (weighted k-NN).
 * Works in the browser (window.Fingerprint) and in node (module.exports) for testing. */
(function (root) {
  'use strict';

  const EMPTY = 'empty';

  /* Feature vector from per-node CSI amplitudes.
   * Each node's amplitude vector is divided by its own mean, so slow gain/AGC drift cancels
   * and only the *shape across subcarriers* (which a person changes) remains. */
  function featurize(ampsByNode, nodeIds) {
    const out = [];
    for (const id of nodeIds) {
      const a = ampsByNode[id];
      if (!a || a.length < 8) return null;
      let s = 0, n = 0;
      for (const v of a) if (v > 0) { s += v; n++; }
      if (n < 8) return null;
      const mean = s / n;
      for (const v of a) out.push(v > 0 ? v / mean : 1);
    }
    return Float32Array.from(out);
  }

  /* Average several feature vectors (reduces the ~5% frame-to-frame noise). */
  function average(vecs) {
    const n = vecs.length, d = vecs[0].length, r = new Float32Array(d);
    for (const v of vecs) for (let i = 0; i < d; i++) r[i] += v[i] / n;
    return r;
  }

  class Fingerprinter {
    constructor(k = 7) { this.k = k; this.samples = []; this.mean = null; this.std = null; this.nodeIds = []; }

    add(label, x, y, vec) { this.samples.push({ label, x, y, v: vec }); this._fitted = false; }
    clear() { this.samples = []; this._fitted = false; this.mean = null; }
    spots() { const s = new Set(); for (const t of this.samples) if (t.label !== EMPTY) s.add(t.x.toFixed(2) + ',' + t.y.toFixed(2)); return s.size; }
    emptyCount() { return this.samples.filter(t => t.label === EMPTY).length; }
    ready() { return this.spots() >= 3 && this.emptyCount() >= 5; }
    blindList() { if (!this._fitted) this.fit(); return (this.blindSpots || []).map(g => g.split(',').map(Number)); }

    /* Standardise each dimension so quiet subcarriers aren't drowned out by noisy ones. */
    fit() {
      const S = this.samples; if (!S.length) return;
      const d = S[0].v.length, mean = new Float32Array(d), std = new Float32Array(d);
      for (const t of S) for (let i = 0; i < d; i++) mean[i] += t.v[i] / S.length;
      for (const t of S) for (let i = 0; i < d; i++) std[i] += (t.v[i] - mean[i]) ** 2 / S.length;
      for (let i = 0; i < d; i++) std[i] = Math.max(Math.sqrt(std[i]), 0.02);
      this.mean = mean; this.std = std; this._fitted = true;
      this._markBlind();
    }

    /* A recorded spot is a "blind spot" if its signal is indistinguishable from the empty room
     * (the person is too far from both links to disturb them). Such spots can't be located. */
    _markBlind() {
      const E = this.samples.filter(t => t.label === EMPTY);
      for (const t of this.samples) t.blind = false;
      if (E.length < 5) return;
      const d = E[0].v.length, c = new Float32Array(d);
      for (const t of E) for (let i = 0; i < d; i++) c[i] += t.v[i] / E.length;
      const med = a => { const b = a.slice().sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
      const noise = med(E.map(t => this._dist(t.v, c)));
      const groups = new Map();
      for (const t of this.samples) if (t.label !== EMPTY) { const g = t.x.toFixed(2) + ',' + t.y.toFixed(2); (groups.get(g) || groups.set(g, []).get(g)).push(t); }
      this.blindSpots = [];
      for (const [g, arr] of groups) {
        const sep = med(arr.map(t => this._dist(t.v, c)));
        const blind = sep < noise * 2.2;
        for (const t of arr) t.blind = blind;
        if (blind) this.blindSpots.push(g);
      }
      this.noise = noise;
    }

    _dist(a, b) {
      let s = 0; const d = a.length;
      for (let i = 0; i < d; i++) { const z = (a[i] - b[i]) / this.std[i]; s += z * z; }
      return Math.sqrt(s / d);
    }

    /* -> { empty, pEmpty, x, y, spread } ; spread = weighted std-dev (m) of the neighbours' positions. */
    predict(vec, pool) {
      if (!this._fitted) this.fit();
      if (!pool) pool = this.samples.filter(t => !t.blind);
      const dists = [];
      for (const t of pool) dists.push([this._dist(vec, t.v), t]);
      dists.sort((p, q) => p[0] - q[0]);
      const nn = dists.slice(0, this.k);
      let we = 0, wt = 0, sx = 0, sy = 0, wp = 0;
      for (const [d, t] of nn) {
        const w = 1 / (d + 0.05); wt += w;
        if (t.label === EMPTY) we += w; else { wp += w; sx += w * t.x; sy += w * t.y; }
      }
      const pEmpty = we / wt;
      if (wp === 0) return { empty: true, pEmpty, x: null, y: null, spread: 0 };
      const x = sx / wp, y = sy / wp; let v = 0;
      for (const [d, t] of nn) if (t.label !== EMPTY) v += (1 / (d + 0.05)) * ((t.x - x) ** 2 + (t.y - y) ** 2);
      return { empty: pEmpty > 0.5, pEmpty, x, y, spread: Math.sqrt(v / wp), nearest: nn[0][0] };
    }

    /* Honest accuracy estimates, computed only from the recorded data:
     *  unseenErr  - leave-one-spot-out: error (m) when predicting a spot the model never saw.
     *  timeErr    - train on the first half of every recording, test on the second half (m).
     *  emptyAcc   - how often empty vs occupied is called right in that time-split test. */
    validate() {
      if (!this.ready()) return null;
      this.fit();
      const key = t => t.x.toFixed(2) + ',' + t.y.toFixed(2);
      const occ = this.samples.filter(t => t.label !== EMPTY && !t.blind);
      const spots = [...new Set(occ.map(key))];
      let eu = 0, nu = 0;
      for (const sp of spots) {
        const pool = this.samples.filter(t => !t.blind && (t.label === EMPTY || key(t) !== sp));
        const test = occ.filter(t => key(t) === sp).filter((_, i) => i % 3 === 0);
        for (const t of test) { const p = this.predict(t.v, pool); if (p.x != null) { eu += Math.hypot(p.x - t.x, p.y - t.y); nu++; } else { eu += 3; nu++; } }
      }
      // time split: per recording (same spot or empty), first half = train, second half = test
      const groups = new Map();
      for (const t of this.samples.filter(t => !t.blind)) { const g = t.label === EMPTY ? EMPTY : key(t); (groups.get(g) || groups.set(g, []).get(g)).push(t); }
      const train = [], test = [];
      for (const arr of groups.values()) { const h = Math.floor(arr.length / 2); train.push(...arr.slice(0, h)); test.push(...arr.slice(h)); }
      let et = 0, nt = 0, ok = 0;
      for (const t of test) {
        const p = this.predict(t.v, train);
        if (p.empty === (t.label === EMPTY)) ok++;
        if (t.label !== EMPTY && p.x != null) { et += Math.hypot(p.x - t.x, p.y - t.y); nt++; }
      }
      return { unseenErr: nu ? eu / nu : null, timeErr: nt ? et / nt : null, emptyAcc: test.length ? ok / test.length : null, spots: spots.length, blind: (this.blindSpots || []).length, samples: this.samples.length };
    }

    toJSON() { return { k: this.k, nodeIds: this.nodeIds, samples: this.samples.map(t => ({ l: t.label, x: t.x, y: t.y, v: Array.from(t.v, n => +n.toFixed(3)) })) }; }
    static fromJSON(j) {
      const f = new Fingerprinter(j.k || 7); f.nodeIds = j.nodeIds || [];
      for (const t of j.samples || []) f.add(t.l, t.x, t.y, Float32Array.from(t.v));
      return f;
    }
  }

  const api = { Fingerprinter, featurize, average, EMPTY };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Fingerprint = api;
})(typeof window !== 'undefined' ? window : globalThis);
