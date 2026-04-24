# Companion VRM / Avatar Redesign — Design

**Date:** 2026-04-24
**Scope:** `apps/app-companion/` and related scaffold-patches. Touches upstream eliza files (`packages/app-core/src/components/cloud/*` is unrelated; this spec only touches companion-specific files).
**Status:** Approved for plan-writing.

## 1. Purpose

The Tokagent companion currently ships with 8 Milady-style anime VRM characters, a Matrix-themed procedural scene, and a 38-entry emote catalog built for social-companion use. This inherited elizaOS vocabulary doesn't fit a DeFi trading tool: anime dances and cloud-service mascot energy undermine the product's "professional DeFi operator" positioning.

This redesign replaces the companion's visual identity with one that inherits Tokamak Network's brand (dark base + lime accent + glass-blur aesthetic), presents a single Pro-Humanoid canonical character, and trims the emote set to agent-state transitions only.

## 2. Non-Goals

- Voice / TTS integration with the character (TTS was already removed in the cleanup).
- Multi-character / multi-agent presentation — single agent, single character.
- Per-user avatar customization — the character is brand-canonical.
- Outfit / time-of-day / seasonal variants.
- Accessibility "no-avatar" mode (can come later if requested; not blocking).
- Commission workflow — the spec declares WHAT the asset should look like; procurement is a separate operational track.

## 3. Inherited Brand — Tokamak Network

The Tokagent companion inherits the Tokamak brand as defined in `frontend/src/app/globals.css` + `frontend/tailwind.config.ts` at the repo root:

| Token | Value | Role |
|---|---|---|
| `--tokagent-bg-primary` | `#0a0a0f` | Base background, dark mode |
| `--tokagent-bg-panel` | `#111118` | Elevated panels |
| `--tokagent-accent` | `#c4f547` | Signature lime — character rim-light, aurora centers, interactive accents |
| `--tokagent-accent-dark` | `#8ab81d` | Aurora edges, secondary |
| `--tokagent-accent-light` | `#d5f972` | Aurora highlights |
| `--tokagent-text` | `#ffffff` | Primary text on dark |
| `--tokagent-text-muted` | `rgba(233,234,236,0.58)` | Secondary text |

Aesthetic markers: glass-blur panels (`backdrop-blur-xl`), rounded-xl corners, primary glow on active elements, `aurora-shift` / `float-up` / `morph-blob` ambient animations, gradient text (`linear-gradient(90deg, #8ab81d, #c4f547)`).

## 4. Target Shape

A scaffolded Tokagent project boots with:

- **One** canonical VRM character, slug `tokagent-0`, title "Tokagent".
- **Pro Humanoid** style: realistic proportions, business-tech attire, serious demeanor, gender-neutral.
- **Aurora** ambient scene — three overlapping lime-variant gradient blobs on a dark base, slow 12–20s drift. No grid. No screen panels.
- **Six emotes** wired to runtime state: `idle` / `thinking` / `speaking` / `acknowledge` / `alert` / `success`.
- **Avatar picker UI auto-hides** — single catalog entry means nothing to pick.

## 5. Phasing

### Phase 1 — Code + config + placeholder (this spec)

- Replace the Three.js scene renderer with Aurora implementation.
- Trim emote catalog from 38 entries to 6; delete unused animation files.
- Reduce character catalog to single `tokagent-0` entry; delete 7 legacy Milady VRMs.
- Apply Tokamak palette via CSS variables; add scaffold-patch if scaffolded project's root styles don't already inherit.
- **Placeholder VRM** at `apps/app-companion/public/vrms/tokagent-0.vrm` (see §6.1 for placeholder strategy).
- Wire 6 emote triggers to agent runtime events (implementation plan will scope minimal event-hook additions where runtime doesn't already emit).

### Phase 2 — Real commissioned asset (parallel track, out of this spec)

- Commission or license the actual Tokagent Pro Humanoid VRM per §6.2 brief.
- Drop the real asset in at `tokagent-0.vrm`, replacing the placeholder.
- No code changes — just asset swap.

Phase 2 can proceed in parallel with Phase 1 implementation. Phase 1 ships without waiting on Phase 2.

## 6. Visual Spec

### 6.1 Placeholder VRM (Phase 1)

**Candidate approaches** (implementation plan picks one):

1. **Recolor `milady-1.vrm` → `tokagent-0.vrm`**: rename, recolor in Blender/UniVRM to dark + lime palette. Cheapest. Risk: still reads as anime, which misrepresents the final product.
2. **Ready Player Me quick export**: generate a generic Pro Humanoid avatar, convert glTF → VRM. Cheap, quick, reads as professional, but generic.
3. **Voxel-style blocky humanoid**: a clearly-not-final cube-person with a lime stripe. Reads as "placeholder" at a glance, which is what we want.

**Recommendation**: option 3 (voxel blocky). Explicit placeholder signalling prevents users from mistaking the Milady-reskin for the finished product. The implementation plan picks and sources.

A one-time scaffold notification (console log or onboarding tile) tells users the character is a placeholder and the commissioned asset ships later.

### 6.2 Real commissioned character (Phase 2)

Brief for 3D artist / vendor:

| Property | Requirement |
|---|---|
| Form | Humanoid, realistic proportions, adult |
| Stylization | Pro / business-tech. Not anime, not hyperrealistic. Figma / Linear / Stripe illustration style translated to 3D. |
| Attire | Dark base (navy / charcoal / black) with ONE lime `#c4f547` accent detail — lapel pin, tie, single stripe, or lit-up accessory. Single anchor point, not full-body lime. |
| Demeanor | Calm, competent, serious. Not cute, not playful, not aggressive. |
| Gender presentation | Androgynous / gender-neutral preferred (artist discretion, not prescriptive) |
| Pose | Neutral standing, idle-ready |
| Rig | VRM 1.0 spec, Mixamo humanoid skeleton compatible (for reuse of the 6 emote animations) |
| Size | <5 MB `.vrm` file, gzip-compatible |
| Usage | Web-only target; no mobile/AR constraints |

### 6.3 Aurora scene parameters

Replaces the current `MathEnvironment.ts` Matrix scene (purple + neon-green grid + 13 translucent screen panels).

- **Composition**: three radial-gradient blobs using `--tokagent-accent` / `--tokagent-accent-dark` / `--tokagent-accent-light`.
- **Dark mode**: blobs at 15–20% opacity on `#0a0a0f` base.
- **Light mode**: blobs at 5% opacity on near-white base (maintains parity, barely visible).
- **Motion**: 12–20s loop of position offset per blob. Drift only — no pulse, no breathing.
- **Depth**: character at Y=0. Aurora behind at Z<0. No foreground.
- **No grid, no screen panels, no particles.**
- **Performance target**: <2% GPU utilization for the scene alone (current Matrix scene ~5–8%).

Implementation plan picks rendering strategy — pure CSS layer, WebGL shader, or Three.js sprites.

### 6.4 Emote set (6 entries)

| Emote | Played when |
|---|---|
| `idle` | Default state, no agent activity |
| `thinking` | Agent is running an action / tool call (`runtime.on('action:start')`) |
| `speaking` | Agent is streaming a response (`runtime.on('response:stream')`) |
| `acknowledge` | User message received (`runtime.on('message:received')`) |
| `alert` | Error, rate-limit, strategy paused, low balance — alert category event |
| `success` | Strategy executed, vault deployed, milestone reached — success category event |

**Source**: pick 6 appropriate Mixamo animations from the existing 38 or license new ones. Mixamo humanoid rig is compatible with VRM 1.0.

**Deleted**: 32 animation files (`.glb`, `.fbx`, `.gz`) across greetings (6), emotions (except those remapped to alert/success), dances (7), gestures (most), other (1). Saves ~30–50 MB disk.

## 7. Files Changed

| Path | Change | Notes |
|---|---|---|
| `apps/app-companion/public/vrms/milady-{2..8}.{vrm,png}` | Delete | 7 legacy VRMs + preview/background PNGs |
| `apps/app-companion/public/vrms/milady-1.*` | Delete | Replaced by placeholder |
| `apps/app-companion/public/vrms/tokagent-0.vrm` | Create | Placeholder in Phase 1, commissioned in Phase 2 |
| `apps/app-companion/public/vrms/tokagent-0.vrm.gz` | Create (build-time) | Gzipped variant served at runtime |
| `apps/app-companion/src/components/companion/environment/MathEnvironment.ts` | Replace with `AuroraEnvironment.ts` | ~100–150 LoC vs current ~400 |
| `apps/app-companion/src/components/companion/environment/scene-theme-tokens.ts` | Update fallback color constants to Tokamak palette |
| `apps/app-companion/src/emotes/catalog.ts` | Trim from 38 to 6 entries |
| `apps/app-companion/src/emotes/*.{glb,fbx,gz}` | Delete ~32 files | Keep only files for the 6 kept emotes |
| `packages/templates/fullstack-app/config/app-boot-config.ts` (or template equivalent) | Confirm `vrmAssets: [{ title: "Tokagent", slug: "tokagent-0" }]` — already correct per earlier exploration |
| `packages/tokagentos/scaffold-patches/packages/app-core/src/state/vrm.ts` | Add patch if upstream default catalog has >1 entry |
| Scaffolded project CSS root (`apps/app/src/**/globals.css` or template) | Ensure Tokamak palette CSS vars are defined — scaffold-patch if missing |

Expected diff: large file count, small conceptual complexity. Mostly replacement / deletion.

## 8. Emote Trigger Event Scoping

Some triggers in §6.4 depend on runtime events that may not currently be emitted. The implementation plan:

1. Audits the agent runtime (`packages/agent/src/runtime/*`) for existing event emitters matching each trigger.
2. For missing events: adds minimal emitter hooks in the runtime, keeping the interface stable (not a runtime refactor).
3. Wires the emote dispatcher in `apps/app-companion/src/` to subscribe to each.

**Scope constraint**: if implementing a trigger requires >20 LoC added outside `apps/app-companion/`, the implementation plan flags it as a scope extension and surfaces for review before landing.

## 9. Risks & Mitigations

| # | Risk | Mitigation |
|---|---|---|
| 1 | Placeholder VRM misleads users into thinking Milady-reskin is the final product | Pick an obviously-placeholder asset (voxel blocky humanoid per §6.1). One-time scaffold notification: "companion is placeholder; real asset ships in Phase 2." |
| 2 | Upstream MathEnvironment.ts drifts — we can't auto-inherit improvements | Accept. Same scaffold-patch tradeoff as the rest of the cleanup. |
| 3 | Aurora scene feels sparse vs the removed Matrix panels | Watch user feedback. If it feels empty, iterate by adding a subtle Tokamak logo-mark glyph in a corner. Don't preemptively over-design. |
| 4 | 6-emote set too minimal for complex agent state | Start with 6. Add emotes only if specific UX gaps surface in usage. Preserves "don't animate needlessly" principle. |
| 5 | Emote triggers depend on runtime events that don't exist | Implementation plan audits first; flags if adding events requires >20 LoC outside `apps/app-companion/`. |
| 6 | Tokamak palette CSS vars don't propagate to scaffolded project root | Scaffold-patch ensures vars are defined at root. Verified in Phase 1 smoke test. |
| 7 | Commissioned asset (Phase 2) slips or doesn't match brief | Phase 1 ships independently. If Phase 2 slips, the placeholder remains — no release blocker. |

## 10. Success Criteria

Phase 1 is complete when:

1. A scaffolded project (`tokagentos create my-agent`) boots in `bun run dev` and shows the Aurora scene with the placeholder VRM visible and animating.
2. The avatar picker UI does not render in Settings (single-entry catalog hides it).
3. The companion plays `idle` on boot; playing messages/actions triggers `thinking` / `speaking` / `acknowledge` as defined.
4. Zero references to "milady" remain in `apps/app-companion/`.
5. The 6 retained emote files are present; the 32 removed files are gone from the working tree.
6. Phase-0 `bun run build` / `typecheck` pass with no new errors introduced by the redesign.
7. Runtime smoke test: scaffolded project boots, companion renders, click through Chat tab and verify emotes trigger on interactions.

Phase 2 (parallel track) is complete when the commissioned asset replaces the placeholder — a drop-in file swap.

## 11. Rollback

Scaffold-patches are new files; revert per-commit.
Deleted files (7 Milady VRMs, 32 emote animations) are recoverable from git history.
Aurora scene replaces MathEnvironment.ts — revert via `git revert` of that commit.
Placeholder VRM is a scaffold artifact; remove file + config line.

Tag `pre-companion-redesign` (to be set at Phase 0 of the implementation plan) anchors the pre-redesign state for one-shot rollback.

## 12. Open Questions for Plan Stage

Deferred to the implementation plan:

1. **Placeholder VRM sourcing** — which of the three approaches in §6.1 (recolor Milady, RPM export, voxel blocky)? Plan should pick one.
2. **Aurora rendering technology** — pure CSS layer, WebGL shader, or Three.js sprites? Depends on how easily it integrates with the existing companion-scene plumbing.
3. **CSS variable delivery path** — does the scaffolded project's root already inherit Tokamak tokens via some upstream-override mechanism, or do we need a fresh scaffold-patch for `globals.css`?
4. **Runtime event audit result** — which of the 6 emote triggers already have emitters, which need adding, what's the total LoC delta?
5. **Emote file selection** — which specific Mixamo animations (from the current 38 or new ones) map cleanest to the 6 states?
6. **Scaffold notification UX** — where does the "placeholder avatar" notice render? Console log, onboarding tile, settings notice? Pick one.
