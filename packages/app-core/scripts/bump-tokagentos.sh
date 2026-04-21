#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# bump-tokagentos.sh — Bump @elizaos/* packages to a target version
#
# Usage:
#   ./scripts/bump-tokagentos.sh <version> [OPTIONS]
#
# Version formats accepted:
#   alpha.54          → normalised to 2.0.0-alpha.54
#   2.0.0-alpha.54    → used as-is
#   54                → normalised to 2.0.0-alpha.54
#
# Options:
#   --no-fix-imports   Skip fixing renamed imports (resolveMiladyVersion etc.)
#   --no-core-check    Skip the @tokagentos/core tarball health check
#   --dry-run          Show what would change without writing files
#   -h, --help         Show this help
#
# What this does:
#   1. Normalises the version to 2.0.0-alpha.{N}
#   2. Updates package.json: pins @tokagentos/agent, @tokagentos/core,
#      @tokagentos/app-core, @tokagentos/app-core, @tokagentos/prompts,
#      @elizaos/sweagent-root to the target version
#   3. Checks if @tokagentos/core at that version ships dist/node/index.node.js
#      (the native node binding needed for production)
#   4. If core is broken at that version, finds the latest working version
#      and sets an override in package.json
#   5. Scans src/ for renamed APIs introduced in alpha.54:
#        resolveMiladyVersion  → resolveTokagentVersion
#        dispatchMiladyEvent   → dispatchTokagentEvent
#        MILADY_*              → TOKAGENT_* (env var references in code)
#      and reports or auto-fixes them
#
# Examples:
#   ./scripts/bump-tokagentos.sh alpha.54
#   ./scripts/bump-tokagentos.sh 2.0.0-alpha.89
#   ./scripts/bump-tokagentos.sh 89 --dry-run
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

log()  { echo -e "${BLUE}[bump]${NC} $*"; }
ok()   { echo -e "${GREEN}[✓]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
err()  { echo -e "${RED}[✗]${NC} $*" >&2; }
hdr()  { echo -e "\n${CYAN}${BOLD}━━━ $* ━━━${NC}"; }
die()  { err "$*"; exit 1; }

# ── Defaults ──────────────────────────────────────────────────────────────────
FIX_IMPORTS=true
CHECK_CORE=true
DRY_RUN=false
RAW_VERSION=""

# ── Parse args ────────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case $1 in
    --no-fix-imports)  FIX_IMPORTS=false; shift ;;
    --no-core-check)   CHECK_CORE=false; shift ;;
    --dry-run)         DRY_RUN=true; shift ;;
    -h|--help)
      grep '^#' "$0" | head -30 | sed 's/^# \?//'
      exit 0 ;;
    -*)
      die "Unknown option: $1 (try --help)" ;;
    *)
      RAW_VERSION="$1"; shift ;;
  esac
done

[[ -z "$RAW_VERSION" ]] && die "Version required. Usage: $0 <version> [options]"

# ── Verify we're in the milaidy-dev repo root ─────────────────────────────────
[[ -f "package.json" ]] || die "package.json not found — run from repo root"
grep -q '"miladyai"' package.json 2>/dev/null || die "This doesn't look like the miladyai repo"

# ── Normalise version ─────────────────────────────────────────────────────────
# Accepts: "54", "alpha.54", "2.0.0-alpha.54"
normalise_version() {
  local v="$1"
  # Pure number → 2.0.0-alpha.N
  if [[ "$v" =~ ^[0-9]+$ ]]; then
    echo "2.0.0-alpha.${v}"
    return
  fi
  # "alpha.N" → 2.0.0-alpha.N
  if [[ "$v" =~ ^alpha\. ]]; then
    echo "2.0.0-${v}"
    return
  fi
  # Already full semver
  if [[ "$v" =~ ^[0-9]+\.[0-9]+\.[0-9]+ ]]; then
    echo "$v"
    return
  fi
  die "Cannot parse version: '${v}'. Try: alpha.54, 2.0.0-alpha.54, or just 54"
}

VERSION=$(normalise_version "$RAW_VERSION")
log "Target version: ${YELLOW}${VERSION}${NC}"
$DRY_RUN && warn "DRY RUN — no files will be modified"

# ── Packages to pin ───────────────────────────────────────────────────────────
# These are the tokagentOS packages that move together in the same release
TOKAGENTOS_PACKAGES=(
  "@tokagentos/agent"
  "@tokagentos/core"
  "@tokagentos/app-core"
  "@tokagentos/app-core"
  "@tokagentos/prompts"
  "@elizaos/sweagent-root"
)

# ─────────────────────────────────────────────────────────────────────────────
# Step 1: Update package.json
# Uses node (guaranteed available — repo requires node 22) to do safe JSON edits
# ─────────────────────────────────────────────────────────────────────────────
hdr "Step 1: Update package.json"

run_pkg_update() {
  local new_ver="$1"
  local core_override="${2:-}"
  local pkgs_json
  pkgs_json="$(printf '"%s",' "${TOKAGENTOS_PACKAGES[@]}" | sed 's/,$//')"

  node << NODEEOF
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const packages = [${pkgs_json}];
const newVersion = '${new_ver}';
const coreOverride = '${core_override}';

const changed = [];

for (const name of packages) {
  if (pkg.dependencies && name in pkg.dependencies) {
    const old = pkg.dependencies[name];
    if (old !== newVersion) {
      pkg.dependencies[name] = newVersion;
      changed.push('  ' + name + ': ' + old + ' → ' + newVersion);
    }
  }
}

if (coreOverride) {
  pkg.overrides = pkg.overrides || {};
  const oldOverride = pkg.overrides['@tokagentos/core'] || '(none)';
  if (oldOverride !== coreOverride) {
    pkg.overrides['@tokagentos/core'] = coreOverride;
    changed.push('  @tokagentos/core override: ' + oldOverride + ' → ' + coreOverride);
  }
} else {
  // Remove stale override if it looks like one we set automatically
  const existing = (pkg.overrides || {})['@tokagentos/core'] || '';
  if (/^2\\.0\\.0-alpha\\./.test(existing)) {
    delete pkg.overrides['@tokagentos/core'];
    changed.push('  @tokagentos/core override: ' + existing + ' → (removed)');
  }
}

if (changed.length === 0) {
  console.log('No changes — packages already at ' + newVersion);
} else {
  console.log('Changes:');
  changed.forEach(c => console.log(c));
  fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
  console.log('package.json written');
}
NODEEOF
}

# Show current state
log "Current tokagentOS versions:"
for pkg in "${TOKAGENTOS_PACKAGES[@]}"; do
  current=$(node -e "const p=require('./package.json'); process.stdout.write((p.dependencies||{})['${pkg}'] || 'not in deps')" 2>/dev/null || echo "?")
  echo "  ${pkg}: ${current}"
done

if $DRY_RUN; then
  warn "[dry-run] Would update all packages above to ${VERSION}"
else
  log "Updating packages to ${VERSION}..."
  # First pass: update all packages, no override yet (override determined after core check)
  run_pkg_update "$VERSION" ""
  ok "package.json updated (first pass)"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Step 2: Check @tokagentos/core tarball health
#
# Some alpha versions of @tokagentos/core don't ship dist/node/index.node.js
# (the native Node.js binding). If it's missing, the runtime crashes on start.
# We check the npm tarball directly and find a fallback if needed.
# ─────────────────────────────────────────────────────────────────────────────
hdr "Step 2: Check @tokagentos/core health"

CORE_OVERRIDE=""

# Returns: "ok", "broken", or "not-published"
check_core_tarball() {
  local ver="$1"
  local tarball_url

  tarball_url=$(npm view "@tokagentos/core@${ver}" dist.tarball 2>/dev/null || echo "")
  if [[ -z "$tarball_url" ]]; then
    echo "not-published"
    return
  fi

  # npm tarballs extract to package/... path
  if curl -sf --max-time 30 "${tarball_url}" | tar -tzf - 2>/dev/null \
      | grep -q "package/dist/node/index\.node\.js"; then
    echo "ok"
  else
    echo "broken"
  fi
}

if $CHECK_CORE; then
  log "Checking @tokagentos/core@${VERSION} tarball for dist/node/index.node.js..."
  CORE_STATUS=$(check_core_tarball "$VERSION")

  case "$CORE_STATUS" in
    ok)
      ok "@tokagentos/core@${VERSION} ✓ (has dist/node/index.node.js)"
      ;;

    broken)
      warn "@tokagentos/core@${VERSION} is MISSING dist/node/index.node.js"
      warn "Finding the latest working @tokagentos/core version..."

      # Get all published 2.0.0-alpha.* versions sorted by alpha number, newest first
      ALL_ALPHA_VERSIONS=$(npm view "@tokagentos/core" versions --json 2>/dev/null \
        | node -e "
          const data = require('fs').readFileSync('/dev/stdin', 'utf8');
          const versions = JSON.parse(data);
          const alphas = versions
            .filter(v => /^2\\.0\\.0-alpha\\.\\d+\$/.test(v))
            .sort((a, b) => {
              const na = parseInt(a.split('alpha.')[1]);
              const nb = parseInt(b.split('alpha.')[1]);
              return nb - na;  // descending
            });
          alphas.forEach(v => console.log(v));
        " 2>/dev/null || echo "")

      WORKING_CORE=""
      CHECKED=0
      MAX_CHECK=25

      log "Scanning up to ${MAX_CHECK} recent versions..."
      while IFS= read -r ver; do
        [[ $CHECKED -ge $MAX_CHECK ]] && break
        [[ "$ver" == "$VERSION" ]] && { CHECKED=$((CHECKED+1)); continue; }
        [[ -z "$ver" ]] && continue

        printf "  Checking %-28s" "${ver}..."
        STATUS=$(check_core_tarball "$ver")
        if [[ "$STATUS" == "ok" ]]; then
          echo -e "${GREEN}✓${NC}"
          WORKING_CORE="$ver"
          break
        else
          echo -e "${RED}✗${NC}"
        fi
        CHECKED=$((CHECKED+1))
      done <<< "$ALL_ALPHA_VERSIONS"

      if [[ -n "$WORKING_CORE" ]]; then
        ok "Latest working @tokagentos/core: ${WORKING_CORE}"
        CORE_OVERRIDE="$WORKING_CORE"
      else
        warn "Could not find a working @tokagentos/core (checked ${CHECKED} versions)"
        warn "You may need to manually pin @tokagentos/core in package.json"
      fi
      ;;

    not-published)
      warn "@tokagentos/core@${VERSION} not found on npm (may not be published yet)"
      warn "Skipping core health check"
      ;;
  esac
else
  warn "Skipping core health check (--no-core-check)"
fi

# Apply core override if needed
if [[ -n "$CORE_OVERRIDE" ]]; then
  warn "@tokagentos/core override needed: ${CORE_OVERRIDE}"
  if ! $DRY_RUN; then
    log "Applying core override to package.json..."
    run_pkg_update "$VERSION" "$CORE_OVERRIDE"
    ok "Override applied: @tokagentos/core → ${CORE_OVERRIDE}"
  else
    warn "[dry-run] Would set override: @tokagentos/core → ${CORE_OVERRIDE}"
  fi
fi

# ─────────────────────────────────────────────────────────────────────────────
# Step 3: Fix known API renames
#
# alpha.54 renamed several APIs. We scan source files and fix them.
#
# Function renames:
#   resolveMiladyVersion → resolveTokagentVersion
#   dispatchMiladyEvent  → dispatchTokagentEvent
#   resolveMiladyAgent   → resolveTokagentAgent
#   getMiladyVersion     → getTokagentVersion
#
# Env var references in source code (not actual .env files):
#   MILADY_API_TOKEN       → TOKAGENT_API_TOKEN
#   MILADY_API_BIND        → TOKAGENT_API_BIND
#   MILADY_BUNDLED_VERSION → TOKAGENT_BUNDLED_VERSION
# ─────────────────────────────────────────────────────────────────────────────
hdr "Step 3: Fix renamed imports and API calls"

# Directories to scan (node_modules + dist excluded at any depth in build_find_cmd)
SCAN_DIRS=("src" "packages" "plugins" "apps")

if $FIX_IMPORTS; then
  # Build the find command with exclusions
  # Key: exclude ANY 'node_modules' or 'dist' directory at any depth
  build_find_cmd() {
    local pattern="$1"
    local search_dirs=()
    for dir in "${SCAN_DIRS[@]}"; do
      [[ -d "$dir" ]] && search_dirs+=("$dir")
    done
    [[ ${#search_dirs[@]} -eq 0 ]] && { echo "echo ''"; return; }
    echo "find ${search_dirs[*]} \
      \( -name 'node_modules' -o -name 'dist' -o -name '.git' -o -name 'coverage' \) -prune -o \
      -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.mjs' \) \
      -exec grep -l '${pattern}' {} \;"
  }

  ISSUES_FOUND=false

  # Function/method renames
  declare -A FUNC_RENAMES=(
    ["resolveMiladyVersion"]="resolveTokagentVersion"
    ["dispatchMiladyEvent"]="dispatchTokagentEvent"
    ["resolveMiladyAgent"]="resolveTokagentAgent"
    ["getMiladyVersion"]="getTokagentVersion"
  )

  for old_name in "${!FUNC_RENAMES[@]}"; do
    new_name="${FUNC_RENAMES[$old_name]}"
    FIND_CMD=$(build_find_cmd "$old_name")
    FILES=$(eval "$FIND_CMD" 2>/dev/null || true)

    if [[ -n "$FILES" ]]; then
      ISSUES_FOUND=true
      echo -e "\n${YELLOW}Found '${old_name}' (rename to '${new_name}'):${NC}"
      while IFS= read -r f; do
        echo "  $f"
        grep -n "$old_name" "$f" | head -3 | sed 's/^/    /'
      done <<< "$FILES"

      if ! $DRY_RUN; then
        while IFS= read -r f; do
          sed -i "s/${old_name}/${new_name}/g" "$f"
        done <<< "$FILES"
        ok "Fixed: ${old_name} → ${new_name}"
      else
        warn "[dry-run] Would replace ${old_name} → ${new_name}"
      fi
    fi
  done

  # Env var references in source code
  # (Only in code strings — not actual .env files or docker-compose.yml)
  declare -A ENV_RENAMES=(
    ["MILADY_API_TOKEN"]="TOKAGENT_API_TOKEN"
    ["MILADY_API_BIND"]="TOKAGENT_API_BIND"
    ["MILADY_BUNDLED_VERSION"]="TOKAGENT_BUNDLED_VERSION"
    ["MILADY_ALLOWED_ORIGINS"]="TOKAGENT_ALLOWED_ORIGINS"
  )

  for old_env in "${!ENV_RENAMES[@]}"; do
    new_env="${ENV_RENAMES[$old_env]}"
    FIND_CMD=$(build_find_cmd "$old_env")
    FILES=$(eval "$FIND_CMD" 2>/dev/null || true)

    if [[ -n "$FILES" ]]; then
      ISSUES_FOUND=true
      echo -e "\n${YELLOW}Found env ref '${old_env}' (rename to '${new_env}'):${NC}"
      while IFS= read -r f; do
        echo "  $f"
        grep -n "$old_env" "$f" | head -3 | sed 's/^/    /'
      done <<< "$FILES"

      if ! $DRY_RUN; then
        while IFS= read -r f; do
          sed -i "s/${old_env}/${new_env}/g" "$f"
        done <<< "$FILES"
        ok "Fixed: ${old_env} → ${new_env}"
      else
        warn "[dry-run] Would replace ${old_env} → ${new_env}"
      fi
    fi
  done

  if ! $ISSUES_FOUND; then
    ok "No renamed APIs found in source — code is clean ✓"
  fi

else
  warn "Skipping import rename check (--no-fix-imports)"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Done
# ─────────────────────────────────────────────────────────────────────────────
hdr "Summary"

echo -e "  Bumped to:   ${GREEN}${VERSION}${NC}"

if [[ -n "$CORE_OVERRIDE" ]]; then
  echo -e "  Core pinned: ${YELLOW}@tokagentos/core → ${CORE_OVERRIDE}${NC} (override in package.json)"
  echo ""
  echo -e "  ${YELLOW}NOTE:${NC} @tokagentos/core@${VERSION} was missing native bindings."
  echo    "  Using ${CORE_OVERRIDE} as the core until it's fixed upstream."
fi

echo ""
echo "  Next steps:"
if $DRY_RUN; then
  echo -e "    ${YELLOW}1. Re-run without --dry-run to apply changes${NC}"
else
  echo "    1. Review:  git diff package.json"
  echo "    2. Install: bun install"
  # Extract alpha number for tag
  ALPHA_NUM="${VERSION##*alpha.}"
  echo "    3. Build:   ./scripts/build-image.sh --tag v${ALPHA_NUM}"
fi
