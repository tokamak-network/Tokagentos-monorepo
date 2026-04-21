# 🥚 Tokagentgotchi - Virtual Pet Game

A Tamagotchi-style virtual pet game running on **tokagentOS** with **NO LLM required**!

![Tokagentgotchi](https://img.shields.io/badge/tokagentOS-Virtual_Pet-FF6B9D?style=for-the-badge)

## 🎮 Features

- **Classic Tamagotchi Gameplay**: Feed, play, clean, sleep, and care for your pet!
- **No LLM Required**: Uses custom model handlers for game logic (like tic-tac-toe example)
- **Life Stages**: Egg → Baby → Child → Teen → Adult → Elder
- **Personality System**: Care quality affects your pet's personality
- **Cute SVG Art**: Pixel-art style graphics with smooth animations
- **Responsive Design**: Works on desktop and mobile

## 🚀 Quick Start

```bash
# From the monorepo root
cd examples/tokagentgotchi

# Install dependencies
bun install

# Start the dev server
bun run dev
```

Open http://localhost:5174 in your browser!

## 🎯 How to Play

| Action          | Description                             |
| --------------- | --------------------------------------- |
| 🍔 **Feed**     | Keep your pet fed. Don't overfeed!      |
| 🎮 **Play**     | Make your pet happy (uses energy)       |
| 🧹 **Clean**    | Clean up messes and bathe your pet      |
| 😴 **Sleep**    | Rest when tired (turn off lights first) |
| 💊 **Medicine** | Cure sickness                           |
| 💡 **Light**    | Toggle lights on/off for bedtime        |

### Tips for a Happy Pet

1. **Check regularly** - Stats decay over time
2. **Keep it clean** - Poop accumulates and can make your pet sick
3. **Balance rest** - Don't let energy get too low
4. **Don't overfeed** - Wait until hunger is low before feeding
5. **Light management** - Turn off lights before putting to bed

## 🏗️ Architecture

This example demonstrates tokagentOS's ability to run agents **without an LLM**:

```
┌─────────────────────────────────────────────────────────┐
│                    React UI                              │
│              (Tokagentgotchi App)                           │
├─────────────────────────────────────────────────────────┤
│  Game Engine                                             │
│  ├── State Management (PetState)                         │
│  ├── Stat Decay & Time-based Updates                     │
│  ├── Action Handling (feed, play, clean, etc.)           │
│  └── Evolution System                                    │
├─────────────────────────────────────────────────────────┤
│  tokagentgotchiPlugin (Custom Model Handlers)               │
│  ├── models[TEXT_LARGE] → game logic                     │
│  └── models[TEXT_SMALL] → game logic                     │
├─────────────────────────────────────────────────────────┤
│  AgentRuntime (tokagentOS Core)                             │
│  └── useModel() → routed to game engine, NOT an LLM!    │
└─────────────────────────────────────────────────────────┘
```

## 📁 File Structure

```
tokagentgotchi/
├── src/
│   ├── App.tsx              # Main React component
│   ├── App.css              # Styling (kawaii aesthetic)
│   ├── main.tsx             # Entry point
│   ├── components/
│   │   ├── PetSprite.tsx    # SVG pet graphics for all stages
│   │   └── GameElements.tsx # Poop, hearts, icons, backgrounds
│   └── game/
│       ├── types.ts         # TypeScript types
│       ├── engine.ts        # Core game logic
│       └── plugin.ts        # tokagentOS plugin with model handlers
├── index.html
├── package.json
├── vite.config.ts
└── README.md
```

## 🎨 Pet Life Stages

| Stage    | Description                        | Duration          |
| -------- | ---------------------------------- | ----------------- |
| 🥚 Egg   | Your pet is incubating             | 1 minute          |
| 👶 Baby  | Newly hatched, needs lots of care  | 3 minutes         |
| 🧒 Child | Growing up, developing personality | 5 minutes         |
| 🧑 Teen  | Rebellious phase, needs discipline | 10 minutes        |
| 👨 Adult | Fully grown, stable personality    | 30 minutes        |
| 👴 Elder | Wise and experienced               | Until natural end |

## 😊 Mood System

Your pet's mood is determined by their stats:

- **Happy** 😄 - All stats above 80%
- **Content** 🙂 - All stats above 60%
- **Neutral** 😐 - Normal state
- **Sad** 😢 - Happiness below 35%
- **Hungry** 🍽️ - Hunger below 40%
- **Dirty** 🧹 - Cleanliness below 30%
- **Sick** 🤒 - Health issues

## ⚙️ Technical Details

### No LLM Pattern

Like the tic-tac-toe example, Tokagentgotchi uses custom model handlers:

```typescript
const tokagentgotchiPlugin: Plugin = {
  name: "tokagentgotchi",
  priority: 100,
  models: {
    [ModelType.TEXT_LARGE]: tokagentgotchiModelHandler,
    [ModelType.TEXT_SMALL]: tokagentgotchiModelHandler,
  },
};
```

When `runtime.useModel()` is called, instead of hitting an LLM API, our game engine processes the command and returns game state updates.

### Browser-Based Storage

Uses in-memory state for the browser demo. Can be extended to use PGlite for persistence.

## 🤝 Contributing

Contributions are welcome! Some ideas:

- [ ] Add more pet evolution paths
- [ ] Implement minigames for playing
- [ ] Add sound effects
- [ ] Create different pet species
- [ ] Add achievements/milestones

## 📜 License

MIT License - Part of the tokagentOS project.

---

Made with 💕 using tokagentOS



