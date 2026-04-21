#!/bin/sh
export NODE_PATH="/app/lib/node_modules"
export XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config}"
export TOKAGENTOS_APP_DATA_DIR="${XDG_CONFIG_HOME}/tokagentos-app"
exec /app/bin/node /app/lib/node_modules/tokagentos/tokagentos-app.mjs "$@"
