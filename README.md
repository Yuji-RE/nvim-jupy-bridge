# Neovim - VS Code Notebook Sync Runner

Neovim で保存した行位置に VS Code の Jupyter ノートブックをジャンプして実行する拡張。  
.py（percent 形式: `# %%`）と対応する .ipynb を同期し、該当セルを選択して「現在セル＋下」を実行します。

## 機能
- .vscode/nvim-sync.json を監視し、対象ノートブックを自動で開く/フォーカス
- 保存行に対応するセルへスクロール＆選択
- 実行モード:
  - Run From Last Edited Cell (Current + Below)
  - Run All（手動コマンド）
- 設定:
  - nvimJupy.delayMs … Jupytext/UI 反映待ちの遅延（既定: 300-500ms）
  - nvimJupy.openIfClosed … ノートブックが閉じていたら自動で開く

## 必要要件
- VS Code 拡張: Jupyter / Jupyter Renderers / Jupytext
- Python カーネル（仮想環境推奨: venv/Poetry）に必要パッケージ（例: `jupytext`, `ipykernel`）
- .py は percent 形式（`# %%`）でセル区切り
- WSL環境でのNeovimとvscodeの使用を想定

## 使い方
1. VS Code 側で対象の .ipynb を開き、カーネルを選択
2. Neovim 側の保存フックが .vscode/nvim-sync.json を書き出す
3. 本拡張がノートを開き、該当セルへジャンプして実行

コマンド:
- NvimJupy: Run All Now (`nvimJupy.runAllNow`)
- NvimJupy: Run From Last Edited Cell (Current + Below) (`nvimJupy.runBelowNow`) // 環境により'該当セル"のみ"'実行される

## 設定例（.vscode/settings.json）
```json
{
  "workbench.editorAssociations": [
    { "viewType": "jupyter-notebook", "filenamePattern": "*.ipynb" }
  ],
  "jupyter.notebookFileRoot": "${fileDirname}",
  "nvimJupy.delayMs": 200,
  "nvimJupy.openIfClosed": true,
  "jupytext.syncOnSave": true,
  "jupytext.watchFiles": true
}