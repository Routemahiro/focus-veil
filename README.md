# Focus Veil v0.1

## 概要

Focus Veilは、Windows上の作業画面に薄い透明オーバーレイを重ねるElectronアプリです。背面アプリのクリック操作を通常時は妨げず、マウス周辺の作業面を柔らかく残し、周辺の視覚ノイズを少しだけ抑えます。

初期テーマは控えめな水面です。低速・低コントラスト・低密度のCanvas描画に留め、ポモドーロの残り時間と静かな通知演出で集中/休憩の切り替えを支援します。タイマーは Focus → Break → Focus と回り、Focusが終わるとヴェールがふわっと消え、Breakが終わるとふわっと戻ります。水面の揺らぎと薄い波紋は既定 ON で、操作メニューまたはトレイの `Ripple effects` で切れます。メインの明るい円はマウス周辺に残します。画面の動きに合わせて周りが明るくなる処理はありません。

## 配布版（Windows）

git / npm なしで使う場合は、GitHub Releases の未署名 EXE を使う。

- 最新版: https://github.com/Routemahiro/focus-veil/releases/latest
- インストーラー: `FocusVeil-Setup-0.1.7.exe`（スタートメニューに追加。管理者権限は不要）
- ポータブル: `FocusVeil-Portable-0.1.7.exe`（展開せずに実行）

Windows が SmartScreen や「不明な発行元」を出したら、詳細を開いて実行する。コード署名はない。終了はトレイの `Quit`。

自動更新は **インストール済み Setup** だけが対象。既定は ON で、GitHub Releases を確認して次の Setup を入れる。切るときは操作メニューまたはトレイの `Auto-update`。待っていても入らないときは、その直下の `Check for updates` で今すぐ確認する。ポータブル EXE と `npm start` は electron-updater で入れられないので、ボタンはダウンロードせずその旨を出し、GitHub Releases を開くか聞く。開くのは Yes のときだけ。更新インストーラーでも SmartScreen が出ることがある。

操作モードは `Ctrl+Shift+F`。メニュー外クリック、もう一度ショートカット、または `Esc` で閉じる。

Windows 向け EXE を作り直すとき:

```powershell
$env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'
npm install
npm run dist:win
npm run checksum
```

## 起動方法（開発）

```powershell
npm install
npm start
```

自動確認用の短時間テストは次で実行します。

```powershell
npm run smoke
```

`npm run smoke` は4秒/2秒の短縮タイマーとプレビュー背景で、通常時・操作時・通知演出中・ループ後のスクリーンショットを `artifacts/screenshots/` に出力します。

## 基本操作

- 通常時: 画面右下に残り時間と小さな `Ctrl+Shift+F` ヒントを表示します。ウィンドウはクリック透過です。タイマーは止まらず Focus / Break を繰り返し、切れ目で全画面のヴェールがふわっと切替わります。
- 注目スポット: メインの明るい領域はマウス周辺に残ります。
- 操作モード: `Ctrl+Shift+F` で切り替えます。操作モード中だけ `Start` / `Pause` / `Reset`、透明度、スポットサイズ、スポット境界の柔らかさ、Focus/Break分数、Ripple effects、Overlay enabled、Auto-update、その直下の `Check for updates` を表示し、クリックできます。
- 操作モード終了: `Ctrl+Shift+F` で再切り替え、操作モード中に `Esc`、またはメニュー外をクリック。
- オーバーレイ再配置: `Ctrl+Shift+R`。Windows仮想デスクトップ切り替え後に表示が戻らない場合の復帰用です。
- トレイメニュー: タイマー開始/停止、リセット、操作モード、Overlay enabled、Ripple effects、Auto-update、その直下の `Check for updates`、Veil Strength、再配置、終了を操作できます。更新を入れたあとは `Restart to Update` も出ます。
- 設定保存: 透明度、スポットサイズ、スポット境界の柔らかさ、Focus/Break分数、Ripple effects、Overlay enabled、Auto-updateはElectronのuserData配下に `settings.json` として保存します。smoke実行時は保存しません。古い `motionEnabled` は読み捨てます。
- 自動更新: 既定 ON。Setup インストール版だけが `Routemahiro/focus-veil` の GitHub Releases を確認する。OFF なら自動の確認とダウンロードはしない。`Check for updates` は ON/OFF とは別に、今すぐ確認して更新があれば同じ細いバーで落とす。入れたあとは従来の `Restart to Update` / Quit。ポータブル版と `npm start` は対象外で、その旨を表示し、`Open the GitHub Releases page?` と聞く。Yes までブラウザは開かない。ダウンロード中だけ右下のタイマー横に細いバーが出る。
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
- 暗幕は黒16%を基準にし、通知時も白飛びや点滅を避けて1.6秒でふわっと開く演出にしています。
- 水面表現は低密度の揺らぎと、ときどき出る薄い波紋に絞り、背面テキストやUIの可読性を優先しています。不要なら操作メニューまたはトレイの `Ripple effects` をOFFにします。暗幕、マウススポット、前景ウィンドウの光は別設定です。

## 検証結果

2026-05-25時点で以下を確認済みです。

- `npm install`: 成功。ElectronはNode 20環境でengine警告が出ない `41.7.0` に固定。
- `npm audit --omit=optional`: 0 vulnerabilities。
- `node --check`: `src/main.js`、`src/preload.js`、`src/renderer/renderer.js` で成功。
- `npm run smoke`: 成功。Start/Pause/Reset、短時間タイマー遷移、通知演出、スクリーンショット生成を確認。
- `npm start`: `FOCUS_VEIL_READY` まで到達。2026-05-25の2画面環境で `display-...` が2件出力され、ディスプレイ別overlay window作成を確認。
- 2026-06-09追加確認: トレイ、設定保存、操作モード内設定UI、IPC sender検証、CSP追加後に `node --check`、`npm audit --omit=optional`、`npm run smoke`、短時間通常起動を確認。

詳細は `docs/verification-log.md` を参照してください。

## 既知の制限

- Ctrl単体をグローバルに押下/解除検知する実装は採用していません。クリック透過・非フォーカスの安定性を優先し、`Ctrl+Shift+F` の操作モード切り替えを採用しています。
- OSレベルで背面アプリへ実クリックが届くことは、コードとElectron API前提で確認していますが、長時間の実作業操作までは未確認です。
- overlay windowにはcontent protectionを有効化しています。そのため外部スクリーンショット/画面共有にFocus Veilの見た目が写らない場合があります。
- Windows仮想デスクトップへの自動追従はベストエフォートです。Electron標準APIだけではWindows上で全仮想デスクトップへ確実にピン留めできないため、表示が戻らない場合は `Ctrl+Shift+R` でoverlay windowを現在のデスクトップへ作り直します。
- マルチモニター/DPI差分はディスプレイごとのboundsで作成する構成に変更済みですが、DPI混在と負座標配置の手動確認は未実施です。
- BGM/音声通知、複数テーマ、複雑なプロファイル管理はv0.1の対象外です。現在の設定保存は軽量な単一設定ファイルです。
- 自動更新は Windows の Setup（NSIS）インストール版だけ。ポータブル / 開発起動 (`npm start`) / Linux smoke では確認しない。
- 配布 EXE は未署名のため、初回実行と自動更新のインストーラーで SmartScreen が出ることがある。

## プライバシー

- 画面キャプチャ: 使わない。動き追従の明るさ処理は削除済み。
- 前景ウィンドウ: Windows 上で前面ウィンドウの矩形だけ読む。タイトルや内容は送らない。
- 自動更新: 既定 ON。インストール済み Setup だけが GitHub Releases（`Routemahiro/focus-veil`）を確認し、更新があれば Setup を取得する。操作メニュー / トレイの `Auto-update` を外すと、確認・ダウンロード・更新確認はしない。
- テレメトリ: アプリ独自の解析、クラッシュ送信、アカウント通信はない。
- 設定: `%APPDATA%\Focus Veil\settings.json` にローカル保存。

## 残課題

- 実作業アプリの上で30分以上使い、クリック透過・可読性・疲れにくさを手動評価する。
- マルチモニター、拡大率違い、負座標モニター配置での表示範囲を確認する。
- 必要になった場合のみ、軽量な設定保存や透明度調整を追加する。
