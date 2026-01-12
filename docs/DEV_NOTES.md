# nvim-jupy-bridge 開発メモ（作成プロセス / 技術的背景）

このドキュメントは README とは別に、nvim-jupy-bridge が **どういう課題から始まり、どの仮説検証を経て、どんな設計判断で今の形になったか**を残すためのメモである。

## 0. 理想ワークフローの発想

実現したかったのは「Neovim ↔ Jupyter」そのものの統合ではなく、

- **Neovim**：純粋な Python コードの編集、テキスト編集、ファイル操作（高速・キーボード中心）
- **VS Code（Jupyter拡張）**：Notebook UI 上でのリッチ出力確認（グラフ、表、画像など）

という**役割分担**だった。

ポイントは「Jupyter と同期」ではなく**「Jupyter 拡張を使っている VS Code の Notebook UI と同期できるか？」**という視点だ。

なぜ既存のJupyter環境では私のニーズとユースケースにマッチしなかったのかは、こちらの[Zenn記事](link)にて言及している。


## 1. 最初の案：外部マクロ（jupytext CLI）での同期

NeovimでJupyter環境の構築を模索し始めた当初、Neovim プラグインである [jupynium.nvim](https://github.com/kiyoon/jupynium.nvim) から着想を得て、[jupytext](https://github.com/mwouts/jupytext) を使って Neovim と VS Code 間でリアルタイムなファイル同期を試みた。

しかし、`jupytext --sync` を外部 CLI で叩くだけでは、Neovim で編集した `.py` の内容が VS Code 側の `.ipynb` **Notebook UI に反映されない** 問題が発生した。

### 観測できたこと

- `.py` ファイル自体は VS Code 側でも更新されていた
- 一方で Notebook UI は更新されず、表示が “凍る”
- ただし VS Code の **Revert** を実行すると UI は反映される

→ ボトルネックは `.py` と `.ipynb` の同期ではなく、**VS Code Notebook Editor の in-memory 状態とディスクのズレ** が原因という疑惑が生まれた。
具体的には、

> 外部から `.ipynb` を上書きし続けると、VS Code Notebook Editor は  
> 「開いているノートの in-memory 状態」と「ディスク上のファイル」がズレる。  
> その結果、安全のため UI 更新が抑制されている可能性がある。

という仮説だった。

### マクロ案（Gemini 提案）

このフィードバックをGeminiに投げたところ、

- Neovim 保存時に `jupytext --sync`（同期コマンド）を叩き
- タイミングで `/tmp/vscode_revert_trigger.txt` を更新
- VS Code 側は File Watcher 拡張で `.txt` の変更を検知し
- command-runner 拡張の経由で `workbench.action.files.revert` を叩く

というマクロ作成の案を提示された。
実際に実装して挙動を検証したが、

- 外部 CLI → 別拡張 → 内部コマンド、という多段リレーで不安定
- Revert は環境次第で副作用（状態リセット等）が起きやい上に、頻繁に使うにはアクションが重いため根本的解決にならない
- Remote WSL 環境だと「拡張がローカルで動くか / リモートで動くか」の制御も絡み、実運用のハードルが高い

…ということが判明し、採用しなかった。

## 2. マクロの課題を解決するための自作拡張

上記の検証結果を整理して GPT 5.0 側にフィードバックを引き継いだ。

そこで

- Remote WSL で VSCode を運用している場合、

    - VS Code の拡張がどちら側（Local / Remote extension host）で動いているか
    - ファイル監視がどのファイルシステムを見ているか

が挙動に影響するため、外部イベントとマクロの連携は不安定要因になり得るということが判明した。

対策として、外部から同期イベントを起こして `.ipynb` を更新させるのではなく、
VS Code 内部で整合性を保てるルート（Jupytext拡張の in-memory 反映）を前提にした同期フローに切り替えた。
これにより、**UI 更新とカーネル維持の両立** が現実的になった。

つまり、外部の同期コマンドを **VS Code 内部の Notebook 実行経路に寄せる** ことをミッションに開発されたのが
現行の `nvim-jupy-bridge` のプロトタイプ（v0.01）であり、当初は単に `.py` と `.ipynb` を任意のタイミングで同期させる機能に過ぎなかった。

## 3. nvim-jupy-bridge の進化（v0.01 → v0.09）

### v0.01（プロトタイプ）

- Neovim で編集する `.py` と、VS Code で開いている `.ipynb` を前提にワークフローを成立させる
- 実行は VS Code 側で “アクティブセル” を走らせる設計（フォーカス依存）

### v0.09（現行版）

v0.01 に加えて、以下を実現：

- Neovim 側で `:w` すると同時に、VS Code 側で **対象セルへジャンプ → 実行**（自動）
- Neovim からコマンド; **Run All Cells / Run Cells Below** が叩ける
- VS Code 側からの編集内容も反映可能 （双方向運用によるワークフローの柔軟性の向上）
- `NvimJupy Debug` のログ出力で、保存→検知→ジャンプ→実行の各プロセス所要時間を可視化可能
- 遅延時間を削減（固定遅延時間を短縮しても安定動作するよう改善）


### 内部仕様

#### トリガー方式

VS Code 拡張は、ワークスペース内の以下を監視する：

- `**/.vscode/nvim-sync.json`

変更イベントを受け取ると、指定された `.py` の行番号からセル位置を推定し、
Notebook 側でセル選択・スクロール・実行を行う。

#### セル位置推定（percent format）

`.py` 内の `# %%` をセル境界として扱い、カーソル行が属するセル index を推定する。

#### 実行コマンド

可能なら VS Code 組み込みの notebook コマンドで実行し、
失敗時のみ `jupyter.*` へフォールバックする。
- `action=runAll` → ノート全体を実行
- `action=runBelow` → 指定セルから下をまとめて実行

#### 設定（Settings）

- `nvimJupy.delayMs`（default: 80）  
  Notebook 側の更新イベントを待つ固定 delay（不安定なら増やす）
- `nvimJupy.openIfClosed`（default: true）  
  対応する `.ipynb` が閉じていれば自動で開く

#### 付属コマンド

- `NvimJupy: Run All Now`（`nvimJupy.runAllNow`）
- `NvimJupy: Run From Last Edited Cell (Current + Below)`（`nvimJupy.runBelowNow`）

#### デバッグログ

`NvimJupy Debug` OutputChannel に以下を時系列で出力し、ボトルネック追跡を可能にしている。
