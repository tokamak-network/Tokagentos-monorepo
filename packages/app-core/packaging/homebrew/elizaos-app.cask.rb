# frozen_string_literal: true

# Homebrew Cask for the tokagentOS App desktop app (DMG).
# Use this for the tap's Casks/tokagentos-app.cask.rb entry.
#
# Key fixes from the original:
#   - URL matches actual release asset naming (canary-macos-{arch}-TokagentOSApp-canary.dmg)
#   - App identifier uses ai.tokagentos.app (from actual metadata)
#   - SHA256 for both architectures

cask "tokagentos-app" do
  arch arm: "arm64", intel: "x64"

  version "2.0.0-alpha.84"

  on_arm do
    sha256 "a348cc3c619e8445270e4a2ebfc07c14ec56384893c48452832dadb01d17448b"
  end

  on_intel do
    sha256 "5a40d3a4f9e7a7302cf4f4102ed7dbd81c8cb57083d1ff8b94e167f214d4d9f6"
  end

  url "https://github.com/tokagentos/tokagentos-app/releases/download/v#{version}/canary-macos-#{arch}-TokagentOSApp-canary.dmg",
      verified: "github.com/tokagentos/tokagentos-app/"

  name "tokagentOS App"
  desc "Personal AI assistant — cute agents for the acceleration"
  homepage "https://github.com/tokagentos/tokagentos-app"

  livecheck do
    url "https://github.com/tokagentos/tokagentos-app/releases"
    strategy :github_latest
    regex(/v?(\d+(?:\.\d+)+(?:-[a-z]+\.\d+)?)/i)
  end

  auto_updates true
  depends_on macos: ">= :monterey"

  app "TokagentOSApp.app"

  zap trash: [
    "~/Library/Application Support/TokagentOSApp",
    "~/Library/Caches/ai.tokagentos.app",
    "~/Library/Caches/ai.tokagentos.app.ShipIt",
    "~/Library/Preferences/ai.tokagentos.app.plist",
    "~/Library/Saved Application State/ai.tokagentos.app.savedState",
    "~/.tokagentos-app",
  ]

  caveats <<~EOS
    tokagentOS App desktop app has been installed.

    On first launch, you'll be guided through setup to:
    - Choose your agent's name and personality
    - Connect an AI provider (Anthropic, OpenAI, Ollama, etc.)

    The CLI is also available via: brew install tokagentos-app (without --cask)
  EOS
end
