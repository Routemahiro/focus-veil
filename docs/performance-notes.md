# Focus Veil Performance Notes

## 定義

このメモは、Focus Veilを常時起動した場合のおおよその負荷を整理するものです。数値は環境、ディスプレイ数、DPI、Motion highlight、表示内容、GPU状態で変わります。

## 要点

- 2026-06-12のPhase 1軽量化で、アイドル時のCanvas描画をactive/idleに分け、Motion captureを5fps/320msサンプリングへ下げ、停止中timer IPCと不要なoverlay復帰処理を抑制しました。
- 2ディスプレイ、Motion highlight有効、マウス静止アイドルの実測では、CPUは全論理CPU比で約1.3-1.8%でした。軽量化前の約3.6-3.7%から、おおむね半分以下です。
- 1コア換算では約20-28%です。軽量化前は約57-60%でした。
- Overlay disabled時は、描画ループとMotion captureを停止するため、CPUは全論理CPU比で約0.01%でした。
- Private MemoryはMotion highlight有効時で約453-455MB、Overlay disabled時で約340MBでした。Electron/Chromiumの固定費があるため、CPUほど大きくは下がりません。
- Working SetはMotion highlight有効時で約1.04-1.05GBでした。Chromium系の共有メモリやGPU関連メモリをプロセスごとに足し込むため、Private Memoryより大きく見えます。

## 比較

| 観点 | Phase 1後の評価 | 理由 |
| --- | --- | --- |
| CPU | 改善済み、中程度から低-中程度へ | アイドル時描画を約10fpsへ落とし、captureも5fpsへ下げたため |
| メモリ | 中程度 | Electron main/gpu/utilityとディスプレイごとのrendererが残るため |
| GPU | 未計測だが使用あり | 透明オーバーレイ、Canvas、Chromium GPU processを使うため |
| バッテリー影響 | まだ注意 | Motion highlight有効時は画面キャプチャとCanvas描画が残るため |
| Overlay disabled | 軽い | Canvas描画とMotion captureを止めるため、タイマーUI中心の常駐になる |

## 具体例

### 測定条件

- 測定日: 2026-06-12
- OS: Windows
- 起動方法: `.\node_modules\.bin\electron.cmd .`
- ディスプレイ: 2画面
- READYログ:
  - `FOCUS_VEIL_READY display-3821392205`
  - `FOCUS_VEIL_READY display-1016114638`
- Electronプロセス数: 5
- 論理CPU数: 16
- stderr: 空

### 実測サンプル

| 条件 | 時間 | CPU 全論理CPU比 | CPU 1コア換算 | Working Set合計 | Private Memory合計 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 軽量化前 Motion ON | 30秒 | 3.553% | 56.85% | 1047.4MB | 446.5MB |
| 軽量化前 Motion ON | 20秒 | 3.746% | 59.93% | 1055.3MB | 451.8MB |
| Phase 1後 Motion ON idle | 30秒 | 1.769% | 28.30% | 1043.4MB | 452.9MB |
| Phase 1後 Motion ON idle | 30秒 | 1.275% | 20.40% | 1049.1MB | 454.7MB |
| Phase 1後 Overlay disabled | 30秒 | 0.010% | 0.16% | 407.3MB | 339.8MB |

### 読み方

Windowsのタスクマネージャーで見るCPU%は、通常は全論理CPUに対する割合です。この環境は16論理CPUなので、1コア換算で約20-28%でも、全体表示では約1.3-1.8%になります。

Working Setは「現在物理メモリ上に載っている量」に近い値ですが、Chromium系プロセスでは共有メモリやGPU関連の見え方で大きく見えます。常駐コストを見る場合は、Private Memoryもあわせて見た方が現実に近いです。

### 負荷の主因

1. ディスプレイごとのrenderer
   - 2画面ではoverlay rendererが2つ立ちます。
   - ディスプレイが増えるとrendererとCanvas描画も増えます。
2. Canvas描画
   - マウス移動、通知、操作モード、motion highlight中は約30fpsで描画します。
   - アイドル時は約10fpsへ落とします。
3. Motion highlight
   - 各ディスプレイのscreen captureを128x72pxへ縮小し、約320ms間隔で差分を見ます。
   - capture入力は最大5fpsです。
   - 動画、スクロール、広告、ローディングなど動きが多い画面では処理が増えやすいです。
4. Electron/Chromium基盤
   - main、gpu、utility、rendererという複数プロセス構成になります。

### 常時起動の判断

Phase 1後は、デスクトップPCや電源接続中のノートPCなら常時起動しやすくなりました。ただし、バッテリー運用、低電力CPU、メモリに余裕がない環境では、Motion highlightをOFFにするか、Overlay disabledを活用するのが安全です。

おすすめ:

- 電源接続中: Motion highlight ONでも実用寄り。
- バッテリー運用: Motion highlight OFF推奨。
- 2画面以上: CPUとメモリを見ながら使う。
- 動画や重いWebページをよく開く: Motion highlight OFFまたは今後のしきい値調整が必要。
- タイマーだけ使いたい時: Overlay disabledにするとCPUはほぼゼロに近づく。

### 今後の軽量化候補

- CanvasのdevicePixelRatio上限を導入する。
- スポットライトをCSS/DOM transform中心に寄せ、Canvasを水面とmotion用に縮小する。
- Motion captureをmain processに集約し、rendererへ座標だけ配る方式を検証する。
- バッテリー駆動時にMotion highlightを自動OFFにする。
- Motion highlightのサンプリング間隔を設定化する。
- 長時間常駐テストでCPU、Private Memory、Working Setの推移を記録する。
