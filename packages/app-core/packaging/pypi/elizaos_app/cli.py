"""
CLI entry point for the tokagentos-app dynamic loader.

Delegates all commands to the tokagentOS App Node.js runtime,
installing it automatically if needed.
"""

from __future__ import annotations

import sys

from tokagentos_app.loader import TokagentOSAppError, run


def main() -> None:
    """Main CLI entry point — forwards all args to the Node.js tokagentos-app CLI."""
    try:
        args = sys.argv[1:]
        exit_code = run(args)
        sys.exit(exit_code)
    except TokagentOSAppError as exc:
        print(f"tokagentos-app: {exc}", file=sys.stderr)
        sys.exit(1)
    except KeyboardInterrupt:
        sys.exit(130)
