# Changelog

## 1.0.1

公開 API（関数名・オプション名・既定値・戻り値・イベント名・export 名）の変更はありません。

### 修正
- `lang` に `constructor` や `toString` など `Object.prototype` のキー名を渡すと、不明な言語として `ja` に戻らず文言が空になっていた。
- 文言中の `{constructor}` などの未定義の置換名が、関数の文字列に置き換わっていた。そのまま残るようにした。
- `jitter` を大きくしすぎると数字が枠の外に出て解けなくなっていた。`size` に応じて上限を掛けた。
- `onSuccess` が例外を投げると `mdc:success` が発火しなかった。必ず発火するようにした。
- 不正解のロックでボタンが無効になるとフォーカスが失われていた。解除後に戻す。スタート押下後もフォーカスを最初の数字ボタンへ移す。
- 別の document（iframe 内など）の container に mount したとき、スタイル注入とタブ復帰の監視が親の document を見ていた。container の `ownerDocument` を使う。

### 内部
- 描画ループで毎フレームの層オブジェクト・点の配列・判定用クロージャの確保をやめた（`visibleDots` は任意の第4引数 `out` で配列を使い回せる。省略時は従来どおり新しい配列を返す）。
- README の CSS 変数の説明（色は canvas に描くため `--mdc-bg` `--mdc-dot` では変わらない）を実装に合わせた。
- 偽DOMによる `mountMotionCaptcha` のテストを追加（onSuccess 1回、destroy の二重呼び出し、ロック解除、答えの非漏えい）。
