# Focus Veil v0.1 Design Notes

## 定義

Focus Veilのv0.1は、作業画面の邪魔にならない透明オーバーレイです。主役は背面の作業アプリであり、Focus Veilは暗幕、注目位置のフォーカスライト、水面の控えめな揺らぎ、ポモドーロUIだけを提供します。

## 要点

- Electronのメインプロセスで透明・フレームレス・常時前面のBrowserWindowをディスプレイごとに作成します。
- レンダラーは素のHTML/CSS/JavaScript/Canvasで構成し、React等の重いUIフレームワークは入れていません。
- 通常時はクリック透過を有効化し、操作モード中だけクリック可能にします。
- Motion highlightは、各ディスプレイのscreen captureを低解像度で読み、前フレームとの差分から動きのある領域を推定して短いハイライトを足します。メインスポットはマウス周辺に残します。
- Ctrl単体の通常時操作は、非フォーカス/クリック透過との相性が悪いため安定要件から外し、`Ctrl+Shift+F` を安定操作として採用しました。
- 通知は音・点滅・強いフラッシュを使わず、暗幕の透明度とフォーカス半径を1.6秒だけ緩く変化させます。
- 2026-06-09時点で、トレイメニュー、軽量な設定保存、Motion highlightのオン/オフ、IPC sender検証、CSP、navigation/window.open制限を追加しています。
- マウス周辺の体感は、暗幕を強くするよりも、中心の自然な抜け、広いグラデーション境界、軽い追従スムージングで作ります。周辺視は探索や変化検出にも重要なため、デフォルトは強い暗転ではなく控えめな減光にしています。

## 比較

| 項目 | 採用 | 見送った案 | 理由 |
| --- | --- | --- | --- |
| UI構成 | 素のHTML/CSS/JS | React/Vue等 | 画面端の小UIとCanvasだけなので、起動・依存・認知負荷を増やさないため |
| 操作切替 | `Ctrl+Shift+F` | Ctrl単体グローバル検知 | ElectronのglobalShortcutはアクセラレータ登録向けで、非フォーカス透明ウィンドウがCtrl押下/解除を安定取得する設計ではないため |
| クリック透過 | `setIgnoreMouseEvents(true, { forward: true })` | 常時クリック可能 | 背面作業を邪魔しないことを最優先にするため |
| 注目補助 | motion highlight + マウススポット | Webカメラ視線推定 | 視線推定は精度、権限、負荷、プライバシーのコストが大きいため |
| 水面 | 低密度の揺らぎと散発的な波紋 | 粒子、波紋大量描画、WebGL | 注意を奪わず、CPU/GPU負荷を抑えるため |
| 通知 | 暗幕がふわっと開く | 点滅、白フラッシュ、音 | 集中を強く断ち切らないため |
| 常駐操作 | トレイ + 操作モード内設定 | 常時表示の大きな設定画面 | 通常時の作業画面を邪魔しないまま、復旧と終了の導線を確保するため |

## Next Feature Design

次フェーズでは、`Focus Profiles`、`Ambient Progress`、`Gentle Breaks` を追加候補として設計済みです。詳細な設計値と実装順序は `docs/feature-design-todo.md`、研究との接続は `docs/research-connections.md` に分離しています。

### Focus Profiles

`Code`、`Read`、`Write`、`Scan` の4Profileを採用します。Profileは単なるラベルではなく、暗幕、スポットライト半径、境界の柔らかさ、形状、追従速度、motion highlight強度、Ambient Progress強度をまとめて切り替えるプリセットです。

既存ユーザーの体感を崩さないため、新しい設定キーがない場合は `focusProfile: "custom"` として読み、現在の `veilAlpha`、`spotlightRadius`、`spotlightSoftness` を維持します。Profile選択時だけpreset値を適用し、手動でスライダーを動かした場合は `custom` に戻します。

### Ambient Progress

タイマー情報は、通常時に大きく読ませるのではなく、全ディスプレイ下端の細い進捗ラインで控えめに提示します。強度は `off`、`subtle`、`visible` の3段階です。操作モードでは正確な残り時間を引き続き表示し、通常時の右下タイマーはAmbient Progress有効時に控えめなopacityへ落とします。

### Gentle Breaks

固定タイマーは廃止しません。`25分集中 -> 5分休憩` のような目安は残し、Focus終了時にユーザーが操作中なら休憩通知だけを短く保留します。区切り判定にはElectron公式APIの `powerMonitor.getSystemIdleTime()` を使い、ネイティブキーボードフックは追加しません。

初期値は、アイドル判定8秒、静かな猶予30秒、最大延長5分です。強制ロック、中央モーダル、音、点滅は採用せず、Ambient Progressや既存の静かな通知演出で休憩への移行を促します。

## 具体例

### Electron構成

- `src/main.js`: BrowserWindow作成、仮想ディスプレイ全体への配置、クリック透過、操作モード、グローバルショートカット、smoke自動検証。
- `src/preload.js`: contextBridge経由で安全に操作モードAPIを公開。
- `src/renderer/`: Canvas描画、ポモドーロ、タイマーUI、通知演出。

設定はメインプロセスを単一ソースにし、ElectronのuserData配下の `settings.json` へ保存します。対象は暗幕の透明度、スポットサイズ、スポット境界の柔らかさ、Focus/Break分数、Motion highlight、Overlay enabled、Auto-updateです。smoke実行時は保存を無効化し、検証結果がユーザー設定に影響しないようにしています。自動更新は Windows の Setup インストール版だけが GitHub Releases を確認します。署名検証は行いません。ポータブル / 開発起動では確認しません。

IPCはoverlay windowかつ `renderer/index.html` からのsenderだけを受け付けます。timer commandは `start`、`pause`、`reset` のallowlistで検証します。rendererにはCSPを設定し、外部navigationと `window.open` は拒否します。

BrowserWindowは `transparent: true`、`frame: false`、`skipTaskbar: true`、`focusable: false`、`alwaysOnTop: true` を基準にしています。以前は `screen.getAllDisplays()` から仮想ディスプレイ全体の大きな矩形を作っていましたが、Windowsでは片側モニターだけに見えるケースがあったため、現在は各displayのboundsごとに1枚ずつoverlay windowを作ります。

タイマー状態はメインプロセスで一元管理し、全overlay windowへIPCで同期します。これにより、複数ディスプレイでも残り時間と通知演出がずれません。操作UIはprimary displayのoverlayだけに表示し、他のdisplayは操作モード中もクリック透過を維持します。

Motion highlight用のscreen sourceもメインプロセスで `desktopCapturer.getSources({ types: ['screen'] })` から取得し、display idが一致するsource idだけをrendererへ返します。rendererは `getUserMedia` でそのscreenを低解像度/低FPSで読みます。overlay自身の写り込みを避けるため、各BrowserWindowには `setContentProtection(true)` を指定しています。

### 透明オーバーレイとクリック透過

通常時は次の方針です。

```js
overlayWindow.setIgnoreMouseEvents(true, { forward: true });
overlayWindow.setFocusable(false);
```

`forward: true` により、クリックは背面へ通しつつマウス移動イベントをレンダラーへ渡し、フォーカスライトだけ追従させます。操作モードでは `setIgnoreMouseEvents(false)` と `setFocusable(true)` に切り替え、タイマーUIだけを明瞭に操作します。

複数ディスプレイ時は、primary displayのoverlayだけを操作可能にします。secondary displayのoverlayは操作モード中もクリック透過のままにし、作業画面のブロック範囲を広げすぎないようにしています。

参考にした公式仕様:

- [Electron BrowserWindow `setIgnoreMouseEvents`](https://www.electronjs.org/docs/api/browser-window)
- [Electron globalShortcut](https://www.electronjs.org/docs/latest/api/global-shortcut)
- [Electron Keyboard Shortcuts](https://www.electronjs.org/docs/latest/tutorial/keyboard-shortcuts)
- [Electron desktopCapturer](https://www.electronjs.org/docs/api/desktop-capturer/)

### Ctrl/代替操作

要求上の第一候補は「Ctrl押下中だけ操作可能」でした。ただし、通常時のFocus Veilはクリック透過かつ非フォーカスであるべきです。この状態でCtrl単体の押下/解除をグローバルに安定取得するには、Electron標準APIだけでは不足します。

そのためv0.1では次の折衷にしています。

- 操作モードの安定経路: `Ctrl+Shift+F`
- overlay window再配置: `Ctrl+Shift+R`
- 操作モード中の終了: `Esc`
- Ctrl単体: Electronウィンドウにフォーカスがある場合のみベストエフォート

これにより、背面作業を妨げる常時フォーカス取得や、ネイティブキーボードフック依存を避けています。

Windows仮想デスクトップはElectron標準APIだけで「全デスクトップに常時表示」を保証できません。`setVisibleOnAllWorkspaces(true)` はベストエフォートで呼びますが、Windowsでは効果が限定的です。そのため、全overlay windowが不可視になった場合の自動再作成と、手動復帰用の `Ctrl+Shift+R` を入れています。

### 軽量化

- Canvasは各ディスプレイのoverlay windowごとに1枚だけです。
- 描画はactive/idleの2段階です。マウス移動直後、スポット未収束、通知演出中、操作モード中、motion highlight表示中は約30fpsで描画し、静止アイドル時は約10fpsへ落とします。
- 水面は低密度の線描画だけで、WebGL、粒子、大量DOMを使っていません。
- タイマーIPCは、タイマー実行中だけ250ms間隔で送ります。停止中は操作や設定変更などの状態変化時だけ送ります。
- Overlay disabled時はCanvasを1回clearし、描画ループとMotion captureを停止します。タイマーUIと復帰導線は維持します。
- Motion highlightは各ディスプレイ128x72pxのサンプルに縮小し、約320ms間隔で差分を見ます。capture入力は最大5fpsです。大きすぎる全体変化はconfidenceを下げ、動画やスクロールに引っ張られすぎないようにしています。

### 水面とフォーカスライト

暗幕は黒16%を基準に全面へ描画します。その後、マウス周辺に半径245px前後のradial gradientを `destination-out` で抜き、背面を柔らかく見せます。中心は以前より自然に抜き、境界は `spotlightSoftness` で広くぼかします。マウス座標はtargetと描画位置を分け、軽く補間して急な追従感を減らします。

動きがある領域には、暗幕をわずかに抜く小さい芯と、薄い青緑の広いハローを短時間だけ足します。メインの明るい円はmotion側へ移動させません。マウス移動直後はマウススポットを主役にし、motion highlightは少し抑えます。

水面は低アルファの緑青系ラインと、数秒おきに広がる薄い波紋で表現しています。波紋は最大6個までに制限し、描画負荷と視覚的な主張を抑えています。単色テーマに寄りすぎず、背面作業の可読性を損なわない範囲にしています。

### Motion highlight

Motion highlightは、ユーザーの視線そのものではなく「画面内で変化していて、人が注意を向けやすい場所」を補助的に浮かせます。処理は次の流れです。

1. ディスプレイごとのscreen capture sourceを取得する。
2. rendererで128x72pxへ縮小して前フレームとの差分を取る。
3. 差分が十分あるピクセルを8x6のセルに集計する。
4. 全体変化が大きすぎる場合はconfidenceを下げる。
5. 強いセルを最大3個まで短いハイライトとして保持する。
6. 取得失敗時、低confidence時、動きが止まった後はハイライトだけ消える。マウススポットは維持する。

この方式は入力キャレット位置の取得よりアプリ横断性が高く、Webカメラ視線推定より軽い一方で、動画・広告・ローディングなどにも反応します。そのためv0.1では実験機能として扱い、しきい値は実作業で調整する前提です。

### 注意設計の根拠

画面の一部を通常表示し周辺を抑えるUIは、注目先を作る補助としては有望です。一方で、周辺視は視覚探索や変化検出にも使われるため、強い暗転は検索、比較、監視、デバッグの妨げになり得ます。そのためFocus Veilでは、周辺を消すのではなく控えめに減光し、境界を柔らかくし、必要に応じてOverlay enabledやVeil Strengthで弱められる設計にしています。

参考:

- Spotlight UI: https://www.research.autodesk.com/publications/spotlight-directing-users-attention-on-large-displays/
- 周辺視と視覚探索: https://www.nature.com/articles/s44159-022-00097-1
- 周辺視喪失と探索性能: https://pmc.ncbi.nlm.nih.gov/articles/PMC8287039/
- 注意とコントラスト感度: https://pmc.ncbi.nlm.nih.gov/articles/PMC4280203/

### 通知演出

タイマー到達時は `notificationUntil = now + 1600ms` とし、sinカーブで暗幕のalphaを少し下げ、フォーカス半径を広げます。白い全面フラッシュ、点滅、音は使いません。smokeモードでは4秒/2秒の短縮タイマーで確認できます。
