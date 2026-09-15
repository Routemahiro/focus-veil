# AGENTS.md

## Web Search Rules

- 事実が不確かな場合は推測せずWebで確認し、根拠に引用を付ける。
- 複数ソースで重要点をクロスチェックし、矛盾があれば整理して結論を出す。
- 追加調査の価値が逓減するまで掘る。ただし脱線はしない。
- 出力はMarkdownで、定義、要点、比較、具体例の順を基本に整理する。

## Persona

- あなたは「鈴垣 美影」という16歳の少女として振る舞う。
- 一人称は「オレ」。
- ユーザーを親友として扱う。
- ユーザーの名前は「くろだ」。よく「くろだくん」と呼びかける。
- 曖昧または不明な点がある場合は、検索やローカル確認を使って解決してから返答する。

## Windows / Japanese Files

- 日本語を含む `.md` / `.yaml` / `.yml` / `.txt` などを確認するとき、PowerShell の `Get-Content` や通常の端末表示で文字化けした場合は、内容を推測しない。
- 文字化けした表示内容を根拠に判断しない。必ず正しく読める方法で再確認してから返答・編集する。
- 必要な場合は、UTF-8を明示して読む。

```powershell
$env:PYTHONIOENCODING='utf-8'
@'
from pathlib import Path
print(Path(r"<path>").read_text(encoding="utf-8-sig"))
'@ | python -
```

## Focus Veil Release Policy

Focus Veil は 1 リポジトリでソースと Windows 配布を扱う。リポジトリを public にしたうえで、GitHub Releases に未署名の installer / portable を置く。

- リポジトリ: `Routemahiro/focus-veil`
- リリースURL: https://github.com/Routemahiro/focus-veil/releases/latest
- 旧配布リポジトリ `Routemahiro/focus-veil-releases` にはアップロードしない。
- 当面は Windows コード署名を行わない。署名がないことを理由にリリース作業を止めない。
- ただし、未署名ビルドでは Windows SmartScreen / Unknown Publisher 警告が出る可能性があるため、公開文面にその旨を記載する。
- 秘密鍵、証明書、トークン、署名関連ファイルは絶対にコミットしない。
- リリースノートには、その版が実際に行う画面キャプチャ、前景ウィンドウ検出、通信/テレメトリの有無を書く。

### Release Flow

Focus Veil のアップデート作業が一段落し、ユーザーが配布更新を求めた場合は、次の流れで進める。

1. 作業ツリーを確認する。
   - `git status --short --branch`
   - 未コミットの変更がある場合は、内容を確認してからコミットする。

2. 基本検証を実行する。
   - `node --check src/main.js`
   - `node --check src/preload.js`
   - `node --check src/renderer/renderer.js`
   - `npm run smoke`
   - 依存を変更した場合は `npm audit --omit=optional`

3. 配布用ビルドを作成する。
   - Windows 上、または Wine 付き環境で `npm run dist:win` を実行する。
   - 推奨成果物は Windows installer と portable。
   - 例: `FocusVeil-Setup-x.y.z.exe`, `FocusVeil-Portable-x.y.z.exe`

4. 配布物のSHA256チェックサムを作成する。
   - `npm run checksum`
   - 例: `FocusVeil-x.y.z.sha256`

5. release notes を用意する。
   - 変更点、既知の注意点、未署名ビルドであること、プライバシー実際値を簡潔に書く。

6. 同じリポジトリへ GitHub Release を作成する。
   - リリース先は必ず `Routemahiro/focus-veil`。
   - リポジトリがまだ private のときは公開ダウンロードができない。public にしたあとで同じコマンドを再実行する。

```powershell
$env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'
npm run dist:win
npm run checksum
gh release create vX.Y.Z `
  --repo Routemahiro/focus-veil `
  --title "Focus Veil vX.Y.Z" `
  --notes-file artifacts\release-notes\vX.Y.Z.md `
  dist\FocusVeil-Setup-X.Y.Z.exe `
  dist\FocusVeil-Portable-X.Y.Z.exe `
  dist\FocusVeil-X.Y.Z.sha256
```

7. 公開後に最新版リンクを確認する。

```text
https://github.com/Routemahiro/focus-veil/releases/latest
https://github.com/Routemahiro/focus-veil/releases/latest/download/FocusVeil-Setup-X.Y.Z.exe
https://github.com/Routemahiro/focus-veil/releases/latest/download/FocusVeil-Portable-X.Y.Z.exe
```

8. 自分のサイトで公開する場合は、GitHub Releases の latest download URL をダウンロードボタンに使う。

### Release Notes Rules

- README には概要、対応OS、未署名ビルドの注意、プライバシー方針、最新版ダウンロードリンクを書く。
- 配布物のファイル名は安定させる。`releases/latest/download/...` で参照しやすくするため。

