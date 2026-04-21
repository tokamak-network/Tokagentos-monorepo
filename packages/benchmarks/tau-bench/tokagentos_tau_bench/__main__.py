"""
Entry point for running Tau-bench as a module.

Usage:
    python -m tokagentos_tau_bench --all
    python -m tokagentos_tau_bench --domain retail --trials 8
"""

from tokagentos_tau_bench.cli import main

if __name__ == "__main__":
    main()
