# motion-digit-captcha

動いている点の模様から、数字を当てるだけの小さなミニゲーム型「人間らしさ確認」部品です。依存ゼロ・ビルド不要の ES module 1 ファイル（`motion-digit-captcha.js`）で、フォームの送信ボタンを「クリアするまで無効」にする使い方を想定しています。

## 仕組み

- 画面全面に、同じ密度で一様に散らした点の層を 2 枚重ねます。層F は下へ、層B は上へ、同じ速さで動き、端で反対側へ回り込みます。
- 描くのは「層F の点のうち数字の形の内側にあるもの」と「層B の点のうち外側にあるもの」だけです。
- 止まった画像（スクリーンショット 1 枚）は、内側も外側も同じ密度の点が散っているだけの一様なノイズです。動かすと、内側の点だけが下へ流れ、数字の形が浮かび上がります。
- 5x7 のビットマップ数字を使い、連続で正解するとクリア（既定 2 問）。不正解のあとは一定時間ボタンが無効になり、別の数字に変わります。
- 答えの数字は DOM・属性・aria・console のどこにも出さず、関数のクロージャの中だけに保持します。

デモ: `demo/index.html` を開くと、日本語/英語の切替と「クリアすると送信ボタンが有効になる」例を試せます。ES module を `file://` で読めないブラウザがあるため、リポジトリ直下で簡易サーバを立ててください（例: `python -m http.server 8080` のあと `http://localhost:8080/demo/`、または `npx serve`）。

## AIエージェント向け: 組み込み手順

次の 5 手順で組み込みます。順番どおりに実行してください。

1. **ファイルを入手する**
   - CDN から読む: `https://cdn.jsdelivr.net/gh/titc-ai/motion-digit-captcha@v1.0.0/motion-digit-captcha.js`
   - または `motion-digit-captcha.js` をプロジェクトにコピーして相対パスで読む（npm 配布はしていません。ビルドも不要です）。
2. **置き場所の `<div>` を用意する**: `<div id="captcha"></div>` をフォーム内の送信ボタンの直前に置く。
3. **`mountMotionCaptcha` を呼ぶ**（ブラウザで DOM が使える時点で、1 回だけ）。
4. **送信ボタンを `onSuccess` まで無効にする**: HTML 側で `disabled` にしておき、`onSuccess` で有効化する。
5. **確認方法**: ページを開き、スタート → 数字ボタンを `rounds` 回連続で正解させると送信ボタンが有効になること、わざと間違えるとボタンが約 1 秒無効になり別の数字に変わること、390px 幅でも枠が収まることを確かめる。DOM・属性・コンソールに答えが出ていないことも確認する。

```html
<form id="form">
  <!-- 入力欄 -->
  <div id="captcha"></div>
  <button id="send" type="submit" disabled>送信</button>
</form>
<script type="module">
  import { mountMotionCaptcha } from 'https://cdn.jsdelivr.net/gh/titc-ai/motion-digit-captcha@v1.0.0/motion-digit-captcha.js';
  const send = document.getElementById('send');
  mountMotionCaptcha(document.getElementById('captcha'), {
    onSuccess() { send.disabled = false; }
  });
</script>
```

### API: `mountMotionCaptcha(container, options?)`

`container` は置き場所の要素。中身は `mount` 時に空にされ、`destroy()` でも空になります。

| オプション | 型 | 既定値 | 説明 |
|---|---|---|---|
| `onSuccess` | `() => void` | なし | クリア時に 1 回呼ばれる |
| `onFail` | `({ streak }) => void` | なし | 不正解時に呼ばれる（`streak` は 0 に戻った連続正解数） |
| `rounds` | number | `2` | クリアに必要な連続正解数 |
| `lockMs` | number | `1000` | 不正解後に数字ボタンを無効にする時間（ミリ秒） |
| `size` | number | `260` | キャンバスの最大幅 px（正方形）。container が狭ければ縮む |
| `speed` | number | `45` | 点の速さ（px/秒、経過時間ベース） |
| `density` | number | `2000/260²` | 1px² あたりの点の数（各層）。既定は 260x260 で 2000 点 |
| `cell` | number | `28` | 数字の 1 マスの大きさ px（キャンバスに収まるよう自動で上限が掛かる） |
| `jitter` | number | `12` | ラウンドごとの置き場所のずれ（±px） |
| `colors` | `{ background, dot }` | `{ background: '#05060a', dot: '#ffd840' }` | キャンバスの色 |
| `lang` | `'ja' \| 'en'` | `'ja'` | 文言の言語 |
| `labels` | object | なし | 文言の個別上書き。キーは `lead` `canvasLabel` `groupLabel` `start` `playing` `done` `placeholderIdle` `placeholderClear` `infoIdle` `progress` `correct` `wrong` `solved`。`{rounds}` `{streak}` `{progress}` が置換される |
| `autoStart` | boolean | `false` | mount 直後に自動でスタートする |
| `injectStyles` | boolean | `true` | `mdc-` 接頭辞のクラスだけを使う CSS を 1 回だけ `<style id="mdc-styles">` で注入する。`false` なら自前で CSS を書く |
| `rand` | `() => number` | `Math.random` | 乱数（テスト用） |

**戻り値**: `{ reset(), destroy(), isSolved() }`

- `reset()`: 最初の状態（スタート前）に戻す。クリア済みでも再挑戦できる。
- `destroy()`: rAF・タイマー・イベントリスナーを解除し、container の中身を空にする。
- `isSolved()`: クリア済みなら `true`。

**イベント**: クリア時に `onSuccess` に加え、container で `CustomEvent('mdc:success', { bubbles: true })` が発火します。

```js
form.addEventListener('mdc:success', () => { send.disabled = false; });
```

**CSS 変数**（`.mdc` 要素、または container に設定して上書き）:

| 変数 | 既定値 | 用途 |
|---|---|---|
| `--mdc-bg` | `#05060a` | キャンバス背景（`colors.background` で設定される） |
| `--mdc-dot` | `#ffd840` | 点の色（`colors.dot` で設定される） |
| `--mdc-radius` | `8px` | 角丸 |
| `--mdc-font` | `inherit` | フォント |
| `--mdc-text` | `inherit` | 文字色 |
| `--mdc-btn-bg` / `--mdc-btn-fg` / `--mdc-btn-border` | `#fff` / `#111` / `#888` | 数字ボタン |
| `--mdc-accent` | `#2457d6` | スタートボタン・フォーカス枠 |

### フレームワーク別の例

mount は必ずブラウザで DOM が使える時点（マウント後）に行い、アンマウント時に `destroy()` を呼びます。

**React**

```jsx
import { useEffect, useRef, useState } from 'react';
import { mountMotionCaptcha } from './motion-digit-captcha.js';

export function Form() {
  const box = useRef(null);
  const [ok, setOk] = useState(false);
  useEffect(() => {
    const c = mountMotionCaptcha(box.current, { onSuccess: () => setOk(true) });
    return () => c.destroy();
  }, []);
  return (
    <form>
      {/* 入力欄 */}
      <div ref={box} />
      <button type="submit" disabled={!ok}>送信</button>
    </form>
  );
}
```

**Vue 3**

```vue
<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { mountMotionCaptcha } from './motion-digit-captcha.js';
const box = ref(null);
const ok = ref(false);
let captcha = null;
onMounted(() => { captcha = mountMotionCaptcha(box.value, { onSuccess: () => { ok.value = true; } }); });
onBeforeUnmount(() => captcha && captcha.destroy());
</script>
<template>
  <form>
    <div ref="box"></div>
    <button type="submit" :disabled="!ok">送信</button>
  </form>
</template>
```

### やってはいけないこと

- 答えの数字を DOM・属性・aria・console・グローバル変数に出す改造（答えがそのまま読み取れてしまう）。
- `destroy()` の呼び忘れ（rAF とリスナーが残る。SPA の画面遷移・再描画のたびに必要）。
- SSR（サーバ側）でモジュールを評価して DOM に触ること。`import` だけなら安全だが、`mountMotionCaptcha` はクライアント側（`useEffect` / `onMounted` 等）でだけ呼ぶ。
- 同じ container に `destroy()` なしで二重に mount すること。

## 限界と注意（必ず読む）

- **クライアント側だけの仕組みです。** ボットが JavaScript を使わずフォームの送信先へ直接 POST すれば、このゲームは迂回されます。「軽い足止め・スパム抑止」用であり、認証やセキュリティ対策の代わりではありません。サーバ側のレート制限・ハニーポット（人には見えない入力欄）・入力検証などと併用してください。
- 複数フレームを比較したり動画として解析できる AI には解かれうる設計です。
- **動きが見えにくい人・スクリーンリーダー利用者には解けません。** 必ず別の連絡手段（メールアドレス・電話など）をフォームの近くに併記してください。
- `prefers-reduced-motion` ではライブラリ側で動きを絞りません（絞ると数字が見えなくなるため）。動きを減らす設定の利用者向けの代替手段を出すかどうかは、組み込み側で判断してください。

## 対応ブラウザ・テスト・ライセンス

- Canvas 2D と ES modules が使える最近のブラウザ（Chrome / Edge / Firefox / Safari）。
- テスト: `npm test`（`node --test`。Node.js 18 以上。純関数のみで DOM は使いません）。
- ライセンス: MIT（`LICENSE`）。

## English summary

`motion-digit-captcha` is a tiny, zero-dependency (single ES module, no build) mini-game that asks a visitor to read a digit hidden in moving dots. Two uniform dot layers move in opposite vertical directions; only the foreground-layer dots inside the digit shape and the background-layer dots outside it are drawn. A still screenshot is uniform noise, but in motion the digit emerges. The answer is kept only in a closure, never in the DOM, attributes, aria or console.

```html
<div id="captcha"></div>
<button id="send" disabled>Send</button>
<script type="module">
  import { mountMotionCaptcha } from 'https://cdn.jsdelivr.net/gh/titc-ai/motion-digit-captcha@v1.0.0/motion-digit-captcha.js';
  const c = mountMotionCaptcha(document.getElementById('captcha'), {
    lang: 'en',
    onSuccess() { document.getElementById('send').disabled = false; }
  });
  // c.reset(), c.destroy(), c.isSolved()
</script>
```

Limitations: this is client-side only. A bot can bypass it by posting directly to your endpoint, so treat it as light spam friction, not as authentication or a security control; combine it with server-side rate limiting and honeypots. A vision-capable AI that analyzes several frames may solve it. People who cannot perceive motion, and screen-reader users, cannot solve it, so always offer another contact channel such as an email address. The library does not reduce motion automatically for `prefers-reduced-motion`; provide an alternative in your integration if needed. MIT licensed.
