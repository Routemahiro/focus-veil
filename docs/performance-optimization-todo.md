# Performance Optimization TODO

## 定義

このTODOは、Focus Veilの現在の挙動をできるだけ保ったまま、常時起動時のCPU/メモリ負荷を下げるための実装計画です。

現在の実測では、2ディスプレイ、Motion highlight有効、16論理CPU環境で、CPUが全論理CPU比約3.6-3.7%、1コア換算約57-60%、Private Memory約450MBでした。常時起動ツールとしては重いため、機能追加より先に軽量化を優先します。

## 要点

- まずMotion highlightの寄与を分離測定する。
- 挙動をほぼ変えない低リスク改善を先に入れる。
- アイドル時に描画、screen capture、IPC wakeupを止める方向へ寄せる。
- Electronのメモリ固定費は残るため、短期目標はCPU削減を主軸にする。
- DOM/CSS transform化やmain process capture集約は、Phase 1後の測定結果を見て判断する。

## 比較

| Phase | 目的 | 期待効果 | リスク |
| --- | --- | --- | --- |
| Phase 0 | 現状負荷を分解測定する | どこが重いかを確定する | 低 |
| Phase 1 | 挙動維持のまま軽量化する | CPUを大きく下げる | 低-中 |
| Phase 2 | 描画/キャプチャ構造を見直す | さらにCPU/メモリを下げる | 中 |
| Phase 3 | Electron外のネイティブ移植を検討する | メモリ床を大幅に下げられる可能性 | 高 |

## 具体例

### Phase 0: 測定分解

- [ ] 現在の起動状態でbaselineを再測定する。
  - [ ] Motion highlight ON
  - [ ] Motion highlight OFF
  - [ ] Overlay enabled OFF
  - [ ] 操作モードON/OFF
- [ ] 測定結果を `docs/performance-notes.md` に追記する。
- [ ] プロセス別にCPU、Working Set、Private Memoryを見る。
- [ ] main / gpu / utility / renderer のどれが主にCPUを使うか推定する。
- [ ] 測定スクリプトまたはPowerShell手順を `artifacts` ではなくdocsに残すか判断する。

完了条件:

- Motion highlightの有無でCPUがどれだけ変わるか分かっている。
- Overlay disabled時に不要な負荷が残っているか分かっている。
- 改善後の比較に使えるbaselineがある。

### Phase 1: 低リスク軽量化

#### 1. Timer IPC tickを1秒化

- [ ] `src/main.js` の `broadcastTimerState('tick')` 間隔を250msから1000msへ変更する。
- [ ] 表示が秒単位で破綻しないことを確認する。
- [ ] notification到達タイミングに目立つ遅延が出ないことを確認する。

狙い:

- IPC wakeupを約1/4に減らす。
- 体感差はほぼない想定。

#### 2. Overlay disabled時の完全休止

- [ ] `veilEnabled: false` のとき、Canvas描画だけでなくMotion capture samplingも止める。
- [ ] Overlay enabledをONへ戻したときにcaptureと描画が復帰する。
- [ ] smokeでOverlay enabled OFF/ONを確認できるようにする。

狙い:

- 「タイマーだけ使いたい」時に負荷を明確に下げる。

#### 3. Motion highlight captureの低fps/低解像度化

- [ ] `getUserMedia` の `maxWidth/maxHeight` を `640x360` から `320x180` へ下げる。
- [ ] `maxFrameRate` を10から5へ下げる。
- [ ] `sampleMotionFocus` の最短間隔を160msから250-330msへ広げる。
- [ ] 画面静止時はさらに低頻度へ落とす。
- [ ] Motion highlightの体感が破綻しないか、疑似motion smokeと手動確認で見る。

狙い:

- screen captureパイプラインのCPU/GPU負荷を下げる。
- 8x6セル検出の粒度なら大きな体感劣化は出にくい想定。

#### 4. アイドル時のCanvas再描画停止

- [ ] マウス静止、通知なし、motion highlightなし、波紋なしの場合は再描画をスキップする。
- [ ] アイドル時は水面driftを停止または8-10fps以下に落とす。
- [ ] マウス移動、通知、motion highlight発生時は即座に通常描画へ戻す。
- [ ] 通知演出中は現行の滑らかさを維持する。

狙い:

- 常時起動時のCPU負荷を最も大きく下げる。
- 静止時に水面が止まる可能性はあるが、視覚的主張が低いため許容範囲と見る。

#### 5. Canvas DPR上限

- [ ] Canvas backing storeのDPRを `Math.min(devicePixelRatio, 1)` または設定値で上限化する。
- [ ] ぼかしやスポットライトの見た目が粗くならないか確認する。
- [ ] 必要なら `renderScale` として内部設定化する。

狙い:

- 高DPI/高解像度環境のフィルレートとメモリを削る。
- 柔らかいグラデーション中心なので体感劣化は小さい想定。

#### 6. Overlay presence維持処理の条件化

- [ ] `maintainOverlayPresence` の無条件 `setAlwaysOnTop` / `showInactive` を減らす。
- [ ] `isVisible()` や破棄状態を見て、必要なときだけ復帰処理する。
- [ ] 呼び出し間隔を2.5秒から10秒程度へ広げる。
- [ ] Windows仮想デスクトップ復帰の手動経路 `Ctrl+Shift+R` は維持する。

狙い:

- OS window操作の無駄打ちを減らす。

### Phase 1完了後の再測定

- [ ] Motion highlight ONで再測定する。
- [ ] Motion highlight OFFで再測定する。
- [ ] Overlay disabledで再測定する。
- [ ] 2ディスプレイでREADY 2件、stderr空を確認する。
- [ ] `docs/performance-notes.md` にBefore/Afterを追記する。

目標:

- Motion highlight ONでも全論理CPU比を1-2%台へ下げる。
- Motion highlight OFFまたはアイドル時は1%未満を狙う。
- Private Memoryは大幅減を必須目標にしない。ただし明らかな増加は避ける。

### Phase 2: 構造改善候補

Phase 1後も重い場合に検討します。最初から実装しません。

#### 1. スポットライト描画のDOM/CSS transform化

- [ ] 暗幕とスポットライトをCanvasではなくCSS radial-gradient/mask/DOM layerで表現できるか試作する。
- [ ] マウス移動は `transform: translate()` 中心にし、再ラスタライズを避ける。
- [ ] 水面と波紋だけを低fps Canvasに残す。

判断基準:

- CPUが明確に下がる。
- クリック透過、透明overlay、複数ディスプレイ、通知演出が壊れない。
- 見た目が現行と同等以上。

#### 2. Motion検出のmain process集約

- [ ] rendererごとの `getUserMedia` streamをやめ、main側で低頻度thumbnail取得できるか調べる。
- [ ] 座標だけIPCでrendererへ渡す案を試作する。
- [ ] `desktopCapturer.getSources` の呼び出しコストを測定する。

判断基準:

- rendererごとのcapture streamよりCPU/メモリが下がる。
- 検出遅延が許容範囲。
- protected contentやcontent protectionとの相性が悪化しない。

#### 3. 電源状態連動

- [ ] `powerMonitor` でバッテリー運用時にMotion highlightを自動OFFまたは低頻度化する。
- [ ] 長時間idle時は描画とcaptureをさらに落とす。

判断基準:

- ユーザーの意図を勝手に壊さず、常駐アプリとしての行儀が良くなる。

### Phase 3: ネイティブ化判断

Electronの固定費により、Private Memoryを50MB級まで下げるのは現実的ではありません。そこまで求める場合だけ、Win32 layered window、Direct2D、DirectCompositionなどのネイティブ実装を検討します。

現時点ではPhase 3は実装対象外です。

## 実装時に避けること

- マウス移動中の追従fpsを落としすぎない。
- 通知演出の1.6秒パルスをカクつかせない。
- `setIgnoreMouseEvents(true, { forward: true })` を壊さない。
- `setContentProtection(true)` を外さない。
- 過去に問題が出た単一巨大overlay windowへ戻さない。
- Motion highlightを軽くするために、メインスポットが動きへ引っ張られる設計へ戻さない。

## Goal Prompt案

```text
C:\Users\aaa_a\OneDrive\ドキュメント\FocusVeil の常時起動負荷を下げたい。

目的:
Focus Veilの現在の見た目と挙動をできるだけ保ったまま、常時起動時のCPU負荷を下げる。特に2ディスプレイ + Motion highlight有効時に1コア換算で約57-60%使っている状態を改善する。メモリはElectronの固定費があるため大幅削減を必須にしないが、増加は避ける。

前提:
- 相談結果と実装TODOは docs/performance-optimization-todo.md にある。
- 現状負荷の実測は docs/performance-notes.md にある。
- 既存挙動、操作、設計制約は README.md と docs/design-notes.md を参照する。
- クリック透過、Ctrl+Shift+F操作モード、トレイ、設定保存、複数ディスプレイ、Motion highlight、静かな通知演出は壊さない。

進め方:
1. Phase 0として、Motion highlight ON/OFF、Overlay enabled OFFの負荷を再測定してbaselineを取る。
2. Phase 1の低リスク改善を実装する。
   - timer IPC tickを250msから1000msへ変更
   - Overlay disabled時に描画とMotion captureを休止
   - Motion highlight captureを低解像度/低fps化
   - アイドル時のCanvas再描画を停止または低頻度化
   - Canvas DPR上限を入れる
   - maintainOverlayPresenceを条件付き、低頻度にする
3. 実装後に node --check、npm run smoke、通常起動確認を実行する。
4. Before/Afterの負荷を測定し、docs/performance-notes.md と docs/verification-log.md に追記する。

完了条件:
- 既存の基本挙動が維持されている。
- smokeが成功している。
- 2ディスプレイ起動でREADYが2件出る。
- 改善後のCPU/メモリ測定が記録されている。
- Motion highlight ON/OFF、Overlay disabledの負荷差が説明できる。
- Phase 2が必要かどうか判断できる。
```
