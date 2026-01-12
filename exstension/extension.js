// extension.js
const vscode = require('vscode');
const fs = require('fs').promises;

const sleep = ms => new Promise(res => setTimeout(res, ms));

// 計測ログ出力用の OutputChannel
let debugChannel;
function log(msg) {
  if (!debugChannel) {
    debugChannel = vscode.window.createOutputChannel('NvimJupy Debug');
  }
  const ts = new Date().toISOString();
  debugChannel.appendLine(`[${ts}] ${msg}`);
}

// 直近イベント情報（重複ガード用）
let lastSyncPath = null;
let lastSyncTime = 0;
let lastTarget = null; // { ipynbUri, idx }
const DUP_WINDOW_MS = 200; // この時間内に同じファイルならダブりとみなす

async function readJsonSafe(uri) {
  try {
    const buf = await fs.readFile(uri.fsPath);
    return JSON.parse(buf.toString('utf8'));
  } catch (e) {
    console.error('readJsonSafe error', e);
    log(`readJsonSafe error: ${e}`);
    return null;
  }
}

function cellIndexFromPy(pyText, line1) {
  // percent 形式の # %% でセル境界を推定
  const lines = pyText.split(/\r?\n/);
  const markers = [];

  for (let i = 0; i < lines.length; i++) {
    if (/^\s*#\s*%%/.test(lines[i])) {
      // 0-based index
      markers.push(i);
    }
  }

  const target0 = Math.max(0, (line1 || 1) - 1);

  if (markers.length === 0) return 0;

  let idx = 0;
  for (let i = 0; i < markers.length; i++) {
    if (markers[i] <= target0) {
      idx = i;
    } else {
      break;
    }
  }

  return idx;
}

async function openNotebook(ipynbUri, openIfClosed) {
  const opened = vscode.workspace.notebookDocuments.find(
    d => d.uri.fsPath === ipynbUri.fsPath,
  );
  if (opened) return opened;

  if (!openIfClosed) return null;

  try {
    return await vscode.workspace.openNotebookDocument(ipynbUri);
  } catch (e) {
    vscode.window.showWarningMessage(
      `Notebook を開けませんでした: ${ipynbUri.fsPath}`,
    );
    log(`openNotebook error: ${e}`);
    return null;
  }
}

async function showNotebookEditor(nbDoc) {
  const existing = vscode.window.visibleNotebookEditors.find(
    e => e.notebook === nbDoc,
  );
  if (existing) return existing;

  return await vscode.window.showNotebookDocument(nbDoc, {
    preview: false,
    preserveFocus: true,
  });
}

async function selectAndRevealCell(nbEditor, index) {
  const idx = Math.max(0, Math.min(index, nbEditor.notebook.cellCount - 1));
  const range = new vscode.NotebookRange(idx, idx + 1);

  nbEditor.selections = [range];

  const t0 = Date.now();
  await sleep(30);
  nbEditor.revealRange(range, vscode.NotebookEditorRevealType.AtTop);
  log(`selectAndRevealCell: ${Date.now() - t0}ms (cellIndex=${idx})`);
}

// Jupyter 実行
async function runAction(action, nbDoc, startIndex) {
  const t0 = Date.now();

  try {
    if (action === 'runAll') {
      await vscode.commands.executeCommand('notebook.execute', nbDoc.uri);
      log(`runAction(notebook.execute): ${Date.now() - t0}ms`);
      return;
    }

    if (action === 'runCell') {
      await vscode.commands.executeCommand(
        'notebook.cell.execute',
        { start: startIndex, end: startIndex + 1 },
        nbDoc.uri,
      );
      log(`runAction(runCell): ${Date.now() - t0}ms`);
      return;
    }

    // runBelow
    await vscode.commands.executeCommand(
      'notebook.cell.execute',
      { start: startIndex, end: nbDoc.cellCount },
      nbDoc.uri,
    );
    log(`runAction(runBelow): ${Date.now() - t0}ms`);
    return;

  } catch (e) {
    log(`runAction: notebook.* failed -> fallback. error=${e}`);
  }

  // fallback（フォーカス必要）
  if (action === 'runAll') {
    await vscode.commands.executeCommand('jupyter.runAllCells');
    return;
  }
  if (action === 'runCell') {
    await vscode.commands.executeCommand('jupyter.runCurrentCell');
    return;
  }
  await vscode.commands.executeCommand('jupyter.runCurrentCell');
  try {
    await vscode.commands.executeCommand('jupyter.runCellAndAllBelow');
  } catch {
    await vscode.commands.executeCommand('jupyter.runBelow');
  }
}

async function processSyncJson(uri) {
  const fsPath = uri.fsPath;
  const now = Date.now();

  // ① ここで重複イベントログも出す
  if (fsPath === lastSyncPath && now - lastSyncTime < DUP_WINDOW_MS) {
  log(`dup-guard: ignored (${now - lastSyncTime}ms) ${fsPath}`);
  return;
}

  lastSyncPath = fsPath;
  lastSyncTime = now;

  // ② ここから先が「1 回の実行」としてログされる範囲
  const tStart = now;
  log('---------------- nvim-jupy-bridge run ----------------');
  log(`nvim-sync.json event: ${fsPath}`);

  const cfg = vscode.workspace.getConfiguration('nvimJupy');
  const delayMs = cfg.get('delayMs', 80);
  const openIfClosed = cfg.get('openIfClosed', true);

  const j = await readJsonSafe(uri);
  if (!j || !j.file) {
    log('processSyncJson: invalid json or no file field');
    return;
  }

  const pyPath = j.file;
  const line = Number(j.line) || 1;
  const rawAction = String(j.action || '');
  const action =
  rawAction === 'runAll' ? 'runAll' :
  rawAction === 'runBelow' ? 'runBelow' :
  'runCell'; // デフォルトは1セル

  // Lua 側で jupy_ms / defer_ms を入れている場合だけ使う（なければ 0）
  const jupyMs = Number(j.jupy_ms) || 0;
  const deferMs = Number(j.defer_ms) || 0;

  log(`config: delayMs=${delayMs}ms, openIfClosed=${openIfClosed}`);
  log(
    `payload: file=${pyPath}, line=${line}, action=${action}, jupy_ms=${jupyMs}ms, defer_ms=${deferMs}ms`,
  );

  const ipynbPath = pyPath.replace(/\.py$/i, '.ipynb');
  const ipynbUri = vscode.Uri.file(ipynbPath);

  // ノートブックを開く/取得
  const tOpen = Date.now();
  const nbDoc = await openNotebook(ipynbUri, openIfClosed);
  if (!nbDoc) {
    log('processSyncJson: openNotebook returned null');
    return;
  }
  log(`openNotebook: ${Date.now() - tOpen}ms`);

  const tEditor = Date.now();
  const nbEditor = await showNotebookEditor(nbDoc);
  log(`showNotebookEditor: ${Date.now() - tEditor}ms`);

  // .py を読んでセル位置を推定
  const tRead = Date.now();
  let pyText = '';
  try {
    pyText = (await fs.readFile(pyPath)).toString('utf8');
  } catch (e) {
    vscode.window.showWarningMessage(
      `.py を読めませんでした: ${pyPath}`,
    );
    log(`read .py failed: ${e}`);
    return;
  }

  const idx = cellIndexFromPy(pyText, line);
  lastTarget = { ipynbUri, idx };
  log(
    `read .py & cellIndexFromPy: ${Date.now() - tRead}ms (cellIndex=${idx})`,
  );

  // Jupytext の in-memory 反映を待つ → セル選択＆スクロール → 実行
  const tDelay = Date.now();
  await sleep(delayMs);
  log(`pre-run sleep(delayMs): ${Date.now() - tDelay}ms`);

  await selectAndRevealCell(nbEditor, idx);

  const tRunBlock = Date.now();
  await sleep(50);
  await runAction(action, nbDoc, idx);
  log(`runAction block (sleep+runAction): ${Date.now() - tRunBlock}ms`);

  const total = Date.now() - tStart;
  log(`TOTAL from json event to runAction end: ${total}ms`);

  // Neovim 保存起点の近似（Lua から jupy_ms / defer_ms が渡ってきている場合）
  const approxFull = jupyMs + deferMs + total;
  log(
    `Approx SAVE -> runAction end ≈ ${approxFull}ms (jupy_ms ${jupyMs} + defer_ms ${deferMs} + TOTAL ${total})`,
  );
}

function activate(context) {
  // .vscode/nvim-sync.json を監視
  const watcher = vscode.workspace.createFileSystemWatcher(
    '**/.vscode/nvim-sync.json',
  );

  // 作成イベントは無視（change だけで十分）
  watcher.onDidCreate(
    uri => {
      // 必要ならここで log 出してもいいけど、静かでいいはず
      // log(`onDidCreate: ${uri.fsPath} (ignored; waiting for change)`);
    },
    null,
    context.subscriptions,
  );

  // 実際のトリガーは「変更」のみ
  watcher.onDidChange(
  uri => {
    processSyncJson(uri).catch(e => log(`processSyncJson crashed: ${e}`));
  },
  null,
  context.subscriptions,
);


  context.subscriptions.push(watcher);

  // 手動コマンド（保険）
   // 手動コマンド（保険）
  context.subscriptions.push(
    vscode.commands.registerCommand('nvimJupy.runAllNow', async () => {
      await vscode.commands.executeCommand('jupyter.runAllCells');
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('nvimJupy.runBelowNow', async () => {
      if (!lastTarget) {
        vscode.window.showWarningMessage(
          'まだ対象セルがありません（先に :w で同期してね）',
        );
        return;
      }

      const cfg = vscode.workspace.getConfiguration('nvimJupy');
      const openIfClosed = cfg.get('openIfClosed', true);

      const nbDoc = await openNotebook(lastTarget.ipynbUri, openIfClosed);
      if (!nbDoc) return;

      const nbEditor = await showNotebookEditor(nbDoc);
      await selectAndRevealCell(nbEditor, lastTarget.idx);

      await runAction('runBelow', nbDoc, lastTarget.idx);
    }),
  );

  log('nvim-jupy-bridge activated');
}

function deactivate() {
  if (debugChannel) {
    debugChannel.dispose();
  }
}

module.exports = {
  activate,
  deactivate,
};
