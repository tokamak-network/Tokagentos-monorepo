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
- Overlay patches are applied once, at scaffold-time, against the freshly
  cloned upstream checkout. If upstream renamed or removed the target file,
  `applyTokagentScaffoldPatches` reports a conflict.
- Changes to these files are reviewable as regular source edits, not as
  runtime regex transforms.
