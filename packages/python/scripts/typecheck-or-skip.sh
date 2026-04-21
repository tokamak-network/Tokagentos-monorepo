#!/usr/bin/env sh
# Prefer uv (dev env), then python3 -m mypy when mypy is installed. No-op otherwise.
cd "$(dirname "$0")/.."
if command -v uv >/dev/null 2>&1; then
	exec uv run --extra dev mypy tokagentos
fi
if command -v python3 >/dev/null 2>&1 && python3 -c "import mypy" >/dev/null 2>&1; then
	exec python3 -m mypy tokagentos
fi
echo "[@tokagentos/python] typecheck: uv/mypy not available, skipping"
exit 0
