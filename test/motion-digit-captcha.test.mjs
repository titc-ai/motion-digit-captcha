// motion-digit-captcha の純関数の単体テスト。DOM は触れない。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  DEFAULTS, DIGIT_GLYPHS, GLYPH_COLS, GLYPH_ROWS, LABELS, resolveOptions,
  glyphContains, glyphArea, createLayer, advanceLayer, layerY, visibleDots,
  nextDigit, isCleared, createState, startState, applyAnswer, withDigit,
  mountMotionCaptcha,
} from "../motion-digit-captcha.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const S = DEFAULTS.size;
const OX = Math.round((S - GLYPH_COLS * DEFAULTS.cell) / 2);
const OY = Math.round((S - GLYPH_ROWS * DEFAULTS.cell) / 2);
const DOTS = Math.round(DEFAULTS.density * S * S);

test("モジュール読込だけでは DOM に触れない（document 未定義でも import できる）", () => {
  assert.equal(typeof document, "undefined");
  assert.equal(typeof mountMotionCaptcha, "function");
});

test("既定値: 260px・2000点・45px/秒・2問・1秒ロック・ja・autoStart無効・スタイル注入有効", () => {
  const o = resolveOptions();
  assert.equal(o.size, 260);
  assert.equal(o.dots, 2000);
  assert.equal(o.speed, 45);
  assert.equal(o.rounds, 2);
  assert.equal(o.lockMs, 1000);
  assert.equal(o.cell, 28);
  assert.equal(o.jitter, 12);
  assert.equal(o.lang, "ja");
  assert.equal(o.autoStart, false);
  assert.equal(o.injectStyles, true);
  assert.deepEqual(o.colors, { background: "#05060a", dot: "#ffd840" });
  assert.ok(GLYPH_COLS * o.cell + 2 * o.jitter <= o.size);
  assert.ok(GLYPH_ROWS * o.cell + 2 * o.jitter <= o.size);
});

test("resolveOptions: 上書き・不正値は既定値・lang 不明は ja・labels の個別上書き", () => {
  const o = resolveOptions({ rounds: 3, size: 200, lang: "en", colors: { dot: "#fff" }, labels: { start: "Go" }, speed: -5 });
  assert.equal(o.rounds, 3);
  assert.equal(o.size, 200);
  assert.equal(o.speed, 45);
  assert.equal(o.colors.dot, "#fff");
  assert.equal(o.colors.background, "#05060a");
  assert.equal(o.labels.start, "Go");
  assert.equal(o.labels.lead, LABELS.en.lead);
  assert.equal(resolveOptions({ lang: "xx" }).lang, "ja");
  const small = resolveOptions({ size: 130 });
  assert.equal(small.dots, 500);
  assert.ok(GLYPH_ROWS * small.cell + 2 * small.jitter <= 130);
  assert.equal(resolveOptions({ density: 0.01 }).dots, Math.round(0.01 * 260 * 260));
});

test("辞書: ja/en が同じキーを持つ", () => {
  assert.deepEqual(Object.keys(LABELS.ja).sort(), Object.keys(LABELS.en).sort());
});

test("DIGIT_GLYPHS: 0〜9の10種・すべて5x7・形がすべて異なる", () => {
  assert.equal(DIGIT_GLYPHS.length, 10);
  for (const rows of DIGIT_GLYPHS) {
    assert.equal(rows.length, GLYPH_ROWS);
    for (const row of rows) assert.match(row, /^[.#]{5}$/);
  }
  assert.equal(new Set(DIGIT_GLYPHS.map((r) => r.join("/"))).size, 10);
});

test("glyphContains: マス単位で形の内外を判定し、範囲外は false", () => {
  const cell = 28;
  assert.equal(glyphContains(1, cell, 0, 0, 2 * cell + 1, 1), true);
  assert.equal(glyphContains(1, cell, 0, 0, 1 * cell + 1, 1), false);
  assert.equal(glyphContains(1, cell, 50, 30, 50 + 2 * cell + 1, 31), true);
  assert.equal(glyphContains(1, cell, 50, 30, 2 * cell + 1, 1), false);
  assert.equal(glyphContains(8, cell, 0, 0, -1, 5), false);
  assert.equal(glyphContains(8, cell, 0, 0, GLYPH_COLS * cell, 5), false);
  assert.equal(glyphContains(10, cell, 0, 0, 5, 5), false);
});

test("glyphArea: 点の出るマス数×マスの面積", () => {
  assert.equal(glyphArea(1, 28), 10 * 28 * 28);
  assert.equal(glyphArea(99, 28), 0);
});

test("nextDigit: 直前と同じにならず 0〜9、直前なしなら制限なし、9候補が均等", () => {
  for (let prev = 0; prev <= 9; prev++) {
    for (let i = 0; i < 200; i++) {
      const n = nextDigit(prev, () => i / 200);
      assert.notEqual(n, prev);
      assert.ok(Number.isInteger(n) && n >= 0 && n <= 9);
    }
    assert.notEqual(nextDigit(prev, () => 0.999999), prev);
  }
  const seen = new Set();
  for (let i = 0; i < 100; i++) seen.add(nextDigit(-1, () => i / 100));
  assert.equal(seen.size, 10);
  const counts = new Array(10).fill(0);
  const rand = mulberry32(7);
  for (let i = 0; i < 9000; i++) counts[nextDigit(4, rand)]++;
  assert.equal(counts[4], 0);
  for (let d = 0; d < 10; d++) if (d !== 4) assert.ok(counts[d] > 800 && counts[d] < 1200);
});

test("applyAnswer: 連続正解でカウント、不正解で0に戻り、2連続でクリア", () => {
  let s = startState(3);
  s = applyAnswer(s, 3);
  assert.equal(s.streak, 1);
  assert.equal(s.last, "correct");
  s = withDigit(s, 7);
  s = applyAnswer(s, 2);
  assert.equal(s.streak, 0);
  assert.equal(s.last, "wrong");
  s = withDigit(s, 5);
  s = applyAnswer(s, 5);
  s = withDigit(s, 0);
  s = applyAnswer(s, 0);
  assert.equal(s.status, "cleared");
  assert.ok(isCleared(s.streak));
});

test("applyAnswer: 正解→不正解→正解ではクリアにならない", () => {
  let s = startState(1);
  s = applyAnswer(s, 1);
  s = withDigit(s, 2);
  s = applyAnswer(s, 9);
  s = withDigit(s, 3);
  s = applyAnswer(s, 3);
  assert.equal(s.streak, 1);
  assert.equal(s.status, "playing");
});

test("rounds を変えると判定が変わる（rounds=1 は1問、rounds=3 は3連続）", () => {
  let s = applyAnswer(startState(4), 4, 1);
  assert.equal(s.status, "cleared");
  assert.ok(isCleared(1, 1));
  s = startState(4);
  s = applyAnswer(s, 4, 3);
  s = withDigit(s, 6);
  s = applyAnswer(s, 6, 3);
  assert.equal(s.status, "playing");
  s = withDigit(s, 8);
  s = applyAnswer(s, 8, 3);
  assert.equal(s.status, "cleared");
});

test("applyAnswer: idle・クリア済みでは無視される", () => {
  const idle = createState();
  assert.equal(applyAnswer(idle, 0), idle);
  const s = applyAnswer(startState(4), 4, 1);
  assert.equal(applyAnswer(s, 4, 1), s);
});

test("createLayer: 点の数・範囲・同じシードなら同じ配置", () => {
  const a = createLayer(500, 260, 260, mulberry32(1));
  const b = createLayer(500, 260, 260, mulberry32(1));
  assert.equal(a.n, 500);
  assert.deepEqual(Array.from(a.xs), Array.from(b.xs));
  for (let i = 0; i < a.n; i++) {
    assert.ok(a.xs[i] >= 0 && a.xs[i] < 260 && a.ys[i] >= 0 && a.ys[i] < 260);
  }
  assert.equal(a.dy, 0);
});

test("advanceLayer: 下へ動かし端で回り込む（元の層は変えない）", () => {
  const h = 260;
  const layer = { n: 2, w: 260, h, xs: Float64Array.of(10, 20), ys: Float64Array.of(h - 1, 5), dy: 0 };
  const moved = advanceLayer(layer, 3, h);
  assert.equal(layer.dy, 0);
  assert.equal(layerY(moved, 0), 2);
  assert.equal(layerY(moved, 1), 8);
  const up = advanceLayer(layer, -10, h);
  assert.equal(layerY(up, 0), h - 11);
  let l = layer;
  for (let i = 0; i < 1000; i++) l = advanceLayer(l, 7.3, h);
  for (let i = 0; i < l.n; i++) assert.ok(layerY(l, i) >= 0 && layerY(l, i) < h);
  const full = advanceLayer(advanceLayer(layer, 100, h), h - 100, h);
  assert.ok(Math.abs(layerY(full, 0) - layerY(layer, 0)) < 1e-9);
});

test("visibleDots: 層Fは内側だけ、層Bは外側だけを残す", () => {
  const F = { n: 3, w: 260, h: 260, xs: Float64Array.of(100, 5, 130), ys: Float64Array.of(100, 5, 120), dy: 0 };
  const B = { ...F };
  assert.deepEqual(visibleDots(F, B, (x) => x > 50), [100, 100, 130, 120, 5, 5]);
});

test("静止画の一様性: 内側と外側の点の密度の比が 0.85〜1.15（全数字・動かした後も）", () => {
  const area = S * S;
  for (let digit = 0; digit < 10; digit++) {
    const rand = mulberry32(1000 + digit);
    let layerF = createLayer(DOTS, S, S, rand);
    let layerB = createLayer(DOTS, S, S, rand);
    const inside = (x, y) => glyphContains(digit, DEFAULTS.cell, OX, OY, x, y);
    const glyph = glyphArea(digit, DEFAULTS.cell);
    for (let frame = 0; frame < 3; frame++) {
      const dots = visibleDots(layerF, layerB, inside);
      let nIn = 0;
      let nOut = 0;
      for (let i = 0; i < dots.length; i += 2) {
        if (inside(dots[i], dots[i + 1])) nIn++; else nOut++;
      }
      const ratio = (nIn / glyph) / (nOut / (area - glyph));
      assert.ok(ratio >= 0.85 && ratio <= 1.15, `digit ${digit} frame ${frame}: ${ratio.toFixed(3)}`);
      layerF = advanceLayer(layerF, DEFAULTS.speed * 0.5);
      layerB = advanceLayer(layerB, -DEFAULTS.speed * 0.5);
    }
  }
});

test("動き: 内側の点は下へ、外側の点は上へ動く", () => {
  const rand = mulberry32(42);
  const layerF = createLayer(DOTS, S, S, rand);
  const layerB = createLayer(DOTS, S, S, rand);
  const inside = (x, y) => glyphContains(8, DEFAULTS.cell, OX, OY, x, y);
  const dy = 1;
  const before = visibleDots(layerF, layerB, inside);
  const after = visibleDots(advanceLayer(layerF, dy), advanceLayer(layerB, -dy), inside);
  const key = (x, y) => x.toFixed(6) + "," + y.toFixed(6);
  const afterSet = new Set();
  for (let i = 0; i < after.length; i += 2) afterSet.add(key(after[i], after[i + 1]));
  let cin = 0;
  let cout = 0;
  for (let i = 0; i < before.length; i += 2) {
    const x = before[i];
    const y = before[i + 1];
    if (inside(x, y) && inside(x, y + dy) && inside(x, y - dy)) {
      cin++;
      assert.ok(afterSet.has(key(x, (y + dy) % S)));
    } else if (!inside(x, y) && !inside(x, y + dy) && !inside(x, y - dy)) {
      cout++;
      assert.ok(afterSet.has(key(x, (y - dy + S) % S)));
    }
  }
  assert.ok(cin > 50 && cout > 500);
});

test("答えを出さない: ソースに console 出力が無い", () => {
  const src = readFileSync(path.join(__dirname, "..", "motion-digit-captcha.js"), "utf8");
  assert.ok(!/console\./.test(src));
});

// ---- 1.0.1 で直した不具合の回帰テスト ----

test("resolveOptions: lang に Object.prototype のキー名を渡しても ja になる", () => {
  for (const lang of ["constructor", "toString", "__proto__", "hasOwnProperty"]) {
    const o = resolveOptions({ lang });
    assert.equal(o.lang, "ja", lang);
    assert.equal(o.labels.start, LABELS.ja.start, lang);
  }
});

test("resolveOptions: jitter が大きすぎても数字がキャンバスに収まる", () => {
  for (const size of [50, 130, 260]) {
    const o = resolveOptions({ size, jitter: 1000 });
    assert.ok(GLYPH_COLS * o.cell + 2 * o.jitter <= o.size, `cols size=${size}`);
    assert.ok(GLYPH_ROWS * o.cell + 2 * o.jitter <= o.size, `rows size=${size}`);
  }
  assert.equal(resolveOptions({ jitter: 5 }).jitter, 5);
});

test("visibleDots: out を渡すと同じ配列を空にして使い回す", () => {
  const F = { n: 2, w: 260, h: 260, xs: Float64Array.of(100, 5), ys: Float64Array.of(100, 5), dy: 0 };
  const buf = [9, 9, 9];
  const r1 = visibleDots(F, F, (x) => x > 50, buf);
  assert.equal(r1, buf);
  assert.deepEqual(buf, [100, 100, 5, 5]);
  assert.deepEqual(visibleDots(F, F, (x) => x > 50, buf), [100, 100, 5, 5]);
});

// 最小限の偽DOM（mountMotionCaptcha の挙動確認用。ブラウザ実機の代わりではない）
function makeFakeDom() {
  const listeners = (o) => (o._l ??= {});
  class Node_ {
    constructor(tag) { this.tag = tag; this.children = []; this.attrs = {}; this.style = { setProperty() {} }; this._text = ""; this.disabled = false; this.className = ""; }
    setAttribute(k, v) { this.attrs[k] = String(v); }
    appendChild(c) { this.children.push(c); c.parent = this; return c; }
    append(...cs) { cs.forEach((c) => this.appendChild(c)); }
    set textContent(v) { this._text = String(v); if (v === "") this.children = []; }
    get textContent() { return this._text; }
    addEventListener(t, f) { (listeners(this)[t] ??= []).push(f); }
    removeEventListener(t, f) { const a = listeners(this)[t] || []; const i = a.indexOf(f); if (i >= 0) a.splice(i, 1); }
    dispatchEvent(ev) { (listeners(this)[ev.type] || []).slice().forEach((f) => f(ev)); return true; }
    click() { if (!this.disabled) this.dispatchEvent({ type: "click" }); }
    focus() { this.ownerDocument.activeElement = this; }
    getContext() { return { fillRect() {}, fillText() {}, set fillStyle(v) {}, set font(v) {}, set textAlign(v) {} }; }
  }
  const doc = new Node_("document");
  doc.hidden = false;
  doc.body = new Node_("body");
  doc.head = new Node_("head");
  doc.activeElement = doc.body;
  doc.getElementById = (id) => doc.head.children.find((c) => c.attrs.id === id) || null;
  doc.createElement = (tag) => { const n = new Node_(tag); n.ownerDocument = doc; n.id = ""; Object.defineProperty(n, "id", { set(v) { n.attrs.id = v; }, get() { return n.attrs.id; } }); return n; };
  const container = doc.createElement("div");
  const all = (n) => [n, ...n.children.flatMap(all)];
  return { doc, container, find: (cls) => all(container).filter((n) => n.className === cls) };
}

function withFakeRaf(fn) {
  const pending = new Map();
  let nextId = 1;
  const saved = [globalThis.requestAnimationFrame, globalThis.cancelAnimationFrame];
  globalThis.requestAnimationFrame = (f) => { pending.set(nextId, f); return nextId++; };
  globalThis.cancelAnimationFrame = (id) => { pending.delete(id); };
  try { return fn(pending); } finally { [globalThis.requestAnimationFrame, globalThis.cancelAnimationFrame] = saved; }
}

test("mount: 連続正解で onSuccess が1回だけ・mdc:success も1回・クリア後の誤クリックは無視", () => {
  withFakeRaf(() => {
    const { container, find } = makeFakeDom();
    let ok = 0, ev = 0;
    container.addEventListener("mdc:success", () => ev++);
    const c = mountMotionCaptcha(container, { rand: () => 0.35, onSuccess: () => ok++ });
    const btns = find("mdc-btn");
    find("mdc-start")[0].click();
    btns[3].click(); // 1問目は常に 3（rand 固定）
    assert.equal(c.isSolved(), false);
    btns[4].click(); // 2問目は 4
    assert.equal(c.isSolved(), true);
    btns[4].click(); btns[3].click(); find("mdc-start")[0].click();
    assert.equal(ok, 1);
    assert.equal(ev, 1);
    c.reset();
    assert.equal(c.isSolved(), false);
  });
});

test("mount: onSuccess が例外を投げても mdc:success は発火する", () => {
  withFakeRaf(() => {
    const { container, find } = makeFakeDom();
    let ev = 0;
    container.addEventListener("mdc:success", () => ev++);
    mountMotionCaptcha(container, { rounds: 1, rand: () => 0.35, onSuccess() { throw new Error("x"); } });
    find("mdc-start")[0].click();
    assert.throws(() => find("mdc-btn")[3].click());
    assert.equal(ev, 1);
  });
});

test("mount: destroy は二重に呼べて、rAF が残らず、destroy 後の reset/start は何もしない", () => {
  withFakeRaf((pending) => {
    const { doc, container, find } = makeFakeDom();
    const c = mountMotionCaptcha(container, { rand: () => 0.35 });
    find("mdc-start")[0].click();
    assert.equal(pending.size, 1);
    c.destroy();
    c.destroy();
    assert.equal(pending.size, 0);
    assert.equal(container.children.length, 0);
    assert.equal((doc._l?.visibilitychange || []).length, 0);
    c.reset();
    assert.equal(c.isSolved(), false);
  });
});

test("mount: 不正解でロック→lockMs後に解除され、ラベルの {constructor} は置換されない", async () => {
  await withFakeRaf(async () => {
    const { container, find } = makeFakeDom();
    let fails = [];
    mountMotionCaptcha(container, { rand: () => 0.35, lockMs: 5, labels: { wrong: "NG {constructor} {progress}" }, onFail: (e) => fails.push(e.streak) });
    find("mdc-start")[0].click();
    const btns = find("mdc-btn");
    btns[9].click();
    assert.deepEqual(fails, [0]);
    assert.ok(btns.every((b) => b.disabled));
    assert.equal(find("mdc-info")[0].textContent, "NG {constructor} 0 / 2 問正解");
    await new Promise((r) => setTimeout(r, 30));
    assert.ok(btns.every((b) => !b.disabled));
  });
});

test("mount: 答えの数字を属性・テキストに出さない（数字ボタンの文字と文言のみ）", () => {
  withFakeRaf(() => {
    const { container, find } = makeFakeDom();
    mountMotionCaptcha(container, { rand: () => 0.35 });
    find("mdc-start")[0].click();
    const dump = JSON.stringify(find("mdc-canvas").map((n) => n.attrs).concat(find("mdc-info").map((n) => n.textContent), find("mdc-digits").map((n) => n.attrs)));
    assert.ok(!/\b3\b/.test(dump.replace(/"width":"260"|"height":"260"/g, "")));
  });
});
