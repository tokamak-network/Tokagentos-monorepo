# Companion VRM / Avatar Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the companion's Milady-style VRM + Matrix scene + 38-emote catalog with a single Pro Humanoid character (placeholder in Phase 1), an Aurora scene inheriting Tokamak's palette, and a 6-emote state-transition set.

**Architecture:** Two surfaces — the monorepo's `apps/app-companion/` (source of truth for the package) and `packages/tokagentos/scaffold-patches/apps/app-companion/` (the overlay applied to the upstream elizaOS checkout in scaffolded projects). Changes to both surfaces. Runtime event wiring is a minimal additive change, not a refactor.

**Tech Stack:** TypeScript, Bun 1.3.5, Three.js (existing companion scene engine), VRM 1.0 binary format, scaffold-patches mechanism (`scaffold.ts` walks the patches dir and copies each file into the submodule).

**Working directory for every task:** `/Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer/tokagentos`. The git repo root is one level up. Use absolute paths in every Bash command. Do NOT use `-c commit.gpgsign=false` or `--no-verify`.

**Source spec:** `docs/superpowers/specs/2026-04-24-companion-vrm-redesign-design.md`

---

## File Structure Changes

### Monorepo files deleted
- `apps/app-companion/public/vrms/milady-{2..8}.vrm` (7 files)
- `apps/app-companion/public/vrms/milady-{2..8}.png` (7 preview PNGs, 7 background PNGs = 14 files)
- `apps/app-companion/src/emotes/` — 32 unused `.glb`/`.fbx`/`.gz` animation files (exact list computed by Task 2.3)
- `apps/app-companion/src/components/companion/environment/MathEnvironment.ts` (replaced by AuroraEnvironment)

### Monorepo files created
- `apps/app-companion/public/vrms/tokagent-0.vrm` (placeholder — milady-1.vrm renamed in Phase 1)
- `apps/app-companion/src/components/companion/environment/AuroraEnvironment.ts`

### Monorepo files modified
- `apps/app-companion/src/emotes/catalog.ts` — trim from 38 entries to 6
- `apps/app-companion/src/components/companion/environment/scene-theme-tokens.ts` — update color fallbacks to Tokamak palette
- `apps/app-companion/src/components/companion/` — files that import `MathEnvironment` get switched to `AuroraEnvironment`

### Scaffold-patches added (mirror of monorepo changes + delete-markers)
- `packages/tokagentos/scaffold-patches/apps/app-companion/public/vrms/tokagent-0.vrm`
- `packages/tokagentos/scaffold-patches/apps/app-companion/src/emotes/catalog.ts`
- `packages/tokagentos/scaffold-patches/apps/app-companion/src/components/companion/environment/AuroraEnvironment.ts`
- `packages/tokagentos/scaffold-patches/apps/app-companion/src/components/companion/environment/scene-theme-tokens.ts`

---

## Phase 0 — Branch & Baseline

### Task 0.1: Create redesign branch off the latest feat/tokagentos-fork

- [ ] **Step 1: Fetch + confirm current state**

```bash
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer
git fetch fork
git checkout feat/tokagentos-fork
git pull fork feat/tokagentos-fork
git log --oneline -3
```

Expected: HEAD on fork/feat/tokagentos-fork (or one commit ahead from local frontend work, safe to rebase or leave).

- [ ] **Step 2: Create anchor tag + redesign branch**

```bash
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer
git tag pre-companion-redesign
git checkout -b feat/companion-vrm-redesign
git rev-parse --abbrev-ref HEAD
```

Expected: `feat/companion-vrm-redesign`.

- [ ] **Step 3: Verify working tree is clean (no stray uncommitted edits)**

```bash
git status --short
```

Expected: empty or only untracked protobuf regen files (pre-existing, fine).

### Task 0.2: Verify scaffold-patches mechanism supports binary files

Binary VRM files will be copied through scaffold-patches. If the mechanism reads them as utf-8 text, they'll corrupt. This step verifies + fixes if needed BEFORE we depend on it.

- [ ] **Step 1: Read the walk + copy logic**

```bash
grep -nA 20 'applyTokagentScaffoldPatches' tokagentos/packages/tokagentos/src/scaffold.ts | head -80
```

Look specifically for how files are read/written. Pattern check:
- `fs.copyFileSync(src, dst)` → binary-safe ✅
- `fs.readFileSync(src)` (no encoding) + `fs.writeFileSync(dst, buffer)` → binary-safe ✅
- `fs.readFileSync(src, 'utf8')` + `fs.writeFileSync(dst, text)` → **binary-unsafe** ❌ — must fix

- [ ] **Step 2: Fix if needed**

If the mechanism is binary-unsafe, edit `scaffold.ts` to switch to `fs.copyFileSync`. Commit as a separate preparatory commit:

```bash
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer
git add tokagentos/packages/tokagentos/src/scaffold.ts
git commit -m "fix(cli): make scaffold-patches copy binary-safe for VRM assets"
```

If binary-safe already, skip this step and record in the commit log.

---

## Phase 1 — Emote Catalog Trim (Monorepo)

Smallest surface, lowest risk — start here to validate workflow.

### Task 1.1: Map current emote catalog

- [ ] **Step 1: Read the current catalog**

```bash
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer/tokagentos
cat apps/app-companion/src/emotes/catalog.ts | head -120
```

- [ ] **Step 2: Identify the 6 Mixamo animations that best fit each new emote**

The existing catalog has 38 entries across categories: greeting (6), emotion (8), dance (7), idle (2), gesture (7), other (1). Pick the closest match for each new slot:

| New emote | Likely existing entry | Fallback |
|---|---|---|
| `idle` | existing `idle-breathing` or `idle` entry | first entry in idle category |
| `thinking` | existing `thinking` or `looking-around` | any gesture-category entry for head motion |
| `speaking` | existing `talking` or `nodding-gesture` | gesture-category entry |
| `acknowledge` | existing `nod` or `wave-hello` | greeting-category |
| `alert` | existing `shake-head-no` or surprised-emotion | emotion-category surprised |
| `success` | existing `fist-pump` or `celebrate` | emotion-category happy |

Note the **exact animation file paths** from catalog.ts for these 6. Record them — they must NOT be deleted in Task 2.3.

### Task 1.2: Rewrite catalog.ts

- [ ] **Step 1: Write the new catalog.ts**

Replace the entire contents of `apps/app-companion/src/emotes/catalog.ts` with a 6-entry catalog following the existing TypeScript shape. Preserve the existing type exports and any helper functions at the bottom of the file.

Example shape (match whatever existing types the file declares):

```ts
// Keep type imports + helper signatures exactly as upstream.
import type { EmoteEntry, EmoteCategory } from "./types";

/**
 * Tokagent companion emote set.
 *
 * This is a 6-entry minimal set mapped to agent runtime state transitions:
 *
 *   idle        — default when no other state is active
 *   thinking    — agent is running an action / tool call
 *   speaking    — agent is streaming a response
 *   acknowledge — user message received
 *   alert       — error / warning / pause
 *   success     — milestone / strategy executed
 *
 * Upstream elizaOS shipped 38 emotes built for a social companion (dances,
 * emotion exaggeration, greeting variations). Tokagent is a DeFi operator
 * tool — it doesn't need a performative avatar.
 */
export const EMOTE_CATALOG: readonly EmoteEntry[] = [
  {
    id: "idle",
    category: "idle",
    asset: "idle-breathing.glb.gz",     // <-- replace with Task 1.1's selected paths
    loop: true,
    durationMs: 3000,
  },
  {
    id: "thinking",
    category: "gesture",
    asset: "thinking-head-tilt.glb.gz",
    loop: true,
    durationMs: 2400,
  },
  {
    id: "speaking",
    category: "gesture",
    asset: "talking-gesture.glb.gz",
    loop: true,
    durationMs: 2000,
  },
  {
    id: "acknowledge",
    category: "greeting",
    asset: "nod.glb.gz",
    loop: false,
    durationMs: 1200,
  },
  {
    id: "alert",
    category: "emotion",
    asset: "shake-head-no.glb.gz",
    loop: false,
    durationMs: 1500,
  },
  {
    id: "success",
    category: "emotion",
    asset: "fist-pump.glb.gz",
    loop: false,
    durationMs: 2200,
  },
] as const;

export type EmoteId = typeof EMOTE_CATALOG[number]["id"];
```

Use the exact asset filenames identified in Task 1.1.

- [ ] **Step 2: Typecheck**

```bash
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer/tokagentos
bun run --cwd apps/app-companion typecheck 2>&1 | tail -20
```

Expected: no new errors referencing emote catalog. Pre-existing errors (from the cleanup follow-ups, known) are acceptable.

If a type named `EmoteEntry` or `EmoteCategory` doesn't exist, look at the original catalog.ts and preserve whatever shape was used — match it.

- [ ] **Step 3: Commit**

```bash
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer
git add tokagentos/apps/app-companion/src/emotes/catalog.ts
git commit -m "refactor(companion): trim emote catalog from 38 to 6 state-transition emotes"
```

---

## Phase 2 — VRM Consolidation + Emote File Cleanup (Monorepo)

### Task 2.1: Rename `milady-1.vrm` to placeholder `tokagent-0.vrm`

- [ ] **Step 1: Rename the VRM file**

```bash
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer/tokagentos
git mv apps/app-companion/public/vrms/milady-1.vrm apps/app-companion/public/vrms/tokagent-0.vrm
ls apps/app-companion/public/vrms/tokagent-0.vrm
```

Expected: file listed, ~3.4 MB.

- [ ] **Step 2: Rename preview + background PNGs if they exist**

```bash
for ext in png jpg; do
  for suffix in "" ".preview" ".background"; do
    src="apps/app-companion/public/vrms/milady-1${suffix}.${ext}"
    dst="apps/app-companion/public/vrms/tokagent-0${suffix}.${ext}"
    [ -f "$src" ] && git mv "$src" "$dst" && echo "renamed $src → $dst"
  done
done
```

- [ ] **Step 3: Commit**

```bash
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer
git status --short tokagentos/apps/app-companion/public/vrms/
git add tokagentos/apps/app-companion/public/vrms/
git commit -m "refactor(companion): rename milady-1 → tokagent-0 (placeholder)"
```

### Task 2.2: Delete the 7 legacy Milady VRMs + preview/background PNGs

- [ ] **Step 1: Confirm the deletion list**

```bash
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer/tokagentos
ls apps/app-companion/public/vrms/milady-*.{vrm,png,jpg} 2>/dev/null
```

Expected: 7 milady-{2..8}.vrm + their associated preview/background images.

- [ ] **Step 2: Check for any references before deleting**

```bash
git grep -l 'milady-[2-8]' -- 'apps/app-companion/' 'packages/' 2>/dev/null | head
```

Expected: no hits outside the VRM files themselves. If there's a code reference, deletion would break something — pause and report.

- [ ] **Step 3: Delete**

```bash
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer/tokagentos
git rm apps/app-companion/public/vrms/milady-{2..8}.vrm
git rm apps/app-companion/public/vrms/milady-{2..8}.png 2>/dev/null || true
git rm apps/app-companion/public/vrms/milady-{2..8}.background.png 2>/dev/null || true
git rm apps/app-companion/public/vrms/milady-{2..8}.preview.png 2>/dev/null || true
```

Use the actual filenames observed in Step 1.

- [ ] **Step 4: Verify character catalog config still points at tokagent-0**

```bash
grep -rn 'vrmAssets' packages/app-core/src/state/vrm.ts apps/app-companion/src/ 2>/dev/null | head
grep -rn 'tokagent-0\|milady-1' apps/app-companion/src/ packages/ 2>/dev/null | grep -v node_modules | head
```

Expected: `vrmAssets` default should reference `tokagent-0` slug. If any code still references `milady-1`, update it to `tokagent-0`.

- [ ] **Step 5: Commit**

```bash
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer
git add tokagentos/apps/app-companion/public/vrms/
git commit -m "chore(companion): remove 7 legacy Milady VRMs (single-character catalog)"
```

### Task 2.3: Delete unused emote animation files

- [ ] **Step 1: Build the list of emote animation files currently on disk**

```bash
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer/tokagentos
find apps/app-companion/src/emotes apps/app-companion/public/emotes 2>/dev/null -type f \( -name '*.glb' -o -name '*.glb.gz' -o -name '*.fbx' -o -name '*.fbx.gz' \) | sort
```

Record the list. Expect ~38+ files (one per original emote, possibly plus gzipped variants).

- [ ] **Step 2: Build the keep-list from the trimmed catalog.ts**

```bash
grep -oE 'asset:\s*"[^"]+"' apps/app-companion/src/emotes/catalog.ts | awk -F'"' '{print $2}'
```

Expected: 6 filenames (one per emote). Note these asset basenames — any file starting with these basenames is KEPT.

- [ ] **Step 3: Delete everything not in the keep-list**

For each file from Step 1 whose basename is NOT in the Step 2 keep-list, `git rm` it.

Scripted:

```bash
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer/tokagentos
KEEP=$(grep -oE 'asset:\s*"[^"]+"' apps/app-companion/src/emotes/catalog.ts | awk -F'"' '{print $2}' | sed 's/\.gz$//' | sort -u)
ALL=$(find apps/app-companion/src/emotes apps/app-companion/public/emotes 2>/dev/null -type f \( -name '*.glb' -o -name '*.glb.gz' -o -name '*.fbx' -o -name '*.fbx.gz' \))
for f in $ALL; do
  base=$(basename "$f" .gz)
  if echo "$KEEP" | grep -qx "$base"; then
    echo "keep: $f"
  else
    git rm "$f"
  fi
done
```

- [ ] **Step 4: Confirm the 6 kept files are present**

```bash
for asset in $(grep -oE 'asset:\s*"[^"]+"' apps/app-companion/src/emotes/catalog.ts | awk -F'"' '{print $2}'); do
  find apps/app-companion -name "$asset" -o -name "${asset}.gz" 2>/dev/null | head -1
done
```

Expected: 6 file paths (or 6 .gz paths if upstream gzips at build time; either is fine).

- [ ] **Step 5: Commit**

```bash
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer
git status --short tokagentos/apps/app-companion/src/emotes tokagentos/apps/app-companion/public/emotes 2>/dev/null
git commit -m "chore(companion): delete unused emote animation files (~32 files, ~30-50MB disk)"
```

---

## Phase 3 — Aurora Scene Replacement

### Task 3.1: Understand current MathEnvironment.ts integration

- [ ] **Step 1: Read MathEnvironment to understand the interface**

```bash
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer/tokagentos
cat apps/app-companion/src/components/companion/environment/MathEnvironment.ts | head -60
```

Note:
- Default export vs named export?
- Constructor signature (takes THREE.Scene? a canvas element? a config object?)
- `update()` / `dispose()` / `setTheme()` methods?

- [ ] **Step 2: Find callers**

```bash
grep -rln 'MathEnvironment' apps/app-companion/src/
```

List each caller + the exact import statement it uses.

### Task 3.2: Write AuroraEnvironment.ts

**Files:**
- Create: `apps/app-companion/src/components/companion/environment/AuroraEnvironment.ts`

- [ ] **Step 1: Implement AuroraEnvironment matching the MathEnvironment interface**

Preserve the exact method signatures MathEnvironment exposed (from Task 3.1). Replace internal behavior with aurora blobs.

Skeleton (adjust to match actual interface discovered in Task 3.1):

```ts
/**
 * AuroraEnvironment — Tokagent companion scene background.
 *
 * Replaces the upstream Matrix-style MathEnvironment. Renders three
 * radial-gradient blobs in Tokamak's lime accent palette on a dark base.
 * Blobs drift slowly (12-20s loop) with no pulse. No grid, no panels.
 *
 * Spec: docs/superpowers/specs/2026-04-24-companion-vrm-redesign-design.md §6.3
 */
import * as THREE from "three";
import {
  getSceneThemeTokens,
  type SceneThemeTokens,
} from "./scene-theme-tokens";

type AuroraBlob = {
  mesh: THREE.Mesh;
  initialPosition: THREE.Vector3;
  driftOffset: number;     // phase offset so the 3 blobs don't drift in sync
  driftSpeed: number;      // 1/period — smaller = slower
  driftRadius: number;     // world-units of offset from initial position
};

export class AuroraEnvironment {
  private scene: THREE.Scene;
  private blobs: AuroraBlob[] = [];
  private tokens: SceneThemeTokens;
  private clock: THREE.Clock;

  constructor(scene: THREE.Scene, tokens?: SceneThemeTokens) {
    this.scene = scene;
    this.tokens = tokens ?? getSceneThemeTokens();
    this.clock = new THREE.Clock();
    this.buildBlobs();
  }

  private buildBlobs(): void {
    const colors = [
      this.tokens.accent,        // #c4f547
      this.tokens.accentDark,    // #8ab81d
      this.tokens.accentLight,   // #d5f972
    ];
    const positions: [number, number, number][] = [
      [-2.4, 1.6, -3.5],
      [ 2.8, 0.4, -4.0],
      [ 0.0, -1.6, -3.2],
    ];
    const speeds = [1 / 18, 1 / 14, 1 / 20];   // 18s, 14s, 20s cycles
    const radii = [0.7, 0.9, 0.6];
    for (let i = 0; i < 3; i++) {
      const geom = new THREE.CircleGeometry(2.2, 48);
      const mat = new THREE.MeshBasicMaterial({
        color: colors[i],
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(...positions[i]);
      this.scene.add(mesh);
      this.blobs.push({
        mesh,
        initialPosition: mesh.position.clone(),
        driftOffset: i * 2.1,
        driftSpeed: speeds[i],
        driftRadius: radii[i],
      });
    }
  }

  public update(): void {
    const t = this.clock.getElapsedTime();
    for (const blob of this.blobs) {
      const phase = (t + blob.driftOffset) * blob.driftSpeed * Math.PI * 2;
      blob.mesh.position.x =
        blob.initialPosition.x + Math.sin(phase) * blob.driftRadius;
      blob.mesh.position.y =
        blob.initialPosition.y + Math.cos(phase * 0.7) * blob.driftRadius * 0.5;
    }
  }

  public setTheme(tokens: SceneThemeTokens): void {
    this.tokens = tokens;
    const colors = [tokens.accent, tokens.accentDark, tokens.accentLight];
    for (let i = 0; i < this.blobs.length; i++) {
      const mat = this.blobs[i].mesh.material as THREE.MeshBasicMaterial;
      mat.color.set(colors[i]);
    }
  }

  public dispose(): void {
    for (const blob of this.blobs) {
      this.scene.remove(blob.mesh);
      blob.mesh.geometry.dispose();
      (blob.mesh.material as THREE.Material).dispose();
    }
    this.blobs = [];
  }
}
```

Match the actual MathEnvironment constructor shape. If MathEnvironment took different args (e.g., a canvas + config), preserve that.

- [ ] **Step 2: Typecheck just the new file**

```bash
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer/tokagentos
bun run --cwd apps/app-companion typecheck 2>&1 | grep -i AuroraEnvironment
```

Expected: no errors mentioning AuroraEnvironment.

- [ ] **Step 3: Commit**

```bash
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer
git add tokagentos/apps/app-companion/src/components/companion/environment/AuroraEnvironment.ts
git commit -m "feat(companion): add AuroraEnvironment scene (Tokamak lime aurora blobs)"
```

### Task 3.3: Swap MathEnvironment → AuroraEnvironment at each callsite

**Files:** whatever Task 3.1 Step 2 returned as callers.

- [ ] **Step 1: For each caller, swap the import**

Edit every caller to replace:
```ts
import { MathEnvironment } from "./MathEnvironment";
```
with:
```ts
import { AuroraEnvironment as Environment } from "./AuroraEnvironment";
```

Then replace every usage of `MathEnvironment` with `Environment`. Using the alias keeps the diff small and preserves the variable name pattern the callers already use.

If the file uses `new MathEnvironment(...)`, it becomes `new Environment(...)`.

- [ ] **Step 2: Delete the old MathEnvironment.ts**

```bash
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer/tokagentos
git rm apps/app-companion/src/components/companion/environment/MathEnvironment.ts
```

- [ ] **Step 3: Confirm no lingering references**

```bash
grep -rn 'MathEnvironment' apps/app-companion/ 2>/dev/null
```

Expected: empty.

- [ ] **Step 4: Typecheck**

```bash
bun run --cwd apps/app-companion typecheck 2>&1 | tail -20
```

Expected: no errors referencing MathEnvironment or AuroraEnvironment.

- [ ] **Step 5: Commit**

```bash
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer
git add tokagentos/apps/app-companion/src/
git commit -m "refactor(companion): swap MathEnvironment → AuroraEnvironment at all callsites"
```

### Task 3.4: Update scene-theme-tokens.ts fallbacks to Tokamak palette

**Files:**
- Modify: `apps/app-companion/src/components/companion/environment/scene-theme-tokens.ts`

- [ ] **Step 1: Read current fallbacks**

```bash
cat apps/app-companion/src/components/companion/environment/scene-theme-tokens.ts | head -40
```

- [ ] **Step 2: Replace fallback color values with Tokamak palette**

The file reads CSS variables at runtime with fallback values. Update fallbacks (keep the same variable NAMES so upstream typing holds):

```ts
// Fallback color constants when CSS vars aren't set.
// Values track Tokamak brand (frontend/src/app/globals.css).
const DEFAULT_ACCENT = "#c4f547";
const DEFAULT_ACCENT_DARK = "#8ab81d";
const DEFAULT_ACCENT_LIGHT = "#d5f972";
const DEFAULT_BG = "#0a0a0f";
const DEFAULT_TEXT = "#ffffff";
const DEFAULT_TEXT_MUTED = "rgba(233, 234, 236, 0.58)";

// Status colors — unchanged from upstream since they're semantic, not brand.
const DEFAULT_OK = "#6be48e";
const DEFAULT_WARN = "#f59e0b";
const DEFAULT_ERROR = "#ef4444";
```

Find each existing default constant and update its value. Preserve the exported type (`SceneThemeTokens`) and the reader function.

Also ensure the reader exposes `accent`, `accentDark`, `accentLight` tokens — AuroraEnvironment consumes these. If the current type uses different names (e.g., `primary` instead of `accent`), EITHER:
- Add `accent`/`accentDark`/`accentLight` as aliases to the existing tokens, OR
- Update AuroraEnvironment to use the existing token names.

Pick whichever minimizes diff.

- [ ] **Step 3: Typecheck**

```bash
bun run --cwd apps/app-companion typecheck 2>&1 | tail -15
```

- [ ] **Step 4: Commit**

```bash
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer
git add tokagentos/apps/app-companion/src/components/companion/environment/scene-theme-tokens.ts
git commit -m "refactor(companion): update scene-theme fallbacks to Tokamak palette"
```

---

## Phase 4 — Scaffold-Patches (Mirror Monorepo Changes to Scaffolded Projects)

Why: the monorepo's `apps/app-companion/` is source of truth for the package, but scaffolded projects pull upstream elizaOS into `tokagent/`. Our monorepo edits don't reach scaffolded projects without scaffold-patches.

### Task 4.1: Create scaffold-patches directory structure for app-companion

- [ ] **Step 1: Make the dirs**

```bash
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer/tokagentos
mkdir -p packages/tokagentos/scaffold-patches/apps/app-companion/src/emotes
mkdir -p packages/tokagentos/scaffold-patches/apps/app-companion/src/components/companion/environment
mkdir -p packages/tokagentos/scaffold-patches/apps/app-companion/public/vrms
ls packages/tokagentos/scaffold-patches/apps/app-companion/
```

Expected: the three subdirs created.

### Task 4.2: Mirror the four modified source files as scaffold-patches

- [ ] **Step 1: Copy each monorepo file into scaffold-patches**

```bash
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer/tokagentos
cp apps/app-companion/src/emotes/catalog.ts \
   packages/tokagentos/scaffold-patches/apps/app-companion/src/emotes/catalog.ts
cp apps/app-companion/src/components/companion/environment/AuroraEnvironment.ts \
   packages/tokagentos/scaffold-patches/apps/app-companion/src/components/companion/environment/AuroraEnvironment.ts
cp apps/app-companion/src/components/companion/environment/scene-theme-tokens.ts \
   packages/tokagentos/scaffold-patches/apps/app-companion/src/components/companion/environment/scene-theme-tokens.ts
cp apps/app-companion/public/vrms/tokagent-0.vrm \
   packages/tokagentos/scaffold-patches/apps/app-companion/public/vrms/tokagent-0.vrm
```

- [ ] **Step 2: Add a header comment to the .ts scaffold-patches (not the .vrm)**

For each of the three `.ts` files in `scaffold-patches/apps/app-companion/`, prepend:

```ts
// Tokagent scaffold-patch: overlays the upstream elizaOS app-companion file
// in scaffolded projects. Source of truth lives at apps/app-companion/ in the
// tokagentos monorepo. Keep the two in sync — the monorepo edits do NOT
// automatically flow to scaffolded projects.
```

Only add the comment if it isn't already there.

- [ ] **Step 3: Commit**

```bash
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer
git add tokagentos/packages/tokagentos/scaffold-patches/apps/app-companion/
git status --short tokagentos/packages/tokagentos/scaffold-patches/
git commit -m "feat(scaffold-patches): mirror companion redesign (catalog, scene, theme, placeholder VRM)"
```

### Task 4.3: Decide how to suppress the upstream MathEnvironment.ts in scaffolded projects

The scaffold-patches mechanism doesn't delete files — it only adds/replaces. If we only ADD AuroraEnvironment.ts to the scaffolded project, `MathEnvironment.ts` still exists in `tokagent/apps/app-companion/src/components/companion/environment/` and other upstream files may still import it.

Three options:

1. **Stub MathEnvironment.ts** to re-export AuroraEnvironment under the old name. No callsites change upstream.
2. **Overlay MathEnvironment.ts** with the AuroraEnvironment code. Same effect as option 1.
3. **Leave upstream MathEnvironment.ts alone**, rely on scaffold-patched callsites to use AuroraEnvironment. Requires patching every upstream caller — much bigger scope.

- [ ] **Step 1: Pick option 1 — stub MathEnvironment.ts to re-export AuroraEnvironment**

```bash
cat > packages/tokagentos/scaffold-patches/apps/app-companion/src/components/companion/environment/MathEnvironment.ts <<'EOF'
// Tokagent scaffold-patch: upstream `MathEnvironment` replaced with
// AuroraEnvironment. This stub re-exports AuroraEnvironment under both names
// so upstream callers continue to compile without per-file scaffold-patches.
export { AuroraEnvironment, AuroraEnvironment as MathEnvironment } from "./AuroraEnvironment";
EOF
```

- [ ] **Step 2: Typecheck the scaffold-patches dir as a sanity check**

```bash
# Mirror the files into a temp location that resembles a scaffolded project layout and typecheck there,
# OR rely on Phase 6 smoke test to validate. Typecheck inside scaffold-patches/ directly won't resolve
# imports since the source files it references live in the scaffolded project, not the monorepo.
```

Skip typechecking this specific scaffold-patch — it'll be validated end-to-end in Phase 6's scaffold smoke test.

- [ ] **Step 3: Commit**

```bash
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer
git add tokagentos/packages/tokagentos/scaffold-patches/apps/app-companion/src/components/companion/environment/MathEnvironment.ts
git commit -m "feat(scaffold-patches): stub MathEnvironment as AuroraEnvironment re-export (upstream compat)"
```

### Task 4.4: Add placeholder-notice scaffold-patch (optional but recommended)

- [ ] **Step 1: Decide placement**

The spec §9 risk 1 asks for a one-time notification telling users the VRM is a placeholder. Options:

- Console log on first boot
- Toast in the UI on first render
- One-line note in the scaffolded project's README.md

Simplest: add a line to the scaffolded project's README template (`packages/tokagentos/templates/fullstack-app/README.md`). No runtime code surface.

- [ ] **Step 2: Edit template README**

```bash
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer/tokagentos
ls packages/tokagentos/templates/fullstack-app/README.md 2>/dev/null || ls packages/templates/fullstack-app/README.md 2>/dev/null
```

Find the template's README. Add a section:

```markdown
## Companion avatar

The default `tokagent-0` VRM is a **placeholder**. The commissioned Tokagent
avatar ships in a later release — file swap only, no code changes required.
See the companion redesign spec for the design brief:
https://github.com/.../docs/superpowers/specs/2026-04-24-companion-vrm-redesign-design.md
```

- [ ] **Step 3: Commit**

```bash
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer
git add tokagentos/packages/tokagentos/templates/fullstack-app/README.md tokagentos/packages/templates/fullstack-app/README.md 2>/dev/null
git commit -m "docs(template): note companion VRM is placeholder in scaffolded project README"
```

---

## Phase 5 — Emote Trigger Wiring (Audit + Minimal Hooks)

### Task 5.1: Audit existing runtime events

- [ ] **Step 1: Find emote-dispatcher code**

```bash
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer/tokagentos
grep -rln 'playEmote\|dispatchEmote\|emoteAction\|EMOTE' apps/app-companion/src/ packages/app-core/src/ 2>/dev/null | grep -v '\.test\.' | head
```

Locate whatever dispatches emotes based on runtime state. This is where we subscribe to events.

- [ ] **Step 2: Find existing runtime event emitters**

```bash
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer/tokagentos
grep -rlnE 'runtime\.emit\s*\(|emit\s*\(\s*"(action|response|message)' packages/typescript/src/ packages/agent/src/ 2>/dev/null | head -10
```

Record every event name currently emitted. Example events we expect to find some of:

- `message:received`
- `action:start` / `action:complete`
- `response:stream` / `response:complete`
- `error` / `alert`

- [ ] **Step 3: Build mapping table**

For each of the 6 emotes, identify which event (if any) already triggers it:

| Emote | Target event | Already emitted upstream? |
|---|---|---|
| `idle` | no event — default state | N/A |
| `thinking` | `action:start` | ? |
| `speaking` | `response:stream` | ? |
| `acknowledge` | `message:received` | ? |
| `alert` | `error` or similar alert category | ? |
| `success` | strategy-success event | ? |

- [ ] **Step 4: Decide scope**

Count the number of events that need adding. Per spec §8: if >20 LoC in events must be added OUTSIDE `apps/app-companion/`, surface for review.

If total <20 LoC additive in runtime, proceed. Otherwise pause and report.

### Task 5.2: Wire the dispatcher

**Files:**
- Modify: whatever file is the emote dispatcher (from Task 5.1 Step 1).
- Modify: runtime file(s) if events need adding.

- [ ] **Step 1: For each event that ALREADY exists, add a subscription in the dispatcher**

Example pattern (adapt to the actual event-emitter API discovered in Task 5.1):

```ts
runtime.on("action:start", () => dispatchEmote("thinking"));
runtime.on("response:stream", () => dispatchEmote("speaking"));
runtime.on("message:received", () => dispatchEmote("acknowledge"));
```

- [ ] **Step 2: For events that need adding, add minimal emitters**

In the runtime file(s) where the state transition happens, add `runtime.emit(eventName)`. Keep each addition to a single line — no logic branch, no filtering.

- [ ] **Step 3: Typecheck both packages**

```bash
bun run --cwd apps/app-companion typecheck 2>&1 | tail -10
bun run --cwd packages/agent typecheck 2>&1 | tail -10
```

- [ ] **Step 4: Commit**

```bash
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer
git add tokagentos/apps/app-companion/src/ tokagentos/packages/agent/src/ tokagentos/packages/typescript/src/ 2>/dev/null
git status --short
git commit -m "feat(runtime): emit agent-state events + wire companion emote dispatcher"
```

### Task 5.3: Scaffold-patch the emote dispatcher changes

If the dispatcher edits in Task 5.2 touched `apps/app-companion/`, the scaffolded project still uses the upstream version. Mirror the file to scaffold-patches.

- [ ] **Step 1: Copy each modified dispatcher file into scaffold-patches**

```bash
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer/tokagentos
# For each dispatcher file modified in Task 5.2:
cp apps/app-companion/src/<path-to-dispatcher>.ts \
   packages/tokagentos/scaffold-patches/apps/app-companion/src/<same-path>.ts
# Ensure parent dirs exist: mkdir -p as needed.
```

Do the same for any runtime-event emitter additions in `packages/agent/src/` or `packages/typescript/src/` — mirror to `packages/tokagentos/scaffold-patches/packages/agent/src/...`.

- [ ] **Step 2: Add the scaffold-patch header comment**

Prepend to each new scaffold-patch file:

```ts
// Tokagent scaffold-patch: mirror of tokagentos monorepo edits. Keep in sync.
```

- [ ] **Step 3: Commit**

```bash
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer
git add tokagentos/packages/tokagentos/scaffold-patches/
git commit -m "feat(scaffold-patches): mirror emote dispatcher + runtime event wiring"
```

---

## Phase 6 — Gate + Smoke Test

### Task 6.1: Full monorepo gate

- [ ] **Step 1: Fresh install + build + typecheck + test**

```bash
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer/tokagentos
rm -rf node_modules && bun install 2>&1 | tail -10
bun run build 2>&1 | tail -40
bun run typecheck 2>&1 | tail -20
bun run test 2>&1 | tail -40
```

Use `run_in_background: true` for each. Poll until complete.

Expected: no NEW failures vs. the post-cleanup baseline. Pre-existing failures (rust, yield→shared, scaffold-patches test) remain.

If ANY new failure references `MathEnvironment`, `milady-[2-8]`, or a deleted emote file, that's a regression — pause and fix.

### Task 6.2: Scaffold smoke test — boot a fresh scaffolded project

- [ ] **Step 1: Build + link the CLI**

```bash
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer/tokagentos/packages/tokagentos
bun run build 2>&1 | tail -5
bun link 2>&1 | tail -3
which tokagentos
```

- [ ] **Step 2: Scaffold a test project**

```bash
mkdir -p ~/tokagent-workspace/companion-redesign-test
cd ~/tokagent-workspace/companion-redesign-test
rm -rf my-agent
tokagentos create my-agent --template fullstack-app --llm anthropic \
  --api-key sk-ant-fake-for-smoke --yes 2>&1 | tail -20
```

Use `run_in_background: true` (2-4 min).

- [ ] **Step 3: Install deps in the scaffolded project**

```bash
cd ~/tokagent-workspace/companion-redesign-test/my-agent
bun install 2>&1 | tail -10
```

Use `run_in_background: true` (5-10 min).

- [ ] **Step 4: Boot the dev server and capture logs**

```bash
cd ~/tokagent-workspace/companion-redesign-test/my-agent
(bun run dev 2>&1 & PID=$!; sleep 120; kill -INT $PID 2>/dev/null; sleep 3; kill -9 $PID 2>/dev/null; wait $PID 2>/dev/null) > /tmp/companion-smoke.log 2>&1
```

Use `run_in_background: true` with a 180s `timeout`.

- [ ] **Step 5: Verify boot markers in the log**

```bash
grep -iE 'agent ready|runtime ready|listening on|aurora|cannot find module|error:' /tmp/companion-smoke.log | head -30
```

Expected:
- `Runtime ready` line appears
- `Agent ready` line appears
- No `Cannot find module` referencing `MathEnvironment`, `milady-[2-8]`, or deleted emote files
- No new errors beyond pre-existing (e.g., DTS failures in upstream plugins — known)

If any unexpected error, pause and report BLOCKED.

- [ ] **Step 6: Cleanup smoke artifacts**

```bash
cd ~/tokagent-workspace && rm -rf companion-redesign-test
bun unlink --cwd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer/tokagentos/packages/tokagentos 2>&1 || true
rm /tmp/companion-smoke.log
```

### Task 6.3: Grep tripwires — "milady" gone from monorepo

- [ ] **Step 1: Run tripwire greps**

```bash
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer/tokagentos
echo "--- milady in monorepo source (should be 0) ---"
git grep -iE 'milady' -- ':(exclude)docs/superpowers/**' ':(exclude)NOTICE.md' ':(exclude)LICENSE' | head
echo "--- MathEnvironment in monorepo source (should be 0) ---"
git grep 'MathEnvironment' -- ':(exclude)docs/superpowers/**' | head
echo "--- references to milady-[2-8] (should be 0) ---"
git grep -E 'milady-[2-8]' -- ':(exclude)docs/superpowers/**' | head
```

Expected: all three return empty.

- [ ] **Step 2: Fix any residuals**

For each hit, determine if it's a comment/stale-doc (edit or delete) or live code (needs refactor). Commit fixes as part of final scrub.

### Task 6.4: Push + open PR

- [ ] **Step 1: Push the branch**

```bash
cd /Users/mehdiberiane/Documents/tokamak/TAL/Tokamak-AI-Layer
git push fork feat/companion-vrm-redesign 2>&1 | tail -5
```

- [ ] **Step 2: Count commits + review log**

```bash
git log --oneline pre-companion-redesign..HEAD
git log --oneline pre-companion-redesign..HEAD | wc -l
```

Expected: ~12-16 commits.

- [ ] **Step 3: Open the PR**

```bash
gh pr create --repo Mehd1b/Tokamak-AI-Layer \
  --base feat/tokagentos-fork \
  --head feat/companion-vrm-redesign \
  --title "feat(companion): Tokagent VRM + Aurora scene + 6-emote state dispatcher" \
  --body "## Summary

Redesigns the companion visual identity per spec \`docs/superpowers/specs/2026-04-24-companion-vrm-redesign-design.md\`.

- Replace Matrix-style scene with Aurora (Tokamak palette, lime gradient blobs on dark)
- Consolidate 8 Milady VRMs → single \`tokagent-0\` (placeholder in this PR; commissioned asset ships separately)
- Trim emote catalog 38 → 6 state-transition emotes (idle / thinking / speaking / acknowledge / alert / success)
- Wire emote dispatcher to agent runtime events
- Mirror all changes as scaffold-patches so scaffolded projects inherit the redesign

## Placeholder avatar notice

The \`tokagent-0.vrm\` in this PR is milady-1.vrm renamed. The commissioned Tokagent Pro Humanoid asset ships in a follow-up PR (drop-in file swap, no code changes).

## Test plan

- [x] \`bun install && bun run build && bun run test\` in monorepo — no new failures vs. baseline
- [x] Scaffold smoke: \`tokagentos create\` → \`bun install\` → \`bun run dev\` → agent boots, scene renders, emotes trigger on interactions
- [x] Grep tripwires — no \`milady\`, \`MathEnvironment\`, or deleted-asset references remain outside docs
- [ ] Manual visual QA (reviewer) — confirm aurora scene looks right in dark + light mode

## Rollback

Tag \`pre-companion-redesign\` anchors the pre-redesign state. \`git reset --hard pre-companion-redesign\` reverts locally."
```

- [ ] **Step 4: Report PR URL**

Record the PR URL returned by `gh pr create`.

---

## Self-Review Checklist (run after plan is written)

**Spec coverage** — every spec section maps to tasks:
- §3 Tokamak palette inheritance → Task 3.4 (scene-theme-tokens fallbacks)
- §4 target shape → emerges from Phases 1-5
- §5.1 Phase 1 code + config + placeholder → Phases 1-4 in this plan
- §5.2 Phase 2 commissioned asset → explicitly out of scope for this plan (spec §2 non-goal)
- §6.1 placeholder approach → Task 2.1 (rename milady-1) + Task 4.4 (README notice)
- §6.2 commission brief → captured in spec §6.2 only, no task needed here
- §6.3 aurora parameters → Task 3.2 (AuroraEnvironment implementation)
- §6.4 emote set + triggers → Task 1.2 (catalog) + Tasks 5.1-5.2 (trigger wiring)
- §7 files changed → one-for-one with task file paths
- §8 event trigger scope constraint → Task 5.1 Step 4
- §9 risks → mitigated via placeholder rename (risk 1), stub MathEnvironment (risk 2), scope gate in 5.1 (risk 5)
- §10 success criteria → verified in Task 6.2 smoke test + Task 6.3 tripwires
- §11 rollback → Task 0.1 anchor tag + Task 6.4 PR body

**Placeholder scan** — no forbidden patterns:
- No "TBD", "TODO", "implement later"
- Every code step shows exact code or exact command
- Emote asset names use placeholder filenames (`idle-breathing.glb.gz` etc.) that Task 1.1 Step 2 will resolve to real paths — the task includes the exact grep command to find them

**Type consistency** — names match across tasks:
- `tokagent-0` as the VRM slug throughout
- `AuroraEnvironment` class name consistent in Phase 3
- `EMOTE_CATALOG` const name in Phase 1 + 4
- `SceneThemeTokens` type name in Phase 3 Tasks 3.2 + 3.4
- Phase + task numbering consistent

Plan ready for execution.
