# Homebrew Distribution

This directory contains Homebrew formula and cask definitions for tokagentOS App.

## Files

- `tokagentos-app.rb` — Formula for the CLI tool (installed via npm)
- `tokagentos-app.cask.rb` — Cask for the desktop app (DMG installer)

## Setup

### 1. Create Homebrew Tap Repository

Create a new repo: `tokagentos/homebrew-tokagentos-app`

Structure:
```
homebrew-tokagentos-app/
├── Formula/
│   └── tokagentos-app.rb
├── Casks/
│   └── tokagentos-app.cask.rb
└── README.md
```

### 2. Update SHA256 Hashes

Before publishing, replace placeholder hashes:

**For the cask (DMG files):**
```bash
# Download and hash ARM64 DMG
curl -sL https://github.com/tokagentos/tokagentos-app/releases/download/v2.0.0-alpha.21/TokagentOSApp-2.0.0-alpha.21-arm64.dmg | shasum -a 256

# Download and hash Intel DMG
curl -sL https://github.com/tokagentos/tokagentos-app/releases/download/v2.0.0-alpha.21/TokagentOSApp-2.0.0-alpha.21.dmg | shasum -a 256
```

**For the formula (npm tarball):**
```bash
curl -sL https://registry.npmjs.org/tokagentos/-/tokagentos-2.0.0-alpha.21.tgz | shasum -a 256
```

### 3. Users Can Install

```bash
# Add tap
brew tap tokagentos/tokagentos-app

# Install desktop app
brew install --cask tokagentos-app

# Or install CLI only
brew install tokagentos-app
```

## Auto-Update Workflow

See the publishing guide at `../PUBLISHING_GUIDE.md` for full instructions.

## Testing Locally

```bash
# Test formula syntax
brew audit --strict tokagentos-app.rb

# Test cask syntax
brew audit --cask --strict tokagentos-app.cask.rb

# Test installation (from local file)
brew install --formula ./tokagentos-app.rb
brew install --cask ./tokagentos-app.cask.rb
```

## Notes

- The cask requires macOS Monterey (12.0) or later
- The formula requires Node.js 22+ (installed as dependency)
- Both support auto-updates via Homebrew's built-in mechanisms
- Desktop app also has built-in auto-update via the native Electrobun updater
