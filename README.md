[![Status](https://img.shields.io/badge/Status-InProgress-success.svg)]()

# 📖 nvim jupy bridge - NeovimとVSCodeを連携し、シームレスなデータサイエンス開発フローを実現

nvim jupy bridgeは、「Neovimでの快適な編集体験・CLI相性」と「VSCodeのリッチな機能や出力表示」のどちらも妥協できない人のためのJupyter環境を提供する。

#### 主な特徴

- **最小限の依存関係**で
- **両エディタのネイティブ性能**を活かしつつ
- **シームレスに連携**できる

従来のNeovim-Jupyter連携の課題を解消し、機能性と利便性を追求した。

---

### シームレスな連携

nvim jupy bridgeは、NeovimとVSCode間でJupyterノートブックのコードセルをリアルタイムに同期する。Neovimでコードを編集し保存すると、VSCode側で即座に反映され、実行・出力が確認できる。編集されたセルへのフォーカス移動も自動化されており、スムーズなワークフローを実現する。

【視点ジャンプ位置「上寄せ」の例】

![Demo](docs/nvim_jupy_bridge_demo.gif)

視点のジャンプ位置は、`extension.js` 内の
```javascript

```
にて、`AtTop` / `InCenter` / `AtBottom` のいずれかに変更可能である。

---

また、デバッグ用の出力`NvimJupy Debug`で「保存→実行完了」に要した具体的な時間を出力することもできる。

![Debug Output](docs/debug_output.png)

`NvimJupy Debug`の出力は各プロセスにかかった時間も詳細に表示されるため、遅延のボトルネック特定にも役立つ。
例えば、実演映像での３回の実行は、それぞれ約1.8秒弱を要した。この所要時間の内訳として、

- `jupy_ms` 側の処理に約1200ミリ秒
- `defer_ms` 側の処理に約100ミリ秒
- `TOTAL` 側で処理に約300~500ミリ秒（入力セルの重さ依存）

となっており、`jupy_ms` 側の処理が最も時間を要している（ボトルネックである）ことが分かる。

詳しくは、[NvimJupy Debugの見方](docs/NvimJupy_Debug_guide.md) を参照。


---

### ⚙️ 動作原理

この拡張機能のプログラムのざっくりとした流れは以下の通りである。

1. Neovim で `# %%` 付きの `.py` ファイルを保存すると、Lua が Jupytext の同期コマンドを実行する
2. 保存されたファイルのメタ情報を、プロジェクト直下の `.vscode/nvim-sync.json` に書き出す
3. VS Code 拡張が `nvim-sync.json` を監視し、書き出されたメタ情報を受け取る
4. 拡張側が `.py` 内の `# %%` を上から数え、「カーソルが属する `# %%` ブロックが何番目か」をセル index として`.ipynb`側のセルにジャンプする。
5. Notebook API 経由で Jupyter カーネルが該当セルを実行する




## メリット・デメリット

#### 【メリット】
- **VS Code の Jupyter 機能やその他のリッチな機能をそのまま使える**
- Neovimでの編集は常にプレーンな `.py` なので Git 差分・レビューがしやすい
- Neovim・VS Codeが双方向に同期されるため、どちらのワークスペースからも柔軟に操作可
- ワークスペースが完全に分かれているため、バグやトラブル時に原因を特定しやすい
- CLI ツール・環境との相性が良い
- 視点ジャンプと実行が自動化されるため、操作がシンプルで高速
- 視点のジャンプ位置を調整できる（上寄せ・中央・下寄せなど）



#### 【デメリット】
- 現時点で同期できるのはjupytext経由での *.py もしくは *.ipynb ファイルのみ
- VS Code が利用できない環境とは相性が悪い
- Neovim 単体ですべてを完結させたい場合には向かない
- WSL / CLI / Jupytext / VS Code など、ツールチェーン前提
- `jupy_ms`が遅延のボトルネックとなっている（詳細は[NvimJupy Debugの見方](docs/NvimJupy_Debug_guide.md)）


このあたりをどう評価するかは、普段の開発スタイルや職場の方針によると思われる。  
個人的に現状のトレードオフに不満はないが、将来的な開発をより快適にするために遅延短縮を検討中である。  
現時点での遅延時間の改善案としては、[NvimJupy Debugの見方](docs/NvimJupy_Debug_guide.md) にて言及している。

## 🛠 主要コマンド一覧 (Key Commands)

| コマンド（Neovim側） | アクション（VSCode側） |
| --- | --- |
| `:w` | 保存 + 実行 |
| `<leader>ra` | セルを全て実行 |
| `<leader>rb` | 現セルより下を全て実行 |


---

## 📂 ディレクトリ構成 (Repository Structure)

```text
├── data/
│   ├── raw/             # オリジナルデータ (※ gitには含めない / .gitignore対象)
│   └── processed/       # 前処理済みデータ
├── notebooks/
│   ├── 01_eda.ipynb           # 探索的データ分析
│   ├── 02_preprocessing.ipynb # 前処理・特徴量エンジニアリング
│   └── 03_modeling.ipynb      # モデリング・評価
├── src/
│   ├── __init__.py
│   ├── data_loader.py   # データ読み込み用スクリプト
│   └── visualization.py # グラフ描画関数
├── requirements.txt     # 依存ライブラリ
├── Dockerfile           # 環境構築用
└── README.md
```
---

## 🚀 再現手順 (How to Run)

### 1. リポジトリのクローン
```bas
git clone https://github.com/YourUsername/repo-name.git
cd repo-name
```

### 2. 環境構築
```bash
pip install -r requirements.txt
# または
docker-compose up -d
```

---

[!NOTE]
本拡張は筆者が初学者なりに要件定義・挙動の検証・デバッグを行い、実装面(コーディング等)ではAIツールのアシストを大きく活用して開発したものである。
個人での利用を想定して作成した実験段階のものであり、他環境での動作再現性および安全性は未検証である。
