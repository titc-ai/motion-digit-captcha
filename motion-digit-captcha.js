// motion-digit-captcha: 「動きで浮かぶ数字」ミニゲーム。依存ゼロ・ビルド不要の ES module。
// 2つの点の層（層Fは下へ・層Bは上へ同じ速さ）を全面に一様に散らし、
// 描くのは「層Fのうち数字の形の内側」＋「層Bのうち外側」だけ。静止画は一様なノイズ、動くと数字が浮かぶ。
// 純関数（DOMに触れない）と mountMotionCaptcha（DOMに触れる）に分かれる。モジュールの読込だけではDOMに触れない。
// 答えの数字は DOM・属性・aria・console に出さず、mountMotionCaptcha のクロージャの中だけに持つ。

// 5x7 のビットマップ数字（'#' が点の出る面）
export const DIGIT_GLYPHS = Object.freeze([
  ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'], // 0
  ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'], // 1
  ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'], // 2
  ['.###.', '#...#', '....#', '..##.', '....#', '#...#', '.###.'], // 3
  ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'], // 4
  ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'], // 5
  ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'], // 6
  ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'], // 7
  ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'], // 8
  ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..']  // 9
].map((rows) => Object.freeze(rows)));

export const GLYPH_COLS = 5;
export const GLYPH_ROWS = 7;

// 既定値。density は 1px² あたりの点の数（260x260 に 2000 点 = 元実装と同じ密度）。
export const DEFAULTS = Object.freeze({
  rounds: 2,
  lockMs: 1000,
  size: 260,
  speed: 45,
  density: 2000 / (260 * 260),
  cell: 28,
  jitter: 12,
  dotSize: 2,
  lang: 'ja',
  autoStart: false,
  injectStyles: true,
  colors: Object.freeze({ background: '#05060a', dot: '#ffd840' })
});

// 文言辞書。{rounds} {streak} {progress} が置換される。答えは含めない。
export const LABELS = Object.freeze({
  ja: Object.freeze({
    lead: '点の中に、動きで浮かび上がる数字があります。その数字を押してください（{rounds}問連続で正解するとクリア）',
    canvasLabel: '動く点の模様。点の動きから数字が見えます。',
    groupLabel: '見えた数字を選ぶ',
    start: '▶ スタート',
    playing: 'プレイ中...',
    done: 'クリア済み',
    placeholderIdle: 'スタートで点が動きます',
    placeholderClear: 'CLEAR!',
    infoIdle: 'スタートを押してください（0 / {rounds} 問正解）',
    progress: '{streak} / {rounds} 問正解',
    correct: '{progress}。新しい数字です',
    wrong: 'ちがいます。新しい数字です（{progress}）',
    solved: 'クリア！ 送信できます。'
  }),
  en: Object.freeze({
    lead: 'A digit hides in the moving dots. Press that digit ({rounds} correct answers in a row to pass).',
    canvasLabel: 'Pattern of moving dots. A digit appears from the motion.',
    groupLabel: 'Choose the digit you saw',
    start: '▶ Start',
    playing: 'Playing...',
    done: 'Cleared',
    placeholderIdle: 'Press Start to move the dots',
    placeholderClear: 'CLEAR!',
    infoIdle: 'Press Start (0 / {rounds} correct)',
    progress: '{streak} / {rounds} correct',
    correct: '{progress}. Here is a new digit.',
    wrong: 'Wrong. Here is a new digit ({progress})',
    solved: 'Cleared! You can submit now.'
  })
});

const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

function format(text, vars) {
  return String(text).replace(/\{(\w+)\}/g, (m, k) => (has(vars, k) ? String(vars[k]) : m));
}

// options を既定値と合わせて正規化する（純関数）。点の数 dots と実効の cell もここで決める。
export function resolveOptions(options = {}) {
  const o = options || {};
  const num = (v, d, min) => (Number.isFinite(v) && v >= min ? v : d);
  const size = Math.round(num(o.size, DEFAULTS.size, 50));
  // ずらしが大きすぎて数字がキャンバスの外に出ないよう、1マス1pxの数字が収まる範囲に抑える
  const jitter = Math.min(num(o.jitter, DEFAULTS.jitter, 0), Math.floor((size - GLYPH_ROWS) / 2));
  // 数字（5x7マス）がずらしを含めてキャンバスに収まるよう、cell を上限で抑える
  const maxCell = Math.max(1, Math.floor((size - 2 * jitter) / GLYPH_ROWS));
  const cell = Math.min(num(o.cell, DEFAULTS.cell, 1), maxCell);
  const density = num(o.density, DEFAULTS.density, 0);
  const lang = has(LABELS, o.lang) ? o.lang : DEFAULTS.lang;
  return {
    rounds: Math.max(1, Math.round(num(o.rounds, DEFAULTS.rounds, 1))),
    lockMs: num(o.lockMs, DEFAULTS.lockMs, 0),
    size,
    speed: num(o.speed, DEFAULTS.speed, 0),
    density,
    dots: Math.max(1, Math.round(density * size * size)),
    cell,
    jitter,
    dotSize: DEFAULTS.dotSize,
    lang,
    autoStart: o.autoStart === true,
    injectStyles: o.injectStyles !== false,
    colors: { ...DEFAULTS.colors, ...(o.colors || {}) },
    labels: { ...LABELS[lang], ...(o.labels || {}) }
  };
}

// 点 (x, y) が、左上 (ox, oy)・1マス cell px で置いた数字 digit の形の内側にあるか。
export function glyphContains(digit, cell, ox, oy, x, y) {
  const rows = DIGIT_GLYPHS[digit];
  if (!rows) return false;
  const gx = Math.floor((x - ox) / cell);
  const gy = Math.floor((y - oy) / cell);
  if (gx < 0 || gx >= GLYPH_COLS || gy < 0 || gy >= GLYPH_ROWS) return false;
  return rows[gy][gx] === '#';
}

// 数字の形の面積（px²）
export function glyphArea(digit, cell) {
  const rows = DIGIT_GLYPHS[digit];
  if (!rows) return 0;
  let n = 0;
  for (const row of rows) for (const ch of row) if (ch === '#') n++;
  return n * cell * cell;
}

function wrap(v, h) {
  return ((v % h) + h) % h;
}

// キャンバス全面に一様にランダムな n 個の点の層。rand は 0以上1未満を返す関数。
// 点の元の位置は変えず、層全体のずれ dy だけを持つ（動かすのは advanceLayer）。
export function createLayer(n, w, h, rand = Math.random) {
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    xs[i] = rand() * w;
    ys[i] = rand() * h;
  }
  return { n, w, h, xs, ys, dy: 0 };
}

// 層を縦に dy px 動かす（負なら上）。端で反対側へ回り込むので、点の分布は一様なまま。
export function advanceLayer(layer, dy, h = layer.h) {
  return { ...layer, dy: wrap(layer.dy + dy, h) };
}

// i 番目の点の現在の縦位置
export function layerY(layer, i) {
  return wrap(layer.ys[i] + layer.dy, layer.h);
}

// 描く点の一覧 [x0, y0, x1, y1, ...]。層Fは形の内側だけ、層Bは形の外側だけを残す。
// out を渡すと、その配列を空にして使い回す（毎フレームの配列確保を避けたいとき用）。
export function visibleDots(layerF, layerB, inside, out = []) {
  out.length = 0;
  for (let i = 0; i < layerF.n; i++) {
    const x = layerF.xs[i];
    const y = layerY(layerF, i);
    if (inside(x, y)) out.push(x, y);
  }
  for (let i = 0; i < layerB.n; i++) {
    const x = layerB.xs[i];
    const y = layerY(layerB, i);
    if (!inside(x, y)) out.push(x, y);
  }
  return out;
}

// 直前と同じ数字にならないように次の数字を選ぶ（prev が範囲外なら制限なし）。
export function nextDigit(prev, rand = Math.random) {
  if (!Number.isInteger(prev) || prev < 0 || prev > 9) return Math.min(9, Math.floor(rand() * 10));
  const k = Math.min(8, Math.floor(rand() * 9));
  return k >= prev ? k + 1 : k;
}

export function isCleared(streak, target = DEFAULTS.rounds) {
  return streak >= target;
}

export function createState() {
  return { status: 'idle', digit: -1, streak: 0, last: null }; // status: idle | playing | cleared
}

export function startState(digit) {
  return { status: 'playing', digit, streak: 0, last: null };
}

// 回答。正解なら連続正解数+1（目標に届いたらcleared）、不正解なら0に戻す。
export function applyAnswer(state, answer, target = DEFAULTS.rounds) {
  if (state.status !== 'playing') return state;
  if (answer !== state.digit) return { ...state, streak: 0, last: 'wrong' };
  const streak = state.streak + 1;
  if (isCleared(streak, target)) return { ...state, streak, status: 'cleared', last: 'correct' };
  return { ...state, streak, last: 'correct' };
}

export function withDigit(state, digit) {
  return { ...state, digit };
}

// ---- DOM（ブラウザ専用）。ここから下は mountMotionCaptcha を呼んだときだけ DOM に触る ----

const STYLE_ID = 'mdc-styles';
const CSS = [
  '.mdc{font-family:var(--mdc-font,inherit);color:var(--mdc-text,inherit);box-sizing:border-box;width:100%;max-width:var(--mdc-size,260px);margin:0 auto}',
  '.mdc *{box-sizing:border-box}',
  '.mdc-lead{margin:0 0 8px;font-size:.9em;line-height:1.5}',
  '.mdc-stage{width:100%;aspect-ratio:1/1;background:var(--mdc-bg,#05060a);border-radius:var(--mdc-radius,8px);overflow:hidden}',
  '.mdc-canvas{display:block;width:100%;height:100%}',
  '.mdc-digits{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin:10px 0}',
  '.mdc-btn{min-height:44px;min-width:44px;padding:0;font:inherit;font-size:1.2em;font-weight:700;background:var(--mdc-btn-bg,#fff);color:var(--mdc-btn-fg,#111);border:1px solid var(--mdc-btn-border,#888);border-radius:var(--mdc-radius,8px);cursor:pointer}',
  '.mdc-btn:focus-visible{outline:3px solid var(--mdc-accent,#2457d6);outline-offset:2px}',
  '.mdc-btn:disabled{opacity:.45;cursor:not-allowed}',
  '.mdc-start{width:100%;min-height:44px;font:inherit;font-weight:700;background:var(--mdc-accent,#2457d6);color:#fff;border:0;border-radius:var(--mdc-radius,8px);cursor:pointer}',
  '.mdc-start:focus-visible{outline:3px solid var(--mdc-accent,#2457d6);outline-offset:2px}',
  '.mdc-start:disabled{opacity:.55;cursor:not-allowed}',
  '.mdc-info{margin:8px 0 0;min-height:1.5em;font-size:.9em}'
].join('');

function injectStyleOnce(doc) {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}

function el(doc, tag, cls, attrs) {
  const e = doc.createElement(tag);
  if (cls) e.className = cls;
  if (attrs) for (const k of Object.keys(attrs)) e.setAttribute(k, attrs[k]);
  return e;
}

// container: 置き場所の要素。戻り値 { reset(), destroy(), isSolved() }。
export function mountMotionCaptcha(container, options = {}) {
  const cfg = resolveOptions(options);
  const { onSuccess, onFail } = options || {};
  const rand = (options && typeof options.rand === 'function') ? options.rand : Math.random;
  const L = cfg.labels;
  const S = cfg.size;
  const fmt = (t, extra) => format(t, { rounds: cfg.rounds, streak: state.streak, ...extra });

  const doc = container.ownerDocument || document;
  if (cfg.injectStyles) injectStyleOnce(doc);
  container.textContent = '';
  const root = el(doc, 'div', 'mdc');
  root.style.setProperty('--mdc-size', S + 'px');
  root.style.setProperty('--mdc-bg', cfg.colors.background);
  root.style.setProperty('--mdc-dot', cfg.colors.dot);
  const lead = el(doc, 'p', 'mdc-lead');
  const stage = el(doc, 'div', 'mdc-stage');
  const canvas = el(doc, 'canvas', 'mdc-canvas', { width: S, height: S, role: 'img' });
  stage.appendChild(canvas);
  const group = el(doc, 'div', 'mdc-digits', { role: 'group' });
  const digitBtns = [];
  for (let d = 0; d < 10; d++) {
    const b = el(doc, 'button', 'mdc-btn', { type: 'button' });
    b.textContent = String(d);
    b.disabled = true;
    group.appendChild(b);
    digitBtns.push(b);
  }
  const startBtn = el(doc, 'button', 'mdc-start', { type: 'button' });
  const infoEl = el(doc, 'p', 'mdc-info', { role: 'status', 'aria-live': 'polite' });
  root.append(lead, stage, group, startBtn, infoEl);
  container.appendChild(root);
  lead.textContent = format(L.lead, { rounds: cfg.rounds });
  canvas.setAttribute('aria-label', L.canvasLabel);
  group.setAttribute('aria-label', L.groupLabel);

  const ctx = canvas.getContext('2d');
  let state = createState(); // 答え（state.digit）はここだけに持つ
  let layerF = null;
  let layerB = null;
  let inside = () => false; // 現在のラウンドの数字の内側判定（ラウンドごとに作り直す）
  const dotBuf = []; // 描く点の一時置き場（毎フレーム使い回す）
  let rafId = null;
  let lastT = 0;
  let lockTimer = null;
  let locked = false;
  let destroyed = false;
  let solved = false;
  const api = { reset() {}, destroy() {}, isSolved: () => solved };
  if (!ctx) return api;

  function setDigitButtons(enabled) {
    digitBtns.forEach((b) => { b.disabled = !enabled; });
  }
  function drawPlaceholder(text) {
    ctx.fillStyle = cfg.colors.background;
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = cfg.colors.dot;
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(text, S / 2, S / 2 + 6);
  }
  const say = (text) => { infoEl.textContent = text; };
  const progress = () => fmt(L.progress);

  // 新しい数字・置き場所・点の層にする
  function newRound() {
    const digit = nextDigit(state.digit, rand);
    state = withDigit(state, digit);
    const jx = Math.round((rand() * 2 - 1) * cfg.jitter);
    const jy = Math.round((rand() * 2 - 1) * cfg.jitter);
    const ox = Math.round((S - GLYPH_COLS * cfg.cell) / 2) + jx;
    const oy = Math.round((S - GLYPH_ROWS * cfg.cell) / 2) + jy;
    inside = (x, y) => glyphContains(digit, cfg.cell, ox, oy, x, y);
    layerF = createLayer(cfg.dots, S, S, rand);
    layerB = createLayer(cfg.dots, S, S, rand);
  }

  function draw() {
    const dots = visibleDots(layerF, layerB, inside, dotBuf);
    ctx.fillStyle = cfg.colors.background;
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = cfg.colors.dot;
    for (let i = 0; i < dots.length; i += 2) {
      ctx.fillRect(Math.floor(dots[i]), Math.floor(dots[i + 1]), cfg.dotSize, cfg.dotSize);
    }
  }

  function frame(now) {
    rafId = requestAnimationFrame(frame);
    // フレームレートに依存しないよう経過時間で動かす（長い中断のあとは飛びすぎないよう上限をつける）
    const dt = lastT ? Math.min(0.1, (now - lastT) / 1000) : 0;
    lastT = now;
    layerF.dy = wrap(layerF.dy + cfg.speed * dt, S);
    layerB.dy = wrap(layerB.dy - cfg.speed * dt, S);
    draw();
  }
  function startLoop() {
    if (rafId || destroyed) return;
    lastT = 0;
    rafId = requestAnimationFrame(frame);
  }
  function stopLoop() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  }
  function clearLock() {
    if (lockTimer) { clearTimeout(lockTimer); lockTimer = null; }
    locked = false;
  }
  function onVisibilityChange() {
    if (doc.hidden) stopLoop();
    else if (state.status === 'playing') startLoop();
  }
  doc.addEventListener('visibilitychange', onVisibilityChange);

  function renderIdle() {
    stopLoop();
    state = createState();
    layerF = layerB = null;
    clearLock();
    solved = false;
    setDigitButtons(false);
    startBtn.disabled = false;
    startBtn.textContent = L.start;
    drawPlaceholder(L.placeholderIdle);
    say(fmt(L.infoIdle));
  }

  function answer(d) {
    if (destroyed || state.status !== 'playing' || locked) return;
    state = applyAnswer(state, d, cfg.rounds);
    if (state.status === 'cleared') {
      stopLoop();
      clearLock();
      solved = true;
      setDigitButtons(false);
      startBtn.disabled = true;
      startBtn.textContent = L.done;
      drawPlaceholder(L.placeholderClear);
      say(fmt(L.solved));
      try {
        if (typeof onSuccess === 'function') onSuccess();
      } finally {
        container.dispatchEvent(new CustomEvent('mdc:success', { bubbles: true }));
      }
      return;
    }
    newRound();
    if (state.last === 'wrong') {
      say(fmt(L.wrong, { progress: progress() }));
      locked = true;
      // ボタンを無効にするとフォーカスが失われるので、解除後に戻せるよう覚えておく
      const focused = digitBtns.includes(doc.activeElement) ? doc.activeElement : null;
      setDigitButtons(false);
      lockTimer = setTimeout(() => {
        lockTimer = null;
        locked = false;
        if (destroyed || state.status !== 'playing') return;
        setDigitButtons(true);
        if (focused && (!doc.activeElement || doc.activeElement === doc.body)) focused.focus();
      }, cfg.lockMs);
      if (typeof onFail === 'function') onFail({ streak: state.streak });
    } else {
      say(fmt(L.correct, { progress: progress() }));
    }
  }

  function start() {
    if (destroyed || state.status === 'playing' || state.status === 'cleared') return;
    clearLock();
    const hadFocus = doc.activeElement === startBtn;
    state = startState(-1);
    newRound();
    setDigitButtons(true);
    if (hadFocus) digitBtns[0].focus(); // 無効になるスタートボタンからフォーカスを移す
    startBtn.disabled = true;
    startBtn.textContent = L.playing;
    say(progress());
    startLoop();
  }

  digitBtns.forEach((b, d) => b.addEventListener('click', () => answer(d)));
  startBtn.addEventListener('click', start);

  api.reset = () => { if (!destroyed) renderIdle(); };
  api.destroy = () => {
    if (destroyed) return;
    destroyed = true;
    stopLoop();
    clearLock();
    doc.removeEventListener('visibilitychange', onVisibilityChange);
    container.textContent = '';
  };

  renderIdle();
  if (cfg.autoStart) start();
  return api;
}
