#!/usr/bin/env bash
# run_app.sh — Launch the "Judge the Model" Node.js app on your computer only.
#
# Your app: Node.js (web/app.js, served by web/server.mjs)
# Prerequisites: Node.js 20 or newer. No npm install; GitHub Pages has no install step.
#
# Where to run: a terminal in this project folder. On Windows use Git Bash or WSL,
# not PowerShell or Command Prompt.
#
# Exact command: bash run_app.sh      (stop it with Ctrl+C)
#
# Address to open: http://localhost:8766/
#
# This runs the app only on your computer, for checking your work. Publishing
# (your public link) is separate — see SETUP.md. This script installs nothing
# and never runs git.

set -euo pipefail

# Move to this script's own folder so it works from any working directory.
cd "$(dirname "$0")"

# Prerequisite check: Node.js 20 or newer.
if ! command -v node >/dev/null 2>&1; then
  echo "Error: node is not installed. Install Node.js 20 or newer, then run this again."
  exit 1
fi

node_version=$(node --version | sed 's/^v//')
node_major=${node_version%%.*}
if [ "$node_major" -lt 20 ]; then
  echo "Error: Node.js $node_version is too old. This app needs Node.js 20 or newer."
  exit 1
fi

if [ ! -f web/server.mjs ]; then
  echo "Error: web/server.mjs not found. Run this from the project folder."
  exit 1
fi

echo "Judge the Model: http://localhost:8766/"
echo "Open that address in your browser. Stop the app with Ctrl+C."
echo

node web/server.mjs
