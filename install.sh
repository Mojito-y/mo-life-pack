#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${MO_LIFE_PACK_REPO_URL:-https://github.com/Mojito-y/mo-life-pack.git}"
INSTALL_DIR="${MO_LIFE_PACK_DIR:-$HOME/mo-life-pack}"
PNPM_VERSION="${MO_LIFE_PACK_PNPM_VERSION:-9.0.0}"

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

ensure_pnpm() {
  if need_command pnpm; then
    return
  fi

  if need_command corepack; then
    say "没有找到 pnpm，正在用 corepack 准备 pnpm ${PNPM_VERSION}..."
    corepack enable
    corepack prepare "pnpm@${PNPM_VERSION}" --activate
    return
  fi

  if need_command npm; then
    say "没有找到 pnpm，正在用 npm 安装 pnpm ${PNPM_VERSION}..."
    npm install -g "pnpm@${PNPM_VERSION}"
    return
  fi

  say "没有找到 Node.js / npm / pnpm。"
  say "请先安装 Node.js LTS：https://nodejs.org/"
  say "安装完成后重新执行 README 里的那条安装命令。"
  exit 1
}

run_pnpm() {
  COREPACK_ENABLE_PROJECT_SPEC=0 pnpm --config.manage-package-manager-versions=false --config.package-manager-strict=false "$@"
}

checkout_repo() {
  if [ -d "$INSTALL_DIR/.git" ]; then
    say "发现已有目录：$INSTALL_DIR，正在更新..."
    git -C "$INSTALL_DIR" pull --ff-only
    return
  fi

  if [ -e "$INSTALL_DIR" ]; then
    say "目录已存在但不是 git 仓库：$INSTALL_DIR"
    say "请换一个目录：MO_LIFE_PACK_DIR=/your/path bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Mojito-y/mo-life-pack/main/install.sh)\""
    exit 1
  fi

  say "正在下载 Mo Life Pack 到：$INSTALL_DIR"
  git clone "$REPO_URL" "$INSTALL_DIR"
}

main() {
  say "开始安装 Mo Life Pack。"
  ensure_git
  checkout_repo
  cd "$INSTALL_DIR"

  ensure_pnpm

  say "正在安装依赖..."
  run_pnpm install

  say "开始初始化 Mo Coach。一路回车即可使用默认配置。"
  if [ -t 0 ] && [ "${MO_LIFE_PACK_ASSUME_DEFAULTS:-}" != "1" ]; then
    run_pnpm run setup
  else
    MO_LIFE_PACK_ASSUME_DEFAULTS=1 run_pnpm run setup
  fi

  say "安装完成。以后可以进入目录继续使用："
  say "cd \"$INSTALL_DIR\" && pnpm run doctor"
}

main "$@"
