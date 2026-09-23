# Verification Log

## 2026-09-23

### Windows起動時の自動起動

- 操作メニューとトレイに `Start with Windows` を追加。既定 OFF。`settings.json` の `openAtLogin` に保存する。
- インストール済み Setup だけが Electron の `setLoginItemSettings({ openAtLogin })` でログイン項目を登録する。
- ポータブルと `npm start` は登録せず、コントロールにその旨を出す。登録したふりをしない。
- ヴェールフェード、タイマーループ、フェーズ色、近接フェード、更新バー、待機ヒント、手動更新、Motion highlight 削除は変えない。バージョン上げなし。Release なし。

#### 実行コマンド

| コマンド | 結果 | メモ |
| --- | --- | --- |
| `node --check src/main.js` | 成功 | 構文OK |
| `node --check src/preload.js` | 成功 | 構文OK |
| `node --check src/renderer/renderer.js` | 成功 | 構文OK |
| `node --check src/auto-update.js` | 成功 | 構文OK |
| `node --check src/login-item.js` | 成功 | 構文OK |
| `node scripts/check-manual-update-state.js` | 成功 | 手動更新の既存確認は pass |
| `node scripts/check-login-item-state.js` | 成功 | Setup だけ setLoginItemSettings。ポータブル / npm start / smoke / 非Windows は呼ばない |
| `npm run smoke` | 成功 | 58 assertion pass。追加: 既定 OFF、ON/OFF、操作メニュー表示、npm start は登録しない旨を出す。近接フェード、ヴェールフェード、タイマーループ、Focus/Break 色、更新バー、待機ヒント、手動更新、Motion highlight 削除も pass |

### 待機枠の近接フェード


### 待機枠の近接フェード

- マウスが右下の待機コンパクトタイマーに近づくと、その枠だけほぼ透明になる。離れると元の濃さに戻る。
- 全画面ヴェールはこの動きに合わせない。Focus `#6E9878` / Break `#C9ADC6` は変えない。操作モードの設定パネルは薄くしない。
- バージョン上げなし。Release なし。

#### 実行コマンド

| コマンド | 結果 | メモ |
| --- | --- | --- |
| `node --check src/main.js` | 成功 | 構文OK |
| `node --check src/preload.js` | 成功 | 構文OK |
| `node --check src/renderer/renderer.js` | 成功 | 構文OK |
| `node --check src/auto-update.js` | 成功 | 構文OK |
| `node scripts/check-manual-update-state.js` | 成功 | 手動更新の既存確認は pass |
| `npm run smoke` | 成功 | 53 assertion pass。追加: 待機枠はポインタが遠いと濃い、近いと 0.08、離れると戻る、操作パネルは薄くしない。ヴェールと Focus/Break 色の既存 assertion も pass |

### フェーズで変わる枠色

- 待機中のコンパクトタイマーと、操作メニューの設定パネルの枠をフェーズで変える。スライダーとチェックのアクセントも同じ色。
- Focus `#6E9878`、Break `#C9ADC6`。
- 全画面ヴェールの塗りは変えない。ヴェールフェード、タイマーループ、待機中の `Ctrl+Shift+F`、更新プログレスバー、手動の `Check for updates` はそのまま。バージョン上げなし。Release なし。

#### 実行コマンド

| コマンド | 結果 | メモ |
| --- | --- | --- |
| `node --check src/main.js` | 成功 | 構文OK |
| `node --check src/preload.js` | 成功 | 構文OK |
| `node --check src/renderer/renderer.js` | 成功 | 構文OK |
| `node --check src/auto-update.js` | 成功 | 構文OK |
| `node scripts/check-manual-update-state.js` | 成功 | 手動更新の既存確認は pass |
| `npm run smoke` | 成功 | 49 assertion pass。追加: 待機枠と設定の Focus/Break 色。既存の更新バー、待機ヒント、手動更新、Motion highlight 削除、Ripple、ヴェールフェード、タイマーループも pass |

### ポータブルの Releases 確認

- ポータブルと `npm start` の `Check for updates` は、Setup が必要な旨を残したまま `Open the GitHub Releases page?` を出す。
- Yes まで https://github.com/Routemahiro/focus-veil/releases/latest は開かない。No は質問だけ閉じる。
- インストール済み Setup の確認、進捗バー、`Restart to Update`、Auto-update の ON/OFF は変えない。

#### 実行コマンド

| コマンド | 結果 | メモ |
| --- | --- | --- |
| `node --check src/main.js` | 成功 | 構文OK |
| `node --check src/preload.js` | 成功 | 構文OK |
| `node --check src/renderer/renderer.js` | 成功 | 構文OK |
| `node --check src/auto-update.js` | 成功 | 構文OK |
| `node scripts/check-manual-update-state.js` | 成功 | ポータブルと npm start は No で URL を返さず、Yes でだけ URL を返す。Setup の手動確認は Releases を開かない |
| `npm run smoke` | 成功 | 44 assertion pass。追加: Check の前は質問しない、npm start は Setup の旨と質問を出し Yes まで開かない、No でも開かない。既存の更新バー、待機ヒント、Motion highlight 削除、Ripple、ヴェールフェード、タイマーループも pass |

### 手動の更新確認

- Auto-update の直下に `Check for updates` を追加。操作メニューとトレイの両方。
- インストール済み Setup では今すぐ GitHub Releases を確認し、更新があれば既存の進捗バーと `Restart to Update` / Quit を使う。
- Auto-update の ON/OFF は自動確認のまま。手動ボタンは OFF でも確認できる。
- ポータブルと `npm start` は electron-updater を呼ばず、入れられない旨を表示する。バージョン上げなし。Release なし。

#### 実行コマンド

| コマンド | 結果 | メモ |
| --- | --- | --- |
| `node --check src/main.js` | 成功 | 構文OK |
| `node --check src/preload.js` | 成功 | 構文OK |
| `node --check src/renderer/renderer.js` | 成功 | 構文OK |
| `node --check src/auto-update.js` | 成功 | 構文OK |
| `node scripts/check-manual-update-state.js` | 成功 | 手動確認、自動OFF時の手動ダウンロード維持、自動ダウンロードのOFF取消、最新版、失敗、ポータブル、npm start |
| `npm run smoke` | 成功 | 42 assertion pass。追加: Check for updates が Auto-update の直下、npm start ではダウンロードしない。既存の更新バー、待機ヒント、Motion highlight 削除、Ripple、ヴェールフェードも pass |

## 2026-09-20

### タイマーループとヴェールフェード

- Focus 終了後も timer を止めず、Break → Focus と回り続けるよう変更。
- Break 入りで全画面ヴェールをふわっと消し、Focus 戻りでふわっと戻す。
- Overlay enabled OFF、マウススポット、Ripple、コンパクトタイマー、更新バーは維持。バージョン上げなし。

#### 実行コマンド

| コマンド | 結果 | メモ |
| --- | --- | --- |
| `node --check src/main.js` | 成功 | 構文OK |
| `node --check src/preload.js` | 成功 | 変更なし |
| `node --check src/renderer/renderer.js` | 成功 | 構文OK |
| `npm run smoke` | 成功 | 既存 assertion 維持。追加: idle veil、Focus→Break 継続、Break で veilPresence ≤ 0.08、Break→Focus 継続、Focus で veilPresence ≥ 0.92 |

## 2026-06-12

### Phase 1軽量化

- rendererの描画ループをactive/idleに分け、静止アイドル時は約10fpsへ落とす構成に変更。
- Motion highlightのcapture入力を最大5fpsへ下げ、差分サンプリングを約320ms間隔へ変更。
- Overlay disabled時にCanvas描画ループとMotion captureを停止するよう変更。
- timer tick IPCを、タイマーrunning中だけ250ms間隔で送る構成へ変更。
- overlay presence維持処理を、不可視またはalways-on-topが外れたwindowだけに実行するよう条件化。

#### 実行コマンド

| コマンド | 結果 | メモ |
| --- | --- | --- |
| `node --check src/main.js` | 成功 | 構文OK |
| `node --check src/preload.js` | 成功 | 構文OK |
| `node --check src/renderer/renderer.js` | 成功 | 構文OK |
| `npm run smoke` | 成功 | `artifacts/smoke-report.json` は `status: passed` |
| 通常起動 | 成功 | READY 2件、stderr空 |
| Motion ON idle 30秒測定 x2 | 成功 | 全論理CPU比1.769%、1.275% |
| Overlay disabled 30秒測定 | 成功 | 全論理CPU比0.010% |

#### 負荷測定

| 条件 | 時間 | CPU 全論理CPU比 | CPU 1コア換算 | Working Set | Private Memory |
| --- | ---: | ---: | ---: | ---: | ---: |
| Phase 1後 Motion ON idle | 30秒 | 1.769% | 28.30% | 1043.4MB | 452.9MB |
| Phase 1後 Motion ON idle | 30秒 | 1.275% | 20.40% | 1049.1MB | 454.7MB |
| Phase 1後 Overlay disabled | 30秒 | 0.010% | 0.16% | 407.3MB | 339.8MB |

測定はFocus Veil配下のElectronプロセスだけを `Path -like '*FocusVeil*'` で絞って行いました。Overlay disabled測定では、Electron userData配下の `settings.json` を一時的に変更し、測定後に元の設定へ復元しました。

## 2026-06-09

### Spotlight体感調整

- マウススポットの既定値を暗幕16%、サイズ245px、softness 0.68へ変更。
- `spotlightSoftness` を設定保存対象に追加し、操作モード内に `Soft` スライダーを追加。
- マウス座標をtargetと描画用spotに分け、軽いスムージングを追加。
- マウススポットの描画パラメータを集約し、中心の抜けを強め、境界を広くぼかす構成に変更。
- Motion highlightを最大3点に絞り、小さい芯、広いハロー、短いattack/hold/decayで表示する構成に変更。
- smokeに `spotlight settings update through IPC` を追加し、`veilAlpha`、`spotlightRadius`、`spotlightSoftness` の反映を確認。

#### 実行コマンド

| コマンド | 結果 | メモ |
| --- | --- | --- |
| `node --check src/main.js` | 成功 | 構文OK |
| `node --check src/preload.js` | 成功 | 構文OK |
| `node --check src/renderer/renderer.js` | 成功 | 構文OK |
| `npm run smoke` | 成功 | レポート: `artifacts/smoke-report.json` |
| `npm audit --omit=optional` | 成功 | `found 0 vulnerabilities` |
| 短時間通常起動 | 成功 | `FOCUS_VEIL_READY display-...` を2件確認。stderrなし。検証用Electronプロセスは停止済み |

### 変更範囲

- トレイメニューを追加。タイマー開始/停止、Reset、Operation Mode、Overlay enabled、Motion highlight、Veil Strength、Refresh Overlay Windows、Quitを操作可能にした。
- 軽量設定保存を追加。暗幕透明度、スポット半径、Focus/Break分数、Motion highlight、Overlay enabledをElectronのuserData配下 `settings.json` に保存する。smoke実行時は保存しない。
- 操作モード内に最小設定UIを追加。
- IPC sender検証、timer command allowlist、CSP、navigation/window.open制限、permission request handler、単一インスタンス制御を追加。

### 実行コマンド

| コマンド | 結果 | メモ |
| --- | --- | --- |
| `node --check src/main.js` | 成功 | 構文OK |
| `node --check src/preload.js` | 成功 | 構文OK |
| `node --check src/renderer/renderer.js` | 成功 | 構文OK |
| `npm run smoke` | 成功 | レポート: `artifacts/smoke-report.json` |
| `npm audit --omit=optional` | 成功 | `found 0 vulnerabilities` |
| 短時間通常起動 | 成功 | `FOCUS_VEIL_READY display-...` を2件確認。stderrなし。検証用Electronプロセスは停止済み |

### smoke確認

| 確認項目 | 結果 |
| --- | --- |
| 通常時に操作ボタンが非表示 | OK |
| 操作モードで操作ボタンと設定UIが表示 | OK |
| Start/Pause/Reset | OK |
| 短時間タイマー遷移と通知演出 | OK |
| motion highlight疑似領域 | OK |
| 4枚のスクリーンショットが非ブランク | OK |

## 2026-05-25

### 実行環境

- OS: Windows
- Workspace: `C:\Users\aaa_a\OneDrive\ドキュメント\FocusVeil`
- Node.js: `v20.12.2`
- npm: `10.7.0`
- Electron: `41.7.0`
- GitHub CLI: `C:\Program Files\GitHub CLI\gh.exe`
- GitHub auth: `Routemahiro` で認証済み

### 実行コマンド

| コマンド | 結果 | メモ |
| --- | --- | --- |
| `node --version` | 成功 | `v20.12.2` |
| `npm --version` | 成功 | `10.7.0` |
| `gh auth status` | 成功 | `Routemahiro`、repo scopeあり |
| `npm view electron version` | 成功 | 最新は`42.2.0`だったが、Node 20ではengine警告あり |
| `npm install` | 成功 | Electronを`41.7.0`に固定後、engine警告なし |
| `npm audit --omit=optional` | 成功 | `found 0 vulnerabilities` |
| `node --check src/main.js` | 成功 | 構文OK |
| `node --check src/preload.js` | 成功 | 構文OK |
| `node --check src/renderer/renderer.js` | 成功 | 構文OK |
| `npm run smoke` | 成功 | レポート: `artifacts/smoke-report.json` |
| `npm start` | 成功 | `FOCUS_VEIL_READY` を確認し、起動後にプロセス停止 |
| `npm start` after multi-display change | 成功 | 2画面環境で `FOCUS_VEIL_READY display-660969500` と `display-3853833632` を確認 |
| `npm start` after motion highlight change | 成功 | 2画面環境でREADY 2件、Electron 5プロセス、stderr 0 bytes |

### 問題、修正、再確認

| 問題 | 影響 | 修正 | 再確認 |
| --- | --- | --- | --- |
| Electron `42.2.0` はNode `20.12.2`でengine警告 | 将来のinstall/start不安定化 | Electronを`41.7.0`へ固定 | `npm install` と `npm audit --omit=optional` 成功 |
| smoke初回で `nativeImage.getBitmap()` 非推奨警告 | 検証ログが汚れる | `toBitmap()` へ変更 | `npm run smoke` 再実行で警告なし |
| メモリ採取用PowerShellが起動中ログを読んで失敗 | アプリ本体ではなく検証コマンドの問題 | プロセス停止後にログを読む形へ変更 | 再実行でメモリ概算取得、残プロセスなし |
| 単一巨大ウィンドウでは片側モニターだけに見えるケース | マルチディスプレイで全体に効果が出ない | ディスプレイごとにoverlay BrowserWindowを作成し、タイマー状態をメインプロセスで同期 | 2画面環境でREADYログ2件を確認 |
| 水面の雰囲気が弱い | エフェクト感が薄い | 低密度ラインに加えて散発的な薄い波紋を追加 | smokeスクショで通知時の波紋と非ブランクを確認 |
| 人が注目している場所を明るくしたい | マウス追従だけだとキーボード操作や画面変化に追従しづらい | 低解像度screen captureの差分を使うmotion highlightを追加。失敗時はハイライトなしで継続 | smokeで `motionStatus: active` と疑似motion regionを確認 |
| motion追加後もマウス周辺の円が強く、離れた動きが見えにくい | motion検出の光が薄すぎ、メインスポットとの役割も曖昧だった | メインのマウススポットを弱め、motionは別レイヤーの薄いハイライトとして追加。差分しきい値とサンプルも調整 | smokeでmouse position維持とmotion highlight生成を確認 |
| motionで明るい円が移動するのは意図と違う | 動きのある場所がほんのり明るくなる想定から外れる | メインのマウススポットは固定し、motionは最大5個の薄いハイライトだけを追加する方式へ変更 | smokeでmouse position維持とmotion highlight生成を確認 |

### smoke確認

`npm run smoke` は短時間テストモードで次を確認しました。

| 確認項目 | 結果 |
| --- | --- |
| 通常時に操作ボタンが非表示 | OK |
| 操作モードで操作ボタンが表示 | OK |
| `Start` でタイマー開始 | OK |
| `Pause` でタイマー停止 | OK |
| `Reset` で作業時間へ復帰 | OK |
| 4秒作業タイマー到達で休憩へ遷移 | OK |
| 通知演出カウントが増える | OK |
| 通常時スクリーンショットが非ブランク | OK |
| motion highlight疑似領域が受け付けられる | OK |
| motion highlightがマウススポットと独立して表示される | OK |
| motion highlightスクリーンショットが非ブランク | OK |
| 操作時スクリーンショットが非ブランク | OK |
| 通知演出スクリーンショットが非ブランク | OK |

スクリーンショット:

- `artifacts/screenshots/normal.png`
- `artifacts/screenshots/motion-highlight.png`
- `artifacts/screenshots/operation.png`
- `artifacts/screenshots/notification.png`

目視確認:

- 通常時は右下に時間だけが表示された。
- motion highlightの疑似領域で、マウススポットとは別の薄いハイライトが出た。
- 操作時はStart/Pause/Resetが表示され、ボタン文字のはみ出しは見当たらなかった。
- 通知演出中は白飛びや強いフラッシュではなく、暗幕が少し開く程度だった。
- 通知演出中に薄い波紋が表示された。
- プレビュー背景の文章は読み取れ、暗幕と水面が可読性を大きく損なう状態ではなかった。

### 通常起動確認

`npm start` を短時間起動し、標準出力の `FOCUS_VEIL_READY` を確認しました。8秒起動時点の概算は次の通りです。

| 項目 | 結果 |
| --- | --- |
| READY到達 | OK |
| stderr | 0 bytes |
| Electronプロセス数 | 4 |
| Working Set概算 | 311.7 MB |
| 起動後の残プロセス | なし |

マルチディスプレイ変更後の通常起動確認:

- `npm start` で `FOCUS_VEIL_READY display-660969500` と `FOCUS_VEIL_READY display-3853833632` を確認。
- Electronプロセス数は5。main/gpu/utilityに加え、displayごとのrendererが2つ作られる構成になった。
- 起動後の残プロセスなし。

Motion highlight追加後の通常起動確認:

- `npm start` で `FOCUS_VEIL_READY display-3853833632` と `FOCUS_VEIL_READY display-660969500` を確認。
- Electronプロセス数は5。
- stderr 0 bytes。
- 起動後の残プロセスなし。

Motion highlight調整後の通常起動確認:

- `npm start` で `FOCUS_VEIL_READY display-660969500` と `FOCUS_VEIL_READY display-3853833632` を確認。
- Electronプロセス数は5。
- stderr 0 bytes。
- 起動後の残プロセスなし。

Motion highlight独立化後の通常起動確認:

- `npm start` で `FOCUS_VEIL_READY display-660969500` と `FOCUS_VEIL_READY display-3853833632` を確認。
- Electronプロセス数は5。
- stderr 0 bytes。
- 起動後の残プロセスなし。

内訳:

- main: 91.9 MB / CPU 0.33s
- gpu: 97.3 MB / CPU 1.03s
- utility: 47.1 MB / CPU 0.05s
- renderer: 75.4 MB / CPU 0.34s

### コード確認

| 項目 | 状態 |
| --- | --- |
| 透明全画面オーバーレイ | `transparent: true`、`frame: false`、display boundsごとの複数windowで実装 |
| 通常時クリック透過 | `setIgnoreMouseEvents(true, { forward: true })` で実装 |
| 操作時クリック可能 | primary displayの操作overlayだけ `setIgnoreMouseEvents(false)` に切り替え |
| 操作モード | `Ctrl+Shift+F` のglobalShortcutで実装 |
| Ctrl単体 | フォーカス中のみベストエフォート。通常時の安定経路にはしない |
| ポモドーロ | 作業25分/休憩5分、smokeでは4秒/2秒 |
| 通知演出 | 1.6秒、暗幕alphaとライト半径のみ変化 |
| Motion highlight | `desktopCapturer` + `getUserMedia` でscreenを低解像度取得し、差分セルへ薄いハイライトを追加 |
| 除外項目 | 音声、BGM、複数テーマ、トレイ、インストーラー、複雑な設定保存は未実装 |

### 未確認範囲

- 実作業アプリに対して、通常時クリックがOSレベルで常に背面へ届くかの長時間手動確認。
- マルチモニターの基本作成はREADYログで確認済み。負座標モニター、DPI混在環境での表示範囲とマウス追従は未確認。
- Windows仮想デスクトップ切り替え時の完全自動追従。不可視時の再作成と `Ctrl+Shift+R` 復帰は実装したが、仮想デスクトップ実操作での確認は未実施。
- Motion highlightの実作業評価。動画、広告、スクロール、カーソル点滅、コード編集などへの反応は未調整。
- 画面キャプチャが制限されるアプリや保護コンテンツでのフォールバック挙動。
- 25分/5分の実時間到達。v0.1では短時間テストモードで通知演出を確認。
- 長時間常駐時のCPU/GPU推移とバッテリー影響。
