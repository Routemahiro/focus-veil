# Focus Veil v0.1

## 概要

Focus Veilは、Windows上の作業画面に薄い透明オーバーレイを重ねるElectronアプリです。背面アプリのクリック操作を通常時は妨げず、マウス周辺の作業面を柔らかく残し、周辺の視覚ノイズを少しだけ抑えます。

初期テーマは控えめな水面です。低速・低コントラスト・低密度のCanvas描画に留め、ポモドーロの残り時間と静かな通知演出で集中/休憩の切り替えを支援します。実験機能として、画面内の動きがある領域を低解像度で検出し、その周辺へ短い「気配」として薄いハイライトを足します。メインの明るい円はマウス周辺に残します。

## 起動方法

```powershell
npm install
npm start
```

自動確認用の短時間テストは次で実行します。

```powershell
npm run smoke
```

`npm run smoke` は4秒/2秒の短縮タイマーとプレビュー背景で、通常時・操作時・通知演出中のスクリーンショットを `artifacts/screenshots/` に出力します。

## 基本操作

- 通常時: 画面右下に残り時間だけを表示します。ウィンドウはクリック透過です。
- 注目スポット: メインの明るい領域はマウス周辺に残ります。画面内の動きが検出できる場合は、その周辺に小さい芯と広いハローを短く足します。
- 操作モード: `Ctrl+Shift+F` で切り替えます。操作モード中だけ `Start` / `Pause` / `Reset`、透明度、スポットサイズ、スポット境界の柔らかさ、Focus/Break分数、Motion highlight、Overlay enabledを表示し、クリックできます。
- 操作モード終了: `Ctrl+Shift+F` で再切り替え、または操作モード中に `Esc`。
- オーバーレイ再配置: `Ctrl+Shift+R`。Windows仮想デスクトップ切り替え後に表示が戻らない場合の復帰用です。
- トレイメニュー: タイマー開始/停止、リセット、操作モード、Overlay enabled、Motion highlight、Veil Strength、再配置、終了を操作できます。
- 設定保存: 透明度、スポットサイズ、スポット境界の柔らかさ、Focus/Break分数、Motion highlight、Overlay enabledはElectronのuserData配下に `settings.json` として保存します。smoke実行時は保存しません。
- Ctrl単体: Electronウィンドウにフォーカスがある場合のみベストエフォートで反応します。通常のクリック透過状態では背面作業を優先するため、安定操作は `Ctrl+Shift+F` に寄せています。

## ドキュメント

- 利用者向け説明書: `docs/user-guide.md`
- 常時起動時の負荷メモ: `docs/performance-notes.md`
- 軽量化実装TODO: `docs/performance-optimization-todo.md`
- 設計ノート: `docs/design-notes.md`
- 検証ログ: `docs/verification-log.md`
- 次フェーズ機能設計: `docs/feature-design-todo.md`
- 研究との接続: `docs/research-connections.md`

## 設計方針

- React等のUIフレームワークは使わず、Electron + HTML/CSS/JavaScript/Canvasで構成しています。
- 透明・フレームレス・常時前面のBrowserWindowを、ディスプレイごとに1枚ずつ作成します。
- 通常時は `setIgnoreMouseEvents(true, { forward: true })` でクリック透過にし、マウス移動だけをCanvasのフォーカスライトへ反映します。
- 動き検出はElectronのscreen capture sourceを低解像度で読み、前フレームとの差分から重心を出します。大きすぎる全画面変化は抑制し、失敗時はマウス追従へフォールバックします。
- 暗幕は黒16%を基準にし、通知時も白飛びや点滅を避けて1.6秒でふわっと開く演出にしています。
- 水面表現は低密度の揺らぎと、ときどき出る薄い波紋に絞り、背面テキストやUIの可読性を優先しています。

## 検証結果

2026-05-25時点で以下を確認済みです。

- `npm install`: 成功。ElectronはNode 20環境でengine警告が出ない `41.7.0` に固定。
- `npm audit --omit=optional`: 0 vulnerabilities。
- `node --check`: `src/main.js`、`src/preload.js`、`src/renderer/renderer.js` で成功。
- `npm run smoke`: 成功。Start/Pause/Reset、短時間タイマー遷移、motion highlightの疑似領域、通知演出、4枚のスクリーンショット生成を確認。
- `npm start`: `FOCUS_VEIL_READY` まで到達。2026-05-25の2画面環境で `display-...` が2件出力され、ディスプレイ別overlay window作成を確認。
- 2026-06-09追加確認: トレイ、設定保存、操作モード内設定UI、IPC sender検証、CSP追加後に `node --check`、`npm audit --omit=optional`、`npm run smoke`、短時間通常起動を確認。

詳細は `docs/verification-log.md` を参照してください。

## 既知の制限

- Ctrl単体をグローバルに押下/解除検知する実装は採用していません。クリック透過・非フォーカスの安定性を優先し、`Ctrl+Shift+F` の操作モード切り替えを採用しています。
- OSレベルで背面アプリへ実クリックが届くことは、コードとElectron API前提で確認していますが、長時間の実作業操作までは未確認です。
- Motion highlightは画面キャプチャが使えない環境や保護された画面では無効になります。動画、広告、ローディングなどの動きにも反応する可能性があります。
- Focus Veil自身がmotion captureへ写り込むのを避けるため、overlay windowにはcontent protectionを有効化しています。そのため外部スクリーンショット/画面共有にFocus Veilの見た目が写らない場合があります。
- Windows仮想デスクトップへの自動追従はベストエフォートです。Electron標準APIだけではWindows上で全仮想デスクトップへ確実にピン留めできないため、表示が戻らない場合は `Ctrl+Shift+R` でoverlay windowを現在のデスクトップへ作り直します。
- マルチモニター/DPI差分はディスプレイごとのboundsで作成する構成に変更済みですが、DPI混在と負座標配置の手動確認は未実施です。
- インストーラー、BGM/音声通知、複数テーマ、複雑なプロファイル管理はv0.1の対象外です。現在の設定保存は軽量な単一設定ファイルです。

## 残課題

- 実作業アプリの上で30分以上使い、クリック透過・可読性・疲れにくさを手動評価する。
- Motion highlightのしきい値と薄さを、動画、スクロール、タイピング、コード編集などの実作業で調整する。
- マルチモニター、拡大率違い、負座標モニター配置での表示範囲を確認する。
- 必要になった場合のみ、軽量な設定保存や透明度調整を追加する。
