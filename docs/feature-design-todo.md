# Feature Design TODO

## 定義

このファイルは、Focus Veilの次フェーズ機能を実装可能な粒度まで固めた設計TODOです。対象は `Focus Profiles`、`Ambient Progress`、`Gentle Breaks` の3つです。

Return Markerは今回の対象外です。単なる「最後に見ていた場所」ではなく、最後の作業文脈を復元する `Return Context` として将来フェーズで再設計します。

## 要点

- `Focus Profiles` は採用します。`Code`、`Read`、`Write`、`Scan` の4モードに加え、手動調整後の `Custom` を内部状態として扱います。
- `Ambient Progress` は採用します。通常時の大きなタイマー表示ではなく、画面端の低主張な進捗ラインを主役にします。
- `Gentle Breaks` は条件付き採用します。固定タイマーは残し、休憩開始の通知だけを作業の区切りに寄せます。
- 通知制御、音、ブロッカーは今回の実装範囲から外します。
- 設計根拠は `docs/research-connections.md` を参照します。このファイルは実装仕様と作業順序を管理します。

## 比較

| 項目 | 判断 | 実装方針 |
| --- | --- | --- |
| Focus Profiles | 採用 | 単一の全ディスプレイ同期設定として保存し、primary displayの操作UIとトレイから切り替える |
| Ambient Progress | 採用 | rendererのCanvasに画面端ラインとして描画し、全ディスプレイに同期表示する |
| Gentle Breaks | 条件付き採用 | main processのtimer stateで保留状態を持ち、Electron `powerMonitor.getSystemIdleTime()` で区切りを判定する |
| Return Marker | 保留 | `Return Context` として別設計に分離する |
| 通知制御、音、ブロッカー | 見送り | Focus Veilの中核から外れるため別フェーズで扱う |

## 具体例

### 1. Focus Profiles

#### 仕様

Profileは、スポットライトの見た目と動きのプリセットです。ユーザーがProfileを選ぶと、既存の `veilAlpha`、`spotlightRadius`、`spotlightSoftness` に加えて、形状、追従速度、motion highlight強度、Ambient Progress強度をまとめて適用します。

手動でスライダーを変更した場合は、現在値を維持したまま `focusProfile: "custom"` にします。Profileの上書き保存はv0.2では採用せず、まずはプリセット選択とCustom状態だけにします。

#### 推奨初期値

| Profile | veilAlpha | radius | softness | shape | aspectX | aspectY | followMovingMs | followIdleMs | motionIntensity | ambient |
| --- | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | --- |
| Code | 0.14 | 285 | 0.72 | circle | 1.00 | 1.00 | 76 | 124 | 0.85 | visible |
| Read | 0.15 | 250 | 0.80 | vertical | 0.82 | 1.28 | 90 | 145 | 0.35 | subtle |
| Write | 0.18 | 225 | 0.76 | circle | 1.00 | 1.00 | 100 | 160 | 0.25 | subtle |
| Scan | 0.08 | 350 | 0.88 | wide | 1.25 | 0.95 | 58 | 92 | 0.20 | off |

補足:

- `Code` は複数ペインと差分確認を想定し、現在値より少し広く、暗さは控えめにする。
- `Read` は文章の縦方向の流れを邪魔しないため、縦長スポットを採用する。
- `Write` は入力対象への没入を優先し、中央寄り、やや暗め、追従遅めにする。
- `Scan` は全体探索を妨げないため、暗化を弱くし、範囲を広くする。

#### 設定スキーマ

既存の `settings.json` は後方互換を維持します。新規キーがない既存ユーザーは `focusProfile: "custom"` として読み、現在の体感値を保持します。

追加候補:

```json
{
  "schemaVersion": 2,
  "focusProfile": "custom",
  "spotlightShape": "circle",
  "spotlightAspectX": 1,
  "spotlightAspectY": 1,
  "spotlightFollowMovingMs": 72,
  "spotlightFollowIdleMs": 118,
  "motionHighlightIntensity": 1,
  "ambientProgressMode": "subtle"
}
```

Profile選択時は、Profile presetから上記キーと既存キーをまとめて `updateSettings` へ渡します。手動調整時は `focusProfile` だけ `custom` に変えます。

#### UI

- 操作モード内に4分割のセグメントコントロールを追加する。表示は `Code`、`Read`、`Write`、`Scan`。
- `Custom` は独立ボタンにせず、手動調整後に小さな状態表示として扱う。
- トレイには `Focus Profile` サブメニューを追加し、4Profileをradio itemで選べるようにする。
- Profile切替は全ディスプレイ同期にする。ディスプレイ別Profileはv0.2では採用しない。

### 2. Ambient Progress

#### 仕様

Ambient Progressは、タイマーの残り時間を画面端の低主張な進捗ラインで伝える機能です。現行の右下タイマーは完全には消さず、通常時は薄くし、操作モードでは正確な残り時間を明瞭に表示します。

#### 表示

- 表示形式: 下端の水平ライン。
- 表示対象: 全ディスプレイ。
- 太さ: `subtle` は2px、`visible` は3px、`off` は非表示。
- 進捗: 左から右へ伸びる。`progress = 1 - remaining / currentPhaseDuration`。
- Focus色: 低彩度の青緑系。
- Break色: 低彩度の琥珀系。
- 終了直前パルス: 最後45秒、または残り10%の短い方から開始する。パルスはalphaをわずかに上げるだけで、点滅や白フラッシュは使わない。

#### 強度

| Mode | 使い方 | 数字タイマー |
| --- | --- | --- |
| off | 従来表示に近い | 通常時も今まで通り |
| subtle | デフォルト候補。進捗だけ薄く伝える | 通常時はopacityを下げ、操作モードでは通常表示 |
| visible | Codeなど、少し時間感覚を残したい時 | 通常時もやや見える |

Profile別の初期値は、`Code: visible`、`Read: subtle`、`Write: subtle`、`Scan: off` とします。既存ユーザーの移行時は `subtle` を補完します。

#### UI

- 操作モード内に `Progress` の3段階セグメント `Off / Subtle / Visible` を追加する。
- トレイには `Ambient Progress` サブメニューを追加する。
- 通常時のタイマー数字は残すが、Ambient Progressが有効な場合はCSSで控えめにする。

### 3. Gentle Breaks

#### 仕様

Gentle Breaksは、固定タイマーを置き換える機能ではありません。`25分集中 -> 5分休憩` のような目安は残し、タイマー到達時にユーザーが操作中なら、休憩への切り替え通知を少し待つ機能です。

Electronの公式API `powerMonitor.getSystemIdleTime()` は、システムのアイドル時間を秒単位で取得できます。これを使い、キーボード/マウス入力をアプリ横断で推測します。ネイティブキーボードフックはv0.2では採用しません。

参考: [Electron powerMonitor](https://www.electronjs.org/docs/latest/api/power-monitor/)

#### 推奨初期値

```json
{
  "gentleBreaksEnabled": true,
  "gentleBreakIdleThresholdSeconds": 8,
  "gentleBreakGraceSeconds": 30,
  "gentleBreakMaxDeferralSeconds": 300
}
```

#### 状態遷移

1. Focusタイマーが0になる。
2. `gentleBreaksEnabled` がfalseなら、現行通りすぐBreakへ切り替える。
3. trueの場合、`powerMonitor.getSystemIdleTime() >= 8` ならすぐBreakへ切り替える。
4. 操作中なら `pendingPhase: "break"` を作り、`phase: "work"`、`remaining: 0` のまま静かに保留する。
5. 保留中にアイドル8秒へ到達したらBreakへ切り替え、現行の静かな通知演出を出す。
6. 保留が30秒を超えたら、Ambient Progressを少し強める。
7. 保留が5分を超えたら、強制ロックではなく、Breakへ静かに切り替える。

Break終了時も同じ仕組みを使えます。ただし初期実装ではFocus終了時のBreak提案だけを対象にし、Break終了からFocusへの復帰は現行通りでよいです。

#### タイマー操作

- pending中の `Start`: pending先のBreakへ即時切り替えて開始する。
- pending中の `Pause`: pending状態を維持する。
- pending中の `Reset`: pendingを破棄し、Focusタイマーを現在のWork分へ戻す。

#### 表現

- 中央モーダル、強制ロック、音、点滅は使わない。
- 休憩提案は、Ambient Progressの色変化、右下タイマーの小さなラベル、既存の暗幕がふわっと開く演出に留める。
- 効果説明は「集中力が必ず上がる」ではなく、「疲労を抑え、休憩への移行を邪魔しにくくする」と表現する。

### 4. Cross-Feature Decisions

- Profile、Ambient Progress、Gentle Breaksはすべてメインプロセスのsettingsを単一ソースにする。
- IPCは既存の `focus-veil:update-settings` を拡張する。新規timer actionは増やさず、pending中の既存actionの意味だけを明確化する。
- rendererのCanvasは1枚のままにし、Ambient Progressはveil、spotlight、motion highlight、水面の描画後に最後の軽いレイヤーとして描く。
- SmokeではProfile切替、Ambient Progressの非ブランク描画、Gentle Breaksのpending状態を短時間タイマーで検証する。
- READMEには利用者向けの短い説明だけを載せ、細かい根拠と設計判断はdocsへ置く。

### 5. 実装順序

1. 設定スキーマを拡張する。
   - `src/main.js` の `defaultSettings` と `normalizeSettings`
   - `src/renderer/renderer.js` の `defaultSettings` と `normalizeSettings`
2. Focus Profilesを入れる。
   - preset定義
   - Profile切替UI
   - トレイradio menu
   - 手動調整時の `custom` 化
3. Spotlight描画をProfile対応にする。
   - aspectX/aspectYによる楕円描画
   - followMovingMs/followIdleMs
   - motionHighlightIntensity
4. Ambient Progressを入れる。
   - Canvas下端ライン
   - mode別強度
   - timer panelの通常時opacity調整
5. Gentle Breaksを入れる。
   - `powerMonitor` import
   - pendingPhase状態
   - idle判定
   - max deferral
6. Smokeとdocsを更新する。
   - Profile切替のIPC検証
   - Ambient Progress screenshot検証
   - Gentle Breaks pending状態検証
   - `docs/verification-log.md` 追記

### 6. 実装前の確認推奨項目

以下は実装を止める未決事項ではありません。推奨初期値で進められますが、体感確認で調整する項目です。

- `Code` の半径285pxが広すぎないか。
- `Read` の縦長スポットがPDF/ブラウザ読書で自然に感じるか。
- `Write` の追従遅め設定がもたつきに見えないか。
- `Ambient Progress` 有効時に右下タイマーをどこまで薄くするか。
- `Gentle Breaks` の最大延長5分が長すぎないか。

### 7. Design Completion Checklist

- [x] `docs/research-connections.md` と矛盾しない仕様になっている。
- [x] 採用機能、保留機能、見送り機能が分かれている。
- [x] 各機能の初期値が決まっている。
- [x] 設定保存と既存設定からの移行方針が決まっている。
- [x] 操作モード、トレイ、通常時表示の役割分担が決まっている。
- [x] 実装後の検証項目が `docs/verification-log.md` に追記できる粒度になっている。
- [x] くろだくんの体感確認が必要な項目が明確になっている。
