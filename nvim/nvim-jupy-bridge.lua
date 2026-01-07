----------------------------------------------------------------------
-- nvim-jupy-bridge 用 Neovim 側設定
-- - .py 保存時に jupytext --sync の実行時間を計測（同期実行）
-- - 少し遅らせて nvim-sync.json を書き出し
-- - VS Code 側に jupy_ms / defer_ms を渡す
----------------------------------------------------------------------

-- 直近の jupytext --sync 実行時間(ms)
_G.nvimjupy_last_jupy_ms = _G.nvimjupy_last_jupy_ms or 0

-- Neovim 側で JSON を書き出すまでにかける遅延(ms)
local NVIMJUPY_DEFER_MS = 100

-- augroup（再読み込み時の増殖を防ぐ）
local aug = vim.api.nvim_create_augroup("nvim_jupy_bridge", { clear = true })

-- Git ルート（なければ CWD）※毎回 git 叩くのが嫌ならキャッシュしてもOK
local function project_root()
	local git = vim.fn.systemlist({ "git", "rev-parse", "--show-toplevel" })
	if vim.v.shell_error == 0 and git[1] and git[1] ~= "" then
		return git[1]
	end
	return vim.loop.cwd()
end

-- jupytext --sync を同期実行して ms を返す（失敗したら nil）
local function run_jupytext_sync(py_path)
	local t0 = vim.loop.hrtime() -- ns

	-- Neovim 0.10+ なら vim.system が使える（exit code を正確に取れる）
	if vim.system then
		local res = vim.system({ "jupytext", "--sync", py_path }, { text = true }):wait()
		local t1 = vim.loop.hrtime()
		if res.code ~= 0 then
			vim.notify(("jupytext --sync failed (code=%s): %s"):format(res.code, py_path), vim.log.levels.WARN)
			return nil
		end
		return math.floor((t1 - t0) / 1e6)
	end

	-- 旧版互換（exit code は vim.v.shell_error で見る）
	vim.fn.system({ "jupytext", "--sync", py_path })
	local t1 = vim.loop.hrtime()
	if vim.v.shell_error ~= 0 then
		vim.notify(("jupytext --sync failed: %s"):format(py_path), vim.log.levels.WARN)
		return nil
	end
	return math.floor((t1 - t0) / 1e6)
end

-- VS Code 拡張が監視する JSON を出力
local function write_sync_json(action)
	local root = project_root()
	local vscode_dir = root .. "/.vscode"
	if vim.fn.isdirectory(vscode_dir) == 0 then
		vim.fn.mkdir(vscode_dir, "p")
	end

	local pyfile = vim.fn.expand("%:p")
	local line = vim.fn.line(".")

	local payload = {
		file = pyfile,
		line = line,
		action = action or "runCell", -- 'runAll','runBelow' も可
		jupy_ms = _G.nvimjupy_last_jupy_ms or 0,
		defer_ms = NVIMJUPY_DEFER_MS,
	}

	local out = vscode_dir .. "/nvim-sync.json"
	vim.fn.writefile({ vim.fn.json_encode(payload) }, out)
end

-- 1) .py 保存後に jupytext --sync を同期実行して計測
vim.api.nvim_create_autocmd("BufWritePost", {
	group = aug,
	pattern = "*.py",
	callback = function()
		local bufpath = vim.fn.expand("%:p")

		local ms = run_jupytext_sync(bufpath)
		if ms then
			_G.nvimjupy_last_jupy_ms = ms
			-- jupytext による変更を Neovim 側にも反映（外部変更の再読込）
			vim.cmd("checktime")
		end
	end,
})

-- 2) .py 保存後に、少し遅らせて JSON を書き出す（VS Code 側トリガ）
vim.api.nvim_create_autocmd("BufWritePost", {
	group = aug,
	pattern = "*.py",
	callback = function()
		vim.defer_fn(function()
			write_sync_json("runCell")
		end, NVIMJUPY_DEFER_MS)
	end,
})

-- 3) 手動トリガ
vim.api.nvim_create_user_command("JupyRunAll", function()
	write_sync_json("runAll")
end, {})

vim.api.nvim_create_user_command("JupyRunBelow", function()
	write_sync_json("runBelow")
end, {})

vim.keymap.set("n", "<leader>ra", function()
	write_sync_json("runAll")
end, { desc = "Jupyter Run All via VSCode" })

vim.keymap.set("n", "<leader>rb", function()
	write_sync_json("runBelow")
end, { desc = "Jupyter Run Below via VSCode" })
