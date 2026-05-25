# Focus Veil v0.1 Design Notes

## 定義

Focus Veilのv0.1は、作業画面の邪魔にならない透明オーバーレイです。主役は背面の作業アプリであり、Focus Veilは暗幕、マウス周辺のフォーカスライト、水面の控えめな揺らぎ、ポモドーロUIだけを提供します。

## 要点

- Electronのメインプロセスで透明・フレームレス・常時前面のBrowserWindowを作成します。
- レンダラーは素のHTML/CSS/JavaScript/Canvasで構成し、React等の重いUIフレームワークは入れていません。
- 通常時はクリック透過を有効化し、操作モード中だけクリック可能にします。
- Ctrl単体の通常時操作は、非フォーカス/クリック透過との相性が悪いため安定要件から外し、`Ctrl+Shift+F` を安定操作として採用しました。
- 通知は音・点滅・強いフラッシュを使わず、暗幕の透明度とフォーカス半径を1.6秒だけ緩く変化させます。

## 比較

| 項目 | 採用 | 見送った案 | 理由 |
| --- | --- | --- | --- |
| UI構成 | 素のHTML/CSS/JS | React/Vue等 | 画面端の小UIとCanvasだけなので、起動・依存・認知負荷を増やさないため |
| 操作切替 | `Ctrl+Shift+F` | Ctrl単体グローバル検知 | ElectronのglobalShortcutはアクセラレータ登録向けで、非フォーカス透明ウィンドウがCtrl押下/解除を安定取得する設計ではないため |
| クリック透過 | `setIgnoreMouseEvents(true, { forward: true })` | 常時クリック可能 | 背面作業を邪魔しないことを最優先にするため |
| 水面 | 低密度サイン波ライン | 粒子、波紋大量描画、WebGL | 注意を奪わず、CPU/GPU負荷を抑えるため |
| 通知 | 暗幕がふわっと開く | 点滅、白フラッシュ、音 | 集中を強く断ち切らないため |

## 具体例

### Electron構成

- `src/main.js`: BrowserWindow作成、仮想ディスプレイ全体への配置、クリック透過、操作モード、グローバルショートカット、smoke自動検証。
- `src/preload.js`: contextBridge経由で安全に操作モードAPIを公開。
- `src/renderer/`: Canvas描画、ポモドーロ、タイマーUI、通知演出。

BrowserWindowは `transparent: true`、`frame: false`、`skipTaskbar: true`、`focusable: false`、`alwaysOnTop: true` を基準にしています。表示範囲は `screen.getAllDisplays()` のboundsから仮想ディスプレイ矩形を作り、複数モニターにも広がるようにしています。

### 透明オーバーレイとクリック透過

通常時は次の方針です。

```js
overlayWindow.setIgnoreMouseEvents(true, { forward: true });
overlayWindow.setFocusable(false);
```

`forward: true` により、クリックは背面へ通しつつマウス移動イベントをレンダラーへ渡し、フォーカスライトだけ追従させます。操作モードでは `setIgnoreMouseEvents(false)` と `setFocusable(true)` に切り替え、タイマーUIだけを明瞭に操作します。

参考にした公式仕様:

- [Electron BrowserWindow `setIgnoreMouseEvents`](https://www.electronjs.org/docs/api/browser-window)
- [Electron globalShortcut](https://www.electronjs.org/docs/latest/api/global-shortcut)
- [Electron Keyboard Shortcuts](https://www.electronjs.org/docs/latest/tutorial/keyboard-shortcuts)

### Ctrl/代替操作

要求上の第一候補は「Ctrl押下中だけ操作可能」でした。ただし、通常時のFocus Veilはクリック透過かつ非フォーカスであるべきです。この状態でCtrl単体の押下/解除をグローバルに安定取得するには、Electron標準APIだけでは不足します。

そのためv0.1では次の折衷にしています。

- 操作モードの安定経路: `Ctrl+Shift+F`
- 操作モード中の終了: `Esc`
- Ctrl単体: Electronウィンドウにフォーカスがある場合のみベストエフォート

これにより、背面作業を妨げる常時フォーカス取得や、ネイティブキーボードフック依存を避けています。

### 軽量化

- Canvasは1枚だけです。
- 描画は `requestAnimationFrame` 内で約30fpsに制限しています。
- 水面は低密度の線描画だけで、WebGL、粒子、大量DOMを使っていません。
- タイマー更新は100ms間隔ですが、表示は秒単位で、処理は単純な減算だけです。

### 水面とフォーカスライト

暗幕は黒14%を基準に全面へ描画します。その後、マウス周辺に半径230px前後のradial gradientを `destination-out` で抜き、背面を柔らかく見せます。操作モードでは半径を280pxにしてUI操作時の視認性を少し上げます。

水面は低アルファの緑青系ラインと、ごく薄い暖色ラインを重ねています。単色テーマに寄りすぎず、背面作業の可読性を損なわない範囲に抑えています。

### 通知演出

タイマー到達時は `notificationUntil = now + 1600ms` とし、sinカーブで暗幕のalphaを少し下げ、フォーカス半径を広げます。白い全面フラッシュ、点滅、音は使いません。smokeモードでは4秒/2秒の短縮タイマーで確認できます。
