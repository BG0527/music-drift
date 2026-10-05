# =============================================================================
# music-drift → 腾讯云 CloudBase 云托管 一键重部署（Windows / 本仓库根目录执行）
#
#   psmgmt 用法：  powershell -NoProfile -ExecutionPolicy Bypass -File tools\deploy-cloudbase.ps1
#
# 为什么存在（三个本机实测的坑，脚本已内建对策）：
#   1. `tcb cloudrun deploy` 新命令能建服务但**不暴露环境变量参数**，而旧命令
#      `tcb run deploy --envParams k=v&k2=v2` 的解析器按 &/= 截断值——真实 Neon 连接串
#      必然被截断。对策：环境变量以 url-safe 无填充 base64（DATABASE_URL_B64）传入，
#      容器启动时由 Dockerfile 内 decode-db-url.sh 还原（见 Dockerfile 注释）。
#      本脚本给本机 npx 缓存里的 CLI 打一个幂等小补丁，让新命令把 EnvParams 传下去
#      （锚点唯一性校验 + 幂等标记，只改 %LOCALAPPDATA% 下的缓存文件，不碰仓库）。
#   2. 服务已存在时新命令会问「是否启用灰度部署？」——detached 进程没有 stdin 会永久卡住。
#      对策：全局隐藏旗标 `-y`（非交互，选默认=否=全量发布）。
#   3. 上传体积：staging 只放部署需要的文件（robocopy 排除 .git/.agents/.tmp-*/docs 等，
#      工作区中文曲目文件名必须用 robocopy——Windows tar.exe 解 git archive 会损坏中文名）。
#
# 机密处理：DATABASE_URL / SEED_ADMIN_PASSWORD 只从本机文件读取，绝不进命令行参数、
#           绝不打印（输出经正则脱敏后才落日志）。
# =============================================================================
param(
  [string]$EnvId = 'bg0527-d6gltfs0j67f8b9b9',
  [string]$ServiceName = 'music-drift'
)
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
$log = "$env:TEMP\tcb-deploy-manual.log"
"STARTED $(Get-Date -Format o)" | Set-Content -Path $log -Encoding utf8
function Note([string]$m) { $m | Add-Content -Path $log -Encoding utf8; Write-Host $m }

# ---- 1) staging：干净的上传目录（工作区即 HEAD 时直接 robocopy） ----
$stag = Join-Path (Get-Location) '.tmp-deploy-src'
if (Test-Path $stag) { Remove-Item -Recurse -Force $stag }
New-Item -ItemType Directory $stag | Out-Null
robocopy . $stag /E /XD .git node_modules dist .agents .agent-teams .tmp-* _tmp* screenshots docs site .codex /XF .env .env.example .neon /NFL /NDL /NJH /NJS /NC /NS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { Note "robocopy failed exit=$LASTEXITCODE"; exit 1 }
$sz = [math]::Round(((Get-ChildItem $stag -Recurse -File | Measure-Object Length -Sum).Sum / 1MB), 1)
Note "staging ok: $sz MB"
if (-not (Test-Path (Join-Path $stag 'Dockerfile'))) { Note 'staging missing Dockerfile'; exit 1 }

# ---- 2) 幂等补丁：给本机 CLI 的 cloudrun deploy 注入 EnvParams ----
$cli = "$env:LOCALAPPDATA\npm-cache\_npx\9a8789722ddc2fbe\node_modules\@cloudbase\cli\dist\standalone\cli.js"
$text = [IO.File]::ReadAllText($cli)
if ($text.Contains('TCB_RUN_ENV_PARAMS')) { Note 'patch: already applied' }
else {
  $anchor = 'Object.assign({}, (port ? { Port: Number(port) } : {})), (typeof parsedMinNum'
  $replacement = 'Object.assign({}, (process.env.TCB_RUN_ENV_PARAMS ? { EnvParams: process.env.TCB_RUN_ENV_PARAMS } : {}), (port ? { Port: Number(port) } : {})), (typeof parsedMinNum'
  $count = ([regex]::Matches($text, [regex]::Escape($anchor))).Count
  if ($count -ne 1) { Note "patch ABORT: anchor count=$count"; exit 1 }
  [IO.File]::WriteAllText($cli, $text.Replace($anchor, $replacement))
  Note 'patch: applied'
}
# npx 缓存目录 hash 可能随版本变化 → 顺带全局扫（同锚点、幂等）
Get-ChildItem "$env:LOCALAPPDATA\npm-cache\_npx" -Directory -ErrorAction SilentlyContinue | ForEach-Object {
  $c2 = Join-Path $_.FullName 'node_modules\@cloudbase\cli\dist\standalone\cli.js'
  if ((Test-Path $c2)) {
    $t2 = [IO.File]::ReadAllText($c2)
    if (-not $t2.Contains('TCB_RUN_ENV_PARAMS')) {
      $anchor = 'Object.assign({}, (port ? { Port: Number(port) } : {})), (typeof parsedMinNum'
      $replacement = 'Object.assign({}, (process.env.TCB_RUN_ENV_PARAMS ? { EnvParams: process.env.TCB_RUN_ENV_PARAMS } : {}), (port ? { Port: Number(port) } : {})), (typeof parsedMinNum'
      if (([regex]::Matches($t2, [regex]::Escape($anchor))).Count -eq 1) {
        [IO.File]::WriteAllText($c2, $t2.Replace($anchor, $replacement)); Note "patch: applied to $c2"
      }
    }
  }
}

# ---- 3) 环境变量 JSON（机密只进进程环境，不进参数） ----
$url = ((Select-String -Path .env.neon-production -Pattern '^DATABASE_URL=' | Select-Object -First 1).Line -replace '^DATABASE_URL=', '').Trim('"')
$pw  = ((Select-String -Path .env -Pattern '^SEED_ADMIN_PASSWORD=' | Select-Object -First 1).Line -replace '^SEED_ADMIN_PASSWORD=', '').Trim('"')
if (-not $url.StartsWith('postgresql://')) { Note 'DATABASE_URL missing/wrong in .env.neon-production (run: npx -y neon@latest env pull --file .env.neon-production)'; exit 1 }
$b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($url)) -replace '=', '' -replace '\+', '-' -replace '/', '_'
$env:TCB_RUN_ENV_PARAMS = ConvertTo-Json @{ DATABASE_URL_B64 = $b64; SEED_ADMIN_PASSWORD = $pw } -Compress
Note "env json built (b64len=$($b64.Length))"

# ---- 4) 部署（-y 非交互；--wait 阻塞；输出脱敏后落日志） ----
$env:NPM_CONFIG_UPDATE_NOTIFIER = 'false'
$out = & npx -y -p @cloudbase/cli@3.8.5 tcb -y cloudrun deploy --env-id $EnvId --service-name $ServiceName --source .tmp-deploy-src --port 8080 --min-num 1 --max-num 3 --open-access-types PUBLIC --force --wait 2>&1 |
  ForEach-Object {
    $s = "$_"
    $s = $s -replace [regex]::Escape($url), '[REDACTED-URL]'
    if ($b64.Length -gt 8) { $s = $s -replace [regex]::Escape($b64), '[REDACTED-B64]' }
    $s = $s -replace [regex]::Escape($pw), '[REDACTED-PW]'
    $s
  }
$out | Add-Content -Path $log -Encoding utf8
$out | Select-Object -Last 8
$code = $LASTEXITCODE
Note "EXIT=$code"
exit $code
