# Focus Veil User Guide

## 定義

Focus Veilは、Windows上の作業画面に薄い透明オーバーレイを重ねる集中補助アプリです。通常時は背面アプリへのクリックを邪魔せず、マウス周辺を柔らかく残しながら、周辺の視覚ノイズを少し抑えます。

この説明書は、配布 EXE または開発版のFocus Veilを自分のPCで起動し、日常作業中に操作するためのものです。

## 要点

- 通常時はクリック透過です。背面のブラウザ、エディタ、PDF、IDEなどをそのまま操作できます。
- 操作が必要なときだけ `Ctrl+Shift+F` で操作モードを開きます。
- 右下の小さなパネルで、タイマー、暗さ、スポットサイズ、スポットの柔らかさ、Ripple effects、Overlay enabled、Auto-update、`Check for updates` を調整できます。
- タイマーは Focus → Break → Focus とループします。Focus終了で全画面のヴェールがふわっと消え、Break終了でふわっと戻ります。`Overlay enabled` を切っているときは、これまでどおり暗幕は出ません。
- タスクトレイからも開始/停止、リセット、表示復帰、自動更新のON/OFF、今すぐの更新確認、終了ができます。
- 表示がおかしくなった場合は `Ctrl+Shift+R` でオーバーレイを再配置できます。

## 比較

| 状態 | できること | 背面アプリへの影響 |
| --- | --- | --- |
| 通常時 | 残り時間確認、マウス周辺のフォーカス | クリック透過。作業を邪魔しない |
| 操作モード | Start/Pause/Reset、設定変更、Overlay切替 | primary displayだけクリック可能 |
| トレイメニュー | タイマー操作、表示復帰、終了 | 作業画面を開かずに操作できる |
| Overlay disabled | タイマーとアプリ常駐だけ維持 | 暗幕とスポットライトを消す |

## 具体例

### 起動

普段使いは GitHub Releases の EXE。git / npm は不要。

1. https://github.com/Routemahiro/focus-veil/releases/latest から `FocusVeil-Setup-0.1.8.exe` または `FocusVeil-Portable-0.1.8.exe` を落とす。
2. 未署名のため SmartScreen / 「不明な発行元」が出ることがある。詳細を開いて実行する。
3. インストーラーはスタートメニューに `Focus Veil` を追加する。ポータブルはファイルをダブルクリックする。
4. 画面にヴェールが乗る。終了はトレイの `Quit`。
5. Setup で入れた場合、自動更新は既定 ON。切るときは操作メニューまたはトレイの `Auto-update`。待っていても入らないときは、その直下の `Check for updates`。ポータブル EXE は自動更新しない。

開発版は依存関係を入れてから起動する。

```powershell
npm install
npm start
```

開発起動に成功すると、ログにディスプレイごとのREADY行が出ます。

```text
FOCUS_VEIL_READY display-...
```

### 終了

タスクトレイのFocus Veilアイコンを開き、`Quit` を選びます。

開発中にターミナルから終了したい場合は、起動したターミナルで終了するか、Electronプロセスを終了します。通常利用ではトレイの `Quit` を使うのが安全です。

### 基本操作

| 操作 | 内容 |
| --- | --- |
| `Ctrl+Shift+F` | 操作モードの表示/非表示 |
| `Esc` | 操作モードを閉じる |
| メニュー外クリック | 操作モードを閉じる |
| `Ctrl+Shift+R` | オーバーレイウィンドウを再配置 |
| トレイ `Start Timer` | タイマー開始 |
| トレイ `Pause Timer` | タイマー停止 |
| トレイ `Reset Timer` | 現在フェーズの時間へリセット |
| トレイ `Quit` | アプリ終了 |

### 右下パネル

通常時は、右下に残り時間と小さな `Ctrl+Shift+F` が出ます。マウスがこの待機枠に近づくと枠だけほぼ透明になり、離れると元の濃さに戻ります。全画面のヴェールは薄くなりません。この待機枠と、操作モードの設定パネルの枠・スライダー・チェックの色はフェーズに従います。Focus は `#6E9878`、Break は `#C9ADC6` です。全画面のヴェール自体の色は変えません。操作モードでは次のコントロールが表示されます。パネル右下に `ショートカット：Ctrl+Shift+F` も出ます。操作モード中の設定パネルは、マウスが近くても薄くしません。

| 項目 | 内容 | 目安 |
| --- | --- | --- |
| `Start` | タイマー開始。Focus → Break → Focus と回り続ける | 作業開始時 |
| `Pause` | タイマー停止 | 途中で止めたい時 |
| `Reset` | 現在フェーズの時間へ戻す | セッションをやり直す時 |
| `Veil` | 周辺の暗さ | 強すぎると探索しにくいので控えめ推奨 |
| `Size` | マウス周辺の明るい範囲 | コードや比較作業では広め |
| `Soft` | スポット境界の柔らかさ | 高めにすると自然に見える |
| `Focus` | 作業時間の分数 | 初期値25分 |
| `Break` | 休憩時間の分数 | 初期値5分 |
| `Ripple effects` | 水面の揺らぎと薄い波紋 | 既定 ON。不要ならOFF。暗幕やスポットは残る |
| `Overlay enabled` | 暗幕とスポットライトを有効化 | 一時的に消したい時はOFF |
| `Auto-update` | GitHub Releases から Setup 更新を自動確認 | 既定 ON。切ると自動の確認とダウンロードはしない |
| `Check for updates` | 今すぐ GitHub Releases を確認して落とす | Auto-update の直下。ON/OFF とは別。ポータブルと `npm start` では入れられず、その旨を表示してから Releases を開くか聞く |

### トレイメニュー

トレイメニューでは、操作モードを開かずに次を操作できます。

- タイマー開始/停止
- タイマーリセット
- 操作モード切替
- Overlay enabled
- Ripple effects
- Auto-update
- Check for updates（Auto-update の直下。今すぐ確認）
- Veil Strength
- Refresh Overlay Windows
- Restart to Update（更新を入れたあと）
- Quit

### おすすめの使い方

#### 文章を書く

- `Veil` は標準から少し強め。
- `Size` は狭すぎない程度。
- `Soft` は高め。

#### コードを書く

- `Size` は広め。
- `Veil` は強くしすぎない。
- 複数ペインや差分を見る場合、周辺情報が必要なので暗くしすぎない方が扱いやすいです。

#### 調べもの、検索、一覧確認

- `Veil` は弱め。
- `Size` は広め。

### 表示がおかしい時

| 症状 | 対応 |
| --- | --- |
| 片方のモニターに出ない | `Ctrl+Shift+R` またはトレイの `Refresh Overlay Windows` |
| 仮想デスクトップ切替後に戻らない | `Ctrl+Shift+R` |
| 背面アプリをクリックできない | 操作モードを閉じる。`Ctrl+Shift+F`、`Esc`、またはメニュー外クリック |
| 画面が暗すぎる | 操作モードで `Veil` を下げる、または `Overlay enabled` をOFF |
| 水面の線や波紋が気になる | `Ripple effects` をOFF |
| タイマーだけ使いたい | `Overlay enabled` をOFF |

### 設定保存

設定はElectronのuserData配下に `settings.json` として保存されます。保存対象は次の通りです。

- Overlay enabled
- Ripple effects（`rippleEnabled`。無い既存ファイルは ON として読む）
- Auto-update（`autoUpdateEnabled`。無い既存ファイルは ON として読む）
- Veil
- Size
- Soft
- Focus分数
- Break分数

`npm run smoke` の短時間テストでは、ユーザー設定を保存しません。古い `motionEnabled` は読み捨てます。

### 自動更新

- 対象は **インストール済み Setup**（スタートメニューから起動する版）だけ。ポータブル EXE と `npm start` は electron-updater で入れられない。
- 既定は ON。起動後に `Routemahiro/focus-veil` の GitHub Releases を見にいく。
- OFF にすると自動の確認とダウンロードはしない。途中で切った場合も、終了時にインストーラーは起動しない。
- `Check for updates` は Auto-update の直下（操作メニューとトレイ）にあり、ON/OFF とは別に今すぐ確認する。更新があれば同じ進捗バーで落とす。
- ポータブル EXE で押してもダウンロードは始まらない。表示は `Portable builds cannot install updates. Use the Setup installer.` トレイは `Portable build cannot update`。続けて `Open the GitHub Releases page?` と聞く。Yes まで https://github.com/Routemahiro/focus-veil/releases/latest は開かない。No なら閉じるだけ。
- `npm start` で押してもダウンロードは始まらない。表示は `npm start cannot install updates. Use the Setup installer.` トレイは `npm start cannot update`。聞く内容はポータブルと同じで、Yes までブラウザは開かない。
- トレイから押したときも同じ質問を操作メニューに出す。インストール済み Setup ではこの質問は出さず、今までどおり確認して落とす。
- 更新が入ったらトレイに `Restart to Update` が出る。Auto-update が ON のとき、Quit 時にも適用する。手動確認で落とした場合は `Restart to Update` から入れる。
- ダウンロード中だけ、右下のコンパクトタイマーの下に細い進捗バーが出る。終わると消える。
- 未署名のため、更新インストーラーでも SmartScreen / 「不明な発行元」が出ることがある。詳細情報 → 実行。

### 既知の制限

- Ctrl単体でのグローバル操作は安定要件から外しています。安定操作は `Ctrl+Shift+F` です。
- Windows仮想デスクトップへの完全追従はElectron標準APIだけでは保証できません。表示が戻らない場合は `Ctrl+Shift+R` を使います。
- 配布 EXE は未署名です。Windows SmartScreen や「不明な発行元」が、初回実行と自動更新の両方で出ることがあります。
- 自動更新は Setup インストール版だけです。ポータブル利用者は Releases から新しい EXE を入れ直してください。
