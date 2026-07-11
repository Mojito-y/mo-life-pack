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

warn_node_runtime() {
  if ! need_command node; then
    return
  fi

  local major
  major="$(node -p 'Number(process.versions.node.split(".")[0])' 2>/dev/null || printf '0')"
  if [ "$major" -lt 22 ]; then
    say "提示：当前 Node.js 版本低于 22。Mo Life Pack 可以安装，但 lark-channel-bridge 运行建议使用当前 Node.js LTS。"
  fi
}

checkout_repo() {
  if [ -d "${INSTALL_DIR}/.git" ]; then
    say "发现已有目录：${INSTALL_DIR}，正在更新..."
    git -C "${INSTALL_DIR}" pull --ff-only
    return
  fi

  if [ -e "${INSTALL_DIR}" ]; then
    say "目录已存在但不是 git 仓库：${INSTALL_DIR}"
    say "请换一个目录：MO_LIFE_PACK_DIR=/your/path bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Mojito-y/mo-life-pack/main/install.sh)\""
    exit 1
  fi

  say "正在下载 Mo Life Pack 到：${INSTALL_DIR}"
  git clone "${REPO_URL}" "${INSTALL_DIR}"
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

  say "开始初始化 Mo Coach。一路回车即可使用默认配置。"
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
