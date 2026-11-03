// Simulated sanity test for ui-custom/fingerprint.js (checks the code works; NOT real-world accuracy).
const { Fingerprinter, featurize, average } = require('../ui-custom/fingerprint.js');
let seed = 12345; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd());

const router = [0, 2], nodes = { 1: [0.5, 0.5], 2: [4, 3] }, S = 56;
const base = { 1: Array.from({ length: S }, () => 12 + 3 * gauss()), 2: Array.from({ length: S }, () => 14 + 3 * gauss()) };
const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
function amps(person) {
  const out = {};
  for (const id of [1, 2]) {
    out[id] = base[id].map((b, s) => {
      let v = b;
      if (person) {
        const extra = d(router, person) + d(person, nodes[id]) - d(router, nodes[id]);   // extra path length
        const strength = Math.exp(-(extra * extra) / (2 * 0.9 * 0.9));
        v *= 1 + 0.35 * strength * Math.cos(2 * Math.PI * (s / S) * (extra * 6 + id)) ;
      }
      return Math.max(0.1, v * (1 + 0.05 * gauss()));
    });
  }
  return out;
}
const window5 = person => average(Array.from({ length: 5 }, () => featurize(amps(person), [1, 2])));

const fp = new Fingerprinter(); fp.nodeIds = [1, 2];
for (let i = 0; i < 40; i++) fp.add('empty', 0, 0, window5(null));
for (const x of [0.5, 1.2, 1.9, 2.6, 3.3, 4.0, 4.6]) for (const y of [0.6, 1.3, 2.0, 2.7, 3.4]) for (let i = 0; i < 30; i++) fp.add('pos', x, y, window5([x, y]));
const v = fp.validate();
console.log('validation:', JSON.stringify(v));

let err = 0, n = 0, emptyOk = 0;
for (let i = 0; i < 600; i++) {
  const p = [0.5 + rnd() * 4, 0.5 + rnd() * 3];
  const extra = Math.min(...[1, 2].map(id => d(router, p) + d(p, nodes[id]) - d(router, nodes[id])));
  if (extra > 1.2) continue;               // person too far from both links: undetectable by physics
  const r = fp.predict(window5(p)); if (r.x != null) { err += d([r.x, r.y], p); n++; }
}
for (let i = 0; i < 100; i++) if (fp.predict(window5(null)).empty) emptyOk++;
const mean = err / n; console.log('blind spots found:', fp.blindList().length);
console.log(`random unseen positions (detectable zone only): mean error ${mean.toFixed(2)} m over ${n}; empty detected ${emptyOk}/100`);

// What the code is responsible for:
if (!(v.timeErr < 0.3)) { console.error('FAIL: cannot even re-locate trained spots', v.timeErr); process.exit(1); }
if (emptyOk < 95) { console.error('FAIL: empty detection weak'); process.exit(1); }
if (!(fp.blindList().length > 0)) { console.error('FAIL: blind spots not detected'); process.exit(1); }
// Info only: error at spots never trained. Two links are physically ambiguous (positions on the same
// curve look alike), so this is expected to be well above the trained-spot error.
console.log(`INFO unseen-spot error ${mean.toFixed(2)} m vs trained-spot error ${v.timeErr.toFixed(2)} m`);
// serialisation round trip
const fp2 = Fingerprinter.fromJSON(JSON.parse(JSON.stringify(fp.toJSON())));
if (fp2.samples.length !== fp.samples.length) { console.error('FAIL: roundtrip'); process.exit(1); }
console.log('PASS');
