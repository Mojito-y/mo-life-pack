#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${MO_LIFE_PACK_REPO_URL:-https://github.com/Mojito-y/mo-life-pack.git}"
INSTALL_DIR="${MO_LIFE_PACK_DIR:-$HOME/mo-life-pack}"

say() {
  printf '\n%s\n' "$1"
}

need_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    return 1
  fi
}

ensure_git() {
  if need_command git; then
    return
  fi

  say "没有找到 git。macOS 用户可以先运行：xcode-select --install"
  say "安装完成后重新执行 README 里的那条安装命令。"
  exit 1
}

ensure_npm() {
  if need_command npm; then
    return
  fi

  say "没有找到 npm。请先安装 Node.js LTS：https://nodejs.org/"
  say "安装完成后重新执行 README 里的那条安装命令。"
  exit 1
}

print_github_help() {
  say "无法访问 GitHub 仓库：${REPO_URL}"
  say "这通常是 GitHub 网络、代理或 443 连接问题，不是 Mo Life Pack 配置问题。"
  say "你可以先单独运行下面这条命令确认网络："
  say "git ls-remote ${REPO_URL} HEAD"
  say "如果这里也卡住或报 443，请先切换网络 / 代理 / VPN 后重新运行安装命令。"
}

ensure_repo_reachable() {
  say "正在检查 GitHub 仓库连接..."
  if git ls-remote "${REPO_URL}" HEAD >/dev/null 2>&1; then
    say "GitHub 仓库连接正常。"
    return
  fi

  print_github_help
  exit 1
}

warn_node_runtime() {
  if ! need_command node; then
    return
  fi

  local major
  major="$(node -p 'Number(process.versions.node.split(".")[0])' 2>/dev/null || printf '0')"
  if [ "$major" -lt 22 ]; then
    say "提示：当前 Node.js 版本低于 22。Mo Life Pack 可以安装，但 lark-channel-bridge 需要 Node.js 22 LTS 或更新版本才能运行。"
    say "安装后如果要启动飞书机器人，请先切换 Node.js 22+，例如：nvm install 22 && nvm use 22"
  fi
}

checkout_repo() {
  if [ -d "${INSTALL_DIR}/.git" ]; then
    say "发现已有目录：${INSTALL_DIR}，正在更新..."
    if ! git -C "${INSTALL_DIR}" pull --ff-only; then
      print_github_help
      exit 1
    fi
    return
  fi

  if [ -e "${INSTALL_DIR}" ]; then
    say "目录已存在但不是 git 仓库：${INSTALL_DIR}"
    say "请换一个目录：MO_LIFE_PACK_DIR=/your/path bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Mojito-y/mo-life-pack/main/install.sh)\""
    exit 1
  fi

  ensure_repo_reachable
  say "正在下载 Mo Life Pack 到：${INSTALL_DIR}"
  if ! git clone --progress "${REPO_URL}" "${INSTALL_DIR}"; then
    print_github_help
    exit 1
  fi
  say "Mo Life Pack 下载完成。"
}

main() {
  say "开始安装 Mo Life Pack。"
  ensure_git
  ensure_npm
  checkout_repo
  cd "${INSTALL_DIR}"

  warn_node_runtime

  say "正在安装依赖..."
  npm install

  say "开始初始化 Mo Life Pack Agent。第一步会选择要安装的 agent；一路回车会默认安装 Mo Coach。"
  if [ -t 0 ] && [ "${MO_LIFE_PACK_ASSUME_DEFAULTS:-}" != "1" ]; then
    npm run setup
  else
    MO_LIFE_PACK_ASSUME_DEFAULTS=1 npm run setup
  fi

  if [ "${MO_LIFE_PACK_SKIP_BRIDGE_INSTALL:-}" != "1" ]; then
    say "正在安装飞书机器人 bridge..."
    npm run bridge:install
  fi

  say "安装完成。以后可以进入目录继续使用："
  say "cd \"${INSTALL_DIR}\" && npm run bridge:run"
}

main "$@"
