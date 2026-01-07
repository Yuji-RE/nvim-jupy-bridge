[![Status](https://img.shields.io/badge/Status-InProgress-success.svg)]()

# nvim jupy bridge

### 【NeovimとVSCodeを連携し、シームレスなデータサイエンス開発フローを実現】

nvim jupy bridgeは、「Neovimでの快適な編集体験・CLI相性」と「VSCodeのリッチな機能や出力表示」のどちらも妥協できない人のためのJupyter環境を提供する。

#### 主な特徴

- **最小限の依存関係**で
- **両エディタのネイティブ性能**を活かしつつ
- **シームレスに連携**できる

従来のNeovim-Jupyter連携の課題を解消し、機能性と利便性を追求した。

---

### シームレスな連携

nvim jupy bridgeは、NeovimとVSCode間でJupyterノートブックのコードセルをリアルタイムに同期する。Neovimでコードを編集し保存すると、VSCode側で素早く反映され、実行・出力が確認できる。編集されたセルへの視点ジャンプ・フォーカス移動も自動化されており、スムーズな開発フローを実現する。

【視点ジャンプ位置「上寄せ」の例】

![Demo](docs/nvim_jupy_bridge_demo.gif)

<br>

視点ジャンプ位置は、[extension.js](./extension.js) にて、
```javascript
nbEditor.revealRange(range, vscode.NotebookEditorRevealType.AtTop);   // ← この部分
```

`AtTop`（上寄せ）  
`InCenter`（中央）  
`AtBottom`（下寄せ）  

のいずれかに変更可能である。

<br>

また、デバッグ用の出力`NvimJupy Debug`で「保存→実行完了」に要した具体的な時間を確認することもできる。

![Debug Output](docs/debug_output.png)

`NvimJupy Debug`の出力は各プロセスにかかった時間も詳細に表示されるため、遅延のボトルネック特定にも役立つ。
例えば、実演映像での３回の実行は、それぞれ約1.8秒弱を要したが、その所要時間の内訳として、

- `jupy_ms` 側の処理に約1200ミリ秒
- `defer_ms` 側の処理に約100ミリ秒
- `TOTAL` 側で処理に約300~500ミリ秒（入力セルの重さ依存）

となっており、`jupy_ms` 側の処理が最も時間を要しており（全体の約7割）、遅延のボトルネックであることが分かる。

詳しくは、[NvimJupy Debugの見方](docs/NvimJupy_Debug_guide.md)
## 動作原理

この拡張機能のプログラムのざっくりとした流れは以下の通りである。

1. Neovim で `# %%` 付きの `.py` ファイルを保存すると、Lua が Jupytext の同期コマンドを実行する
2. 保存されたファイルのメタ情報を、プロジェクト直下の `.vscode/nvim-sync.json` に書き出す
3. nvim-jupy-bridge 拡張が `nvim-sync.json` を監視し、書き出されたメタ情報を受け取る
4. 拡張側が `.py` 内の `# %%` を上から数え、「カーソルが属する `# %%` ブロックが何番目か」をセル index として`.ipynb`側のセルにジャンプする。
5. Notebook API 経由で Jupyter カーネルが該当セルを実行する

## 主要コマンド


| コマンド（Neovim側） | アクション（VSCode側） |
| --- | --- |
| `:w` | 保存 + 現セルを実行 |
| `<leader>ra` | セルを全て実行 |
| `<leader>rb` | 現セルより下を全て実行 |


## メリット・デメリット

#### 【メリット】
- **VS Code の Jupyter 機能やその他のリッチな機能をそのまま使える**
- Neovimでの編集は常にプレーンな `.py` なので Gitの差分レビューがしやすい
- Neovim・VS Codeが双方向に同期されるため、どちらのワークスペースからも柔軟に操作可
- ワークスペースが完全に分かれているため、バグやトラブル時に原因を特定しやすい
- CLI ツール・環境との相性が良い
- 視点ジャンプと実行が自動化されるため、操作がシンプルで高速


#### 【デメリット】
- 現時点で同期できるのはjupytext経由での *.py もしくは *.ipynb ファイルのみ
- Neovim 単体ですべてを完結させたい場合には向かない
- WSL / CLI / Jupytext / VS Code など、ツールチェーン前提
- `jupy_ms`が遅延のボトルネックとなっている


このあたりをどう評価するかは、普段の開発スタイルや職場の方針によると思われる。  
個人的に現状のトレードオフに不満はないが、将来的な開発をより快適にするために遅延短縮を検討中である。  
現時点での遅延時間の改善案としては、[NvimJupy Debugの見方](docs/NvimJupy_Debug_guide.md) にて言及している。

## ディレクトリ構成

```text
nvim-jupy-bridge/
├── README.md
├── LICENSE
├── CHANGELOG.md
├── docs/
│   ├── nvim-jupy-bridge_demo.gif         # Demo (shown in README)
│   ├── nvim-jupy-debug-system.md         # Debug log spec / how to read logs
│   └── screenshots/                      # (optional) images for docs
│
├── extension/                            # VS Code extension source
│   ├── extension.js                      # main entry (activate, commands)
│   ├── package.json                      # manifest (commands / contributes)
│   ├── package-lock.json                 # lockfile (commit recommended)
│   └── test/
│       └── extension.test.js             # (optional)
│
├── nvim/                                 # luaスクリプトのモジュール化は現時点で未実装
│   └── nvim-jupy-bridge.lua              # copy-pasteable Lua (writes nvim-sync.json)
│
├── scripts/                              # (optional) helper scripts for dev/release
│   ├── build-vsix.sh                     # package .vsix (vsce)
│   └── dev-watch.sh                      # (optional) quick dev workflow helpers
│
├── dist/                                 # (optional) prebuilt artifacts
│   └── nvim-jupy-bridge-0.x.y.vsix        # ONLY if you decide to ship binaries
│
└── .gitignore
```

## 動作環境と最小セットアップ手順

※ 個人利用を想定した拡張機能であるため、
Marketplaceでの公開やluaスクリプトのモジュール化は現時点で未実装である点はご了承いただきたい。

### 動作確認済み環境

- OS: Windows 10 + WSL2 Ubuntu 22.04
- Editor: Neovim
- Editor + Viewer: VS Code（Jupyter 拡張導入済）
- CLI: Jupytext
- Extension: `nvim jupy bridge`
- Neovim: Lua 設定

### セットアップ

1. VS Code 側で本拡張機能をインストール・有効化する  
   - [vsix.zip](./dist/nvim-jupy-bridge-0.0.9.vsix) をダウンロードし、VS Code のコマンドパレットから `Extensions: Install from VSIX...` を実行してインストールする

2. Neovim 側で `nvim-jupy-bridge.lua` を読み込む
    - Neovim 側で `nvim-jupy-bridge.lua` を読み込む（init.lua等で `dofile("path/to/nvim-jupy-bridge.lua")` を読み込む）

![NOTE]
>環境によっては、.pyと.ipynbの同期は成功しても、NotebookのUIが反映されない場合がある。
>その場合は、VSCodeのユーザー設定で以下のオプションを有効化すると問題が解消される場合がある。

```json
  "jupytext.syncOnSave": true,             // 保存時に同期
  "jupytext.watchFiles": true,            // 外部変更を監視してノートブックに反映
  "jupyter.alwaysTrustNotebooks": true,  // 毎回の安全確認を省く（任意）
  "files.autoSave": "afterDelay",       // watchFilesと組み合わせて、UI更新を促進
  "files.autoSaveDelay": 2000,         // 遅延時間は環境に応じて調整
```

NotebookのUIが反映されないのは、Notebook UI の in memory が外部変更よりも優先されるためだと疑われる。
実際に、そのような状況でVSCodeで`revert`コマンドを実行すると、UIが反映されることが確認できる。
上記のユーザー設定は、毎回の`revert`による手動操作を省くための対策である。

---

### 免責事項

本拡張機能は、筆者が初学者なりに要件定義・挙動の検証・デバッグを行い、実装面(コーディング等)ではAIツールのアシストを大きく活用して開発したものである。再利用をご検討の場合は、本拡張が個人での利用を想定して作成した実験段階のものであり、他環境での動作再現性および安全性は未検証である旨にご留意いただきたい。

また、少しでもこのプロジェクトの透明性を高めるため、開発過程の試行錯誤をドキュメントを[DEV_NOTES.md](./docs/DEV_NOTES.md)にまとめている。
Zennでは記事としても、より個人的な視点からの開発背景をまとめているため、興味があれば参照いただきたい。



