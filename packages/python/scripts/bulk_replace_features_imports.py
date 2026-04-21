#!/usr/bin/env python3
"""Rewrite tokagentos.* imports after moving packages under tokagentos.features."""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

REPLACEMENTS: list[tuple[str, str]] = [
    ("tokagentos.advanced_capabilities", "tokagentos.features.advanced_capabilities"),
    ("tokagentos.advanced_memory", "tokagentos.features.advanced_memory"),
    ("tokagentos.advanced_planning", "tokagentos.features.advanced_planning"),
    ("tokagentos.basic_capabilities", "tokagentos.features.basic_capabilities"),
    ("tokagentos.core_capabilities", "tokagentos.features.core_capabilities"),
]


def main() -> None:
    count = 0
    for path in ROOT.rglob("*.py"):
        if "__pycache__" in path.parts:
            continue
        text = path.read_text(encoding="utf-8")
        new = text
        for old, newp in REPLACEMENTS:
            new = new.replace(old, newp)
        if new != text:
            path.write_text(new, encoding="utf-8")
            count += 1
            print(path.relative_to(ROOT))
    print(f"Updated {count} files.")


if __name__ == "__main__":
    main()
