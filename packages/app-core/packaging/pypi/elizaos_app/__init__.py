"""
tokagentos_app — Dynamic loader for tokagentOS App, a personal AI assistant built on tokagentOS.

This package provides a Python entry point that dynamically loads and runs
the tokagentOS App Node.js runtime. It handles Node.js detection, automatic
installation of the tokagentos-app npm package, and seamless CLI delegation.

Usage (CLI):
    $ tokagentos-app start
    $ tokagentos-app setup
    $ tokagentos-app --help

Usage (Python API):
    from tokagentos_app import run, ensure_runtime, get_version

    # Ensure the runtime is ready
    ensure_runtime()

    # Run a command
    exit_code = run(["start"])

    # Get the installed version
    version = get_version()
"""

__version__ = "2.0.0a7"
__all__ = ["run", "ensure_runtime", "get_version", "TokagentOSAppError", "NodeNotFoundError"]

from tokagentos_app.loader import (
    TokagentOSAppError,
    NodeNotFoundError,
    ensure_runtime,
    get_version,
    run,
)
