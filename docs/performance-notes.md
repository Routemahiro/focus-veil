# Focus Veil Performance Notes

## 定義

このメモは、Focus Veilを常時起動した場合のおおよその負荷を整理するものです。数値は環境、ディスプレイ数、DPI、Motion highlight、表示内容、GPU状態で変わります。

## 要点

- 現在の2ディスプレイ環境では、Electronプロセスは5個でした。
- Motion highlight有効、2ディスプレイ、通常起動後の実測では、CPUは全論理CPU比で約3.6-3.7%でした。
- 1コア換算では約57-60%です。これは「16論理CPU環境で、1コアの半分強を使う程度」という読み方です。
- Private Memoryは約447-452MBでした。
- Working Setは約1.05GBでした。ただしElectron/Chromiumの共有メモリやGPU関連メモリをプロセスごとに足し込むため、Private Memoryより大きく見えます。
- 軽い常駐ツールというより、2画面オーバーレイ + Canvas描画 + 低解像度画面キャプチャを行う中程度の常駐負荷です。

## 比較

| 観点 | おおよその評価 | 理由 |
| --- | --- | --- |
| CPU | 中程度 | Canvas描画を約30fpsで行い、Motion highlightが低解像度screen captureを読むため |
| メモリ | 中程度 | Electron main/gpu/utilityに加えて、ディスプレイごとのrendererが立つため |
| GPU | 未計測だが使用あり | 透明オーバーレイ、Canvas、Chromium GPU processを使うため |
| バッテリー影響 | あり得る | ノートPCで長時間常駐する場合、Motion highlightと複数ディスプレイが効きやすい |
| 作業体感 | PC性能次第 | デスクトップや余裕のあるノートでは許容しやすいが、低電力環境ではMotion highlight OFF推奨 |

## 具体例

### 測定条件

- 測定日: 2026-06-09
- OS: Windows
- 起動方法: `.\node_modules\.bin\electron.cmd .`
- ディスプレイ: 2画面
- READYログ:
  - `FOCUS_VEIL_READY display-282130665`
  - `FOCUS_VEIL_READY display-2323465820`
- Electronプロセス数: 5
- 論理CPU数: 16
- Motion highlight: 有効状態
- stderr: 空

### 実測サンプル

| サンプル | 時間 | CPU 全論理CPU比 | CPU 1コア換算 | Working Set合計 | Private Memory合計 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 30秒 | 3.553% | 56.85% | 1047.4MB | 446.5MB |
| 2 | 20秒 | 3.746% | 59.93% | 1055.3MB | 451.8MB |

### 読み方

Windowsのタスクマネージャーで見るCPU%は、通常は全論理CPUに対する割合です。この環境は16論理CPUなので、1コア換算で約57-60%でも、全体表示では約3.6-3.7%になります。

Working Setは「現在物理メモリ上に載っている量」に近い値ですが、Chromium系プロセスでは共有メモリやGPU関連の見え方で大きく見えます。常駐コストを見る場合は、Private Memoryの約450MBもあわせて見た方が現実に近いです。

### 負荷の主因

1. ディスプレイごとのrenderer
   - 2画面ではoverlay rendererが2つ立ちます。
   - ディスプレイが増えるとrendererとCanvas描画も増えます。
2. Canvas描画
   - `requestAnimationFrame` 内で約30fpsに制限しています。
   - 水面、スポットライト、Motion highlightを1枚のCanvasへ描画します。
3. Motion highlight
   - 各ディスプレイのscreen captureを128x72pxへ縮小し、最大10fps程度で差分を見ます。
   - 動画、スクロール、広告、ローディングなど動きが多い画面では処理が増えやすいです。
4. Electron/Chromium基盤
   - main、gpu、utility、rendererという複数プロセス構成になります。

### 常時起動の判断

デスクトップPCや電源接続中のノートPCなら、現状でも常時起動は現実的です。ただし、バッテリー運用、低電力CPU、メモリに余裕がない環境では、Motion highlightをOFFにするのが安全です。

おすすめ:

- 電源接続中: Motion highlight ONでも試す価値あり。
- バッテリー運用: Motion highlight OFF推奨。
- 2画面以上: CPUとメモリを見ながら使う。
- 動画や重いWebページをよく開く: Motion highlight OFFまたは今後のしきい値調整が必要。

### 今後の軽量化候補

- Motion highlight OFF時にscreen capture関連を完全停止する確認を強化する。
- マウス停止中、通知なし、Motion highlightなしの時はCanvas描画頻度をさらに下げる。
- Overlay disabled時は描画ループを低頻度化する。
- Motion highlightのサンプリング間隔を設定化する。
- ProfileごとにMotion highlight強度を下げる。
- 長時間常駐テストでCPU、Private Memory、Working Setの推移を記録する。
