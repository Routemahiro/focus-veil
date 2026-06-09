# Research Connections for Focus Veil

## 定義

このメモは、Focus Veilに追加候補として残した機能と、関連研究の接続を整理するためのものです。ここで扱う集中支援は、集中力そのものを直接増やす魔法ではなく、作業画面上の注意配分、時間感覚、休憩移行を邪魔しにくく整えるUI設計として定義します。

対象機能は次の3つです。

- Focus Profiles: `Code`、`Read`、`Write`、`Scan` のように、作業タイプごとにスポットライトの形、広さ、暗さ、追従感を切り替える。
- Ambient Progress: 残り時間を大きな数字で主張せず、画面端の薄いラインやリングで時間感覚だけ渡す。
- Gentle Breaks: 固定タイマーを基本にしつつ、入力中や操作中に強く割り込まず、区切りに近いタイミングで休憩を促す。

Return Markerは保留です。最後に見ていた場所を示すだけでは弱く、最後の作業文脈を取り出す機能として別設計にする必要があります。

## 要点

サブエージェント3名の整理では、次の結論で一致しました。

- Focus Profilesは、スポットライト/マスキング研究と直接接続できる。注目領域を通常表示し、周辺を弱める方針は有効だが、作業によって必要な視野の広さが違うため、単一設定ではなくプロファイル化が妥当。
- Ambient Progressは、Calm technologyや周辺表示の考え方と接続できる。タイマーを注意の中心に置かず、周辺で状態だけ伝える設計がFocus Veilの思想に合う。
- Gentle Breaksは、休憩そのものの効果と割り込みタイミングを分けて扱うべき。固定タイマーは目安として残し、休憩通知の出し方だけを穏やかにする。
- いずれも「強く主張するUI」ではなく、「作業アプリを主役に残すUI」として設計するのが重要。

## 比較

| 機能 | 研究から言えること | Focus Veilへの接続 | 採用判断 |
| --- | --- | --- | --- |
| Focus Profiles | スポットライトや暗化マスクは注意対象を浮かせられる。ただし周辺視野は探索にも必要。 | 現在のマウススポットを、作業タイプごとの視野要求へ合わせる。 | 採用 |
| Ambient Progress | 周辺表示は、主作業を妨げずに副次情報を伝える余地がある。過剰な動きは逆効果。 | タイマーを大きく読ませず、時間感覚だけを薄く渡す。 | 採用 |
| Gentle Breaks | Micro-breaksは疲労低減や活力維持に有望。ただし休憩通知自体が割り込みになり得る。 | 固定タイマーを残し、通知タイミングだけを作業の区切りへ寄せる。 | 条件付き採用 |
| Return Marker | 中断後の復帰支援は有望だが、単なる位置表示では作業文脈を復元しにくい。 | 「最後に見た場所」ではなく「最後の作業文脈」を扱う必要がある。 | 保留 |

## 具体例

### Focus Profiles

スポットライトUIは、AutodeskのSpotlight研究で、大画面およびデスクトップ環境における注意誘導手法として検証されています。IBMのGUIマスキング研究でも、暗化、漂白、スクリーン処理によって背景情報を弱め、対象を目立たせる考え方が扱われています。

Focus Veilでは、この考え方を単一の暗さ調整ではなく、タスク別プロファイルとして扱います。

| Profile | 目的 | 方向性 |
| --- | --- | --- |
| Code | IDE、複数ペイン、差分確認 | 広め、暗さ控えめ、柔らかい追従 |
| Read | 記事、PDF、ドキュメント読解 | 縦方向に余裕のある形、視線移動を邪魔しない暗さ |
| Write | 文章入力、エディタ集中 | 中央重視、やや暗め、動き少なめ |
| Scan | 探索、一覧確認、全体把握 | 暗化を弱く、範囲を広く、全体視認性を残す |

実装時は、`veilAlpha`、`spotlightRadius`、`spotlightSoftness`、追従速度に加えて、Read用の縦長形状を扱えるかを検討します。最適値は作業内容と個人差に依存するため、プロファイルは固定値ではなく手動調整の入口として扱います。

### Ambient Progress

Ambient Progressは、タイマー情報を「読むUI」ではなく「感じるUI」に寄せます。Calm technologyの考え方では、情報は必要なときだけ注意の中心に移り、それ以外は周辺で認識できる状態が望ましいとされます。Microsoft ResearchのCalm Displays研究でも、環境に馴染む表示は邪魔になりにくい一方、見やすさとのトレードオフがあることが示されています。

Focus Veilでは、次の方針が適しています。

- 画面端に1-2px程度の薄い進捗ラインを置く。
- 大きな数字、中央モーダル、常時点滅は避ける。
- `off`、`subtle`、`visible` の3段階程度で調整できるようにする。
- 終了直前だけ、ごく弱いパルスを許容する。
- Profileごとに主張の強さを変える。例: `Write` は控えめ、`Code` は少し見やすく、`Scan` はほぼ非表示。

### Gentle Breaks

Micro-breaks研究では、10分以内の短い休憩が疲労低減や活力維持に有望とされています。ただし、総合的なパフォーマンス改善はタスク依存であり、休憩通知そのものが集中作業を割り込む可能性があります。割り込み研究では、主作業の途中ではなく区切りで提示する方が悪影響を抑えやすいことが示されています。

Focus Veilでは、固定タイマーを廃止しません。固定タイマーは「あとこれだけ頑張ろう」という目安として機能するためです。Gentle Breaksは固定タイマーの代替ではなく、休憩開始の提示タイミングを少し賢くする補助として扱います。

初期方針は次の通りです。

- `25分集中 -> 5分休憩` のような固定タイマーを基本にする。
- タイマー終了時に直近数秒のキー入力やマウス操作がある場合、すぐ大きく通知せず短く猶予する。
- 入力停止やマウス停止が続いたら、休憩提案を自然に出す。
- 強制ロックや中央モーダルは使わない。
- 長く延長しすぎた場合だけ、Ambient Progressを少し強める。

効果表現は「集中力が必ず上がる」ではなく、「疲労を抑え、休憩への移行を邪魔しにくくする」に留めます。

## 参考

- Autodesk Research: [Spotlight: Directing Users' Attention on Large Displays](https://www.research.autodesk.com/publications/spotlight-directing-users-attention-on-large-displays/)
- IBM Research: [Visual attention techniques in the graphical user interface](https://research.ibm.com/publications/visual-attention-techniques-in-the-graphical-user-interface)
- Microsoft Research: [Towards Calm Displays: Matching Ambient Illumination in Bedrooms](https://www.microsoft.com/en-us/research/publication/towards-calm-displays-matching-ambient-illumination-bedrooms/)
- Weiser & Brown: [The Coming Age of Calm Technology](https://calmtech.com/papers/coming-age-calm-technology)
- Graphics Interface: [Animation in a peripheral display](https://graphicsinterface.org/proceedings/gi2007/gi2007-19/)
- IBM Research: [Tradeoffs in displaying peripheral information](https://research.ibm.com/publications/tradeoffs-in-displaying-peripheral-information)
- PLOS ONE: [Give me a break! A systematic review and meta-analysis on the efficacy of micro-breaks](https://journals.plos.org/plosone/article/file?id=10.1371%2Fjournal.pone.0272460&type=printable)
- Cornell Chronicle: [When workers heed computer's reminder to take a break, their productivity jumps](https://news.cornell.edu/stories/1999/09/onscreen-break-reminder-boosts-productivity)
- Bailey & Konstan: [On the need for attention-aware systems](https://www.sciencedirect.com/science/article/abs/pii/S074756320500107X)
