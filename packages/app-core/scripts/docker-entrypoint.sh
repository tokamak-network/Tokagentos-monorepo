#!/usr/bin/env sh
set -eu

resolved_port="${PORT:-${MILADY_PORT:-2138}}"

export MILADY_PORT="$resolved_port"
export TOKAGENT_PORT="${TOKAGENT_PORT:-$resolved_port}"
export MILADY_API_PORT="${MILADY_API_PORT:-$resolved_port}"
export TOKAGENT_API_PORT="${TOKAGENT_API_PORT:-$resolved_port}"

exec "$@"
