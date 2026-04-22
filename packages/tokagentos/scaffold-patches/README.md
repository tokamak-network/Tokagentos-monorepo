# Scaffold Patches

Files in this directory are overlay patches applied to every scaffolded
project's cloned `tokagent/` submodule at scaffold-time. Paths under this
directory are relative to `<project>/tokagent/`.

Purpose: the upstream elizaOS codebase ships a broad runtime plugin catalog
geared toward a general-purpose agent framework. The Tokagent product needs
a tailored subset for DeFi operations. Rather than forking the upstream
runtime, we overlay targeted files post-clone.

**Rules:**
- Each file in this tree shadows the file at the same relative path inside
  `<project>/tokagent/`.
- Overlay patches are deterministic (same input → same output).
- If a user later runs `tokagentos upgrade` to pull a new upstream version,
  the overlays re-apply automatically. If upstream renamed or removed the
  target file, `applyTokagentScaffoldPatches` reports a conflict.
- Changes to these files are reviewable as regular source edits, not as
  runtime regex transforms.
