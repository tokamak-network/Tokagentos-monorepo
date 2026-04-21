"""
Dynamic loader for the tokagentOS App Node.js runtime.

Responsibilities:
  1. Detect a suitable Node.js installation (>= 22.12.0)
  2. Detect or install the tokagentos-app npm package
  3. Delegate CLI invocations to the Node.js process
  4. Provide a Python API for programmatic use
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
from typing import Optional, Sequence, Tuple

# ── Constants ────────────────────────────────────────────────────────────────

REQUIRED_NODE_VERSION: Tuple[int, int, int] = (22, 12, 0)
NPM_PACKAGE = "tokagentos"
_VERSION_RE = re.compile(r"v?(\d+)\.(\d+)\.(\d+)")


# ── Exceptions ───────────────────────────────────────────────────────────────


class TokagentOSAppError(Exception):
    """Base exception for tokagentos-app loader errors."""


class NodeNotFoundError(TokagentOSAppError):
    """Raised when a suitable Node.js installation cannot be found."""


class RuntimeInstallError(TokagentOSAppError):
    """Raised when the tokagentos-app npm package cannot be installed."""


# ── Node.js Detection ────────────────────────────────────────────────────────


def _parse_version(version_str: str) -> Optional[Tuple[int, int, int]]:
    """Parse a semver string like 'v22.12.0' into a (major, minor, patch) tuple."""
    match = _VERSION_RE.search(version_str)
    if not match:
        return None
    return (int(match.group(1)), int(match.group(2)), int(match.group(3)))


def _find_node() -> Optional[str]:
    """Find a node binary on PATH."""
    return shutil.which("node")


def _get_node_version(node_bin: str) -> Optional[Tuple[int, int, int]]:
    """Get the version of a Node.js binary."""
    try:
        result = subprocess.run(
            [node_bin, "--version"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode == 0:
            return _parse_version(result.stdout.strip())
    except (subprocess.SubprocessError, OSError):
        pass
    return None


def _check_node() -> str:
    """
    Find and validate a Node.js installation.

    Returns the path to the node binary.
    Raises NodeNotFoundError if no suitable version is found.
    """
    node_bin = _find_node()
    if not node_bin:
        req = ".".join(str(v) for v in REQUIRED_NODE_VERSION)
        raise NodeNotFoundError(
            f"Node.js not found. tokagentOS App requires Node.js >= {req}.\n"
            "Install it from https://nodejs.org or via your package manager:\n"
            "  macOS:   brew install node@22\n"
            "  Linux:   curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash -\n"
            "  Windows: winget install OpenJS.NodeJS.LTS"
        )

    version = _get_node_version(node_bin)
    if version is None:
        raise NodeNotFoundError(
            f"Could not determine version of Node.js at {node_bin}"
        )

    if version < REQUIRED_NODE_VERSION:
        current = ".".join(str(v) for v in version)
        req = ".".join(str(v) for v in REQUIRED_NODE_VERSION)
        raise NodeNotFoundError(
            f"Node.js {current} found, but >= {req} is required.\n"
            "Please upgrade Node.js: https://nodejs.org"
        )

    return node_bin


# ── npm / npx Detection ─────────────────────────────────────────────────────


def _find_npx() -> Optional[str]:
    """Find npx on PATH."""
    return shutil.which("npx")


def _find_npm() -> Optional[str]:
    """Find npm on PATH."""
    return shutil.which("npm")


def _is_tokagentos_app_installed_globally() -> bool:
    """Check if tokagentos-app is installed as a global npm package."""
    npm_bin = _find_npm()
    if not npm_bin:
        return False
    try:
        result = subprocess.run(
            [npm_bin, "list", "-g", NPM_PACKAGE, "--json"],
            capture_output=True,
            text=True,
            timeout=30,
        )
        if result.returncode == 0:
            data = json.loads(result.stdout)
            deps = data.get("dependencies", {})
            return NPM_PACKAGE in deps
    except (subprocess.SubprocessError, OSError, json.JSONDecodeError):
        pass
    return False


def _find_tokagentos_app_bin() -> Optional[str]:
    """Find the tokagentos-app CLI binary on PATH (from a global npm install)."""
    return shutil.which("tokagentos-app")


def _install_tokagentos_app_global() -> None:
    """Install tokagentos-app globally via npm."""
    npm_bin = _find_npm()
    if not npm_bin:
        raise RuntimeInstallError(
            "npm not found. Cannot install tokagentos-app runtime.\n"
            "Install Node.js (which includes npm) from https://nodejs.org"
        )

    print(
        "tokagentos-app: installing tokagentos-app runtime (npm install -g tokagentos)...",
        file=sys.stderr,
    )
    try:
        result = subprocess.run(
            [npm_bin, "install", "-g", NPM_PACKAGE],
            timeout=120,
        )
        if result.returncode != 0:
            raise RuntimeInstallError(
                f"Failed to install {NPM_PACKAGE} via npm (exit code {result.returncode}).\n"
                "Try running manually: npm install -g tokagentos"
            )
        print("tokagentos-app: tokagentos-app runtime installed successfully.", file=sys.stderr)
    except subprocess.TimeoutExpired:
        raise RuntimeInstallError(
            f"Timed out installing {NPM_PACKAGE}. Check your network connection."
        )


# ── Public API ───────────────────────────────────────────────────────────────


def ensure_runtime() -> str:
    """
    Ensure the tokagentOS App Node.js runtime is available.

    Checks for Node.js, then checks for the tokagentos-app npm package.
    Installs tokagentos-app globally if not found.

    Returns:
        Path to the tokagentos-app CLI binary or npx fallback.

    Raises:
        NodeNotFoundError: If Node.js is not installed or too old.
        RuntimeInstallError: If tokagentos-app cannot be installed.
    """
    _check_node()

    tokagentos_app_bin = _find_tokagentos_app_bin()
    if tokagentos_app_bin:
        return tokagentos_app_bin

    # Not found on PATH — try installing globally
    _install_tokagentos_app_global()

    tokagentos_app_bin = _find_tokagentos_app_bin()
    if not tokagentos_app_bin:
        # Fall back to npx
        npx_bin = _find_npx()
        if npx_bin:
            return npx_bin
        raise RuntimeInstallError(
            "tokagentos-app was installed but the binary was not found on PATH.\n"
            "Try: export PATH=\"$(npm config get prefix)/bin:$PATH\""
        )

    return tokagentos_app_bin


def run(args: Optional[Sequence[str]] = None) -> int:
    """
    Run an tokagentos-app CLI command.

    Args:
        args: CLI arguments to pass to tokagentos-app (e.g. ["start", "--verbose"]).
              If None, defaults to empty list.

    Returns:
        The exit code from the tokagentos-app process.

    Raises:
        TokagentOSAppError: If the runtime cannot be found or started.
    """
    if args is None:
        args = []

    bin_path = ensure_runtime()

    # If we got npx back (fallback), run via npx
    if os.path.basename(bin_path) == "npx":
        cmd = [bin_path, NPM_PACKAGE, *list(args)]
    else:
        cmd = [bin_path, *list(args)]

    try:
        result = subprocess.run(cmd)
        return result.returncode
    except FileNotFoundError:
        raise TokagentOSAppError(f"Could not execute: {bin_path}")
    except OSError as exc:
        raise TokagentOSAppError(f"Failed to run tokagentos-app: {exc}")


def get_version() -> Optional[str]:
    """
    Get the installed tokagentos-app version.

    Returns:
        Version string (e.g. "2.0.0-alpha.7") or None if not installed.
    """
    tokagentos_app_bin = _find_tokagentos_app_bin()
    if not tokagentos_app_bin:
        return None

    try:
        result = subprocess.run(
            [tokagentos_app_bin, "--version"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode == 0:
            return result.stdout.strip().split("\n")[-1]
    except (subprocess.SubprocessError, OSError):
        pass
    return None
