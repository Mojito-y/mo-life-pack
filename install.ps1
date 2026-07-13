$ErrorActionPreference = "Stop"

$RepoUrl = if ($env:MO_LIFE_PACK_REPO_URL) { $env:MO_LIFE_PACK_REPO_URL } else { "https://github.com/Mojito-y/mo-life-pack.git" }
$InstallDir = if ($env:MO_LIFE_PACK_DIR) { $env:MO_LIFE_PACK_DIR } else { Join-Path $HOME "mo-life-pack" }

function Say {
  param([string]$Message)
  Write-Host ""
  Write-Host $Message
}

function Test-Command {
  param([string]$Name)
  return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Ensure-Git {
  if (Test-Command "git") {
    return
  }

  Say "没有找到 git。Windows 用户请先安装 Git for Windows：https://git-scm.com/download/win"
  Say "安装完成后重新打开 PowerShell，再执行 README 里的 Windows 安装命令。"
  exit 1
}

function Ensure-Npm {
  if (Test-Command "npm") {
    return
  }

  Say "没有找到 npm。请先安装 Node.js LTS：https://nodejs.org/"
  Say "安装完成后重新打开 PowerShell，再执行 README 里的 Windows 安装命令。"
  exit 1
}

function Print-GitHubHelp {
  Say "无法访问 GitHub 仓库：$RepoUrl"
  Say "这通常是 GitHub 网络、代理或 443 连接问题，不是 Mo Life Pack 配置问题。"
  Say "你可以先单独运行下面这条命令确认网络："
  Say "git ls-remote $RepoUrl HEAD"
  Say "如果这里也卡住或报 443，请先切换网络 / 代理 / VPN 后重新运行安装命令。"
}

function Ensure-RepoReachable {
  Say "正在检查 GitHub 仓库连接..."
  & git ls-remote $RepoUrl HEAD *> $null
  if ($LASTEXITCODE -eq 0) {
    Say "GitHub 仓库连接正常。"
    return
  }

  Print-GitHubHelp
  exit 1
}

function Warn-NodeRuntime {
  if (-not (Test-Command "node")) {
    return
  }

  $majorText = (& node -p "Number(process.versions.node.split('.')[0])" 2>$null)
  $major = 0
  [void][int]::TryParse("$majorText", [ref]$major)
  if ($major -lt 22) {
    Say "提示：当前 Node.js 版本低于 22。Mo Life Pack 可以安装，但 lark-channel-bridge 运行建议使用当前 Node.js LTS。"
  }
}

function Checkout-Repo {
  $GitDir = Join-Path $InstallDir ".git"
  if (Test-Path $GitDir) {
    Say "发现已有目录：$InstallDir，正在更新..."
    & git -C $InstallDir pull --ff-only
    if ($LASTEXITCODE -ne 0) {
      Print-GitHubHelp
      exit 1
    }
    return
  }

  if (Test-Path $InstallDir) {
    Say "目录已存在但不是 git 仓库：$InstallDir"
    Say '请换一个目录，例如：$env:MO_LIFE_PACK_DIR="$HOME\Tools\mo-life-pack"; irm https://raw.githubusercontent.com/Mojito-y/mo-life-pack/main/install.ps1 | iex'
    exit 1
  }

  Ensure-RepoReachable
  Say "正在下载 Mo Life Pack 到：$InstallDir"
  & git clone --progress $RepoUrl $InstallDir
  if ($LASTEXITCODE -ne 0) {
    Print-GitHubHelp
    exit 1
  }
  Say "Mo Life Pack 下载完成。"
}

function Run-Npm {
  param([string[]]$Arguments)
  & npm @Arguments
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
}

Say "开始安装 Mo Life Pack。"
Ensure-Git
Ensure-Npm
Checkout-Repo
Set-Location $InstallDir

Warn-NodeRuntime

Say "正在安装依赖..."
Run-Npm @("install")

Say "开始初始化 Mo Coach。一路回车即可使用默认配置。"
if ($env:MO_LIFE_PACK_ASSUME_DEFAULTS -eq "1") {
  Run-Npm @("run", "setup")
} else {
  Run-Npm @("run", "setup")
}

if ($env:MO_LIFE_PACK_SKIP_BRIDGE_INSTALL -ne "1") {
  Say "正在安装飞书机器人 bridge..."
  Run-Npm @("run", "bridge:install")
}

Say "安装完成。以后可以进入目录继续使用："
Say "cd `"$InstallDir`"; npm run bridge:run"
