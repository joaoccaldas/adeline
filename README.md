# Adeline — Multiplayer Online Card Game

A real-time, mobile-first, multiplayer version of the **Adeline** memory card game.
Players connect from their phones, join a room with a 4-letter code, and play together with hidden cards, special powers, and round scoring.

---

## Features

- Real-time multiplayer over WebSockets (Socket.IO)
- Mobile-first responsive UI (touch optimized, single-hand friendly)
- Modular architecture (server engine + client modules are decoupled)
- Room codes for easy joining (no auth needed)
- Eight special card powers (7, 8, 9, 10, J, Q, K, Joker)
- Animated card flips, toast notifications, and a live game log
- Reconnection support if a player loses signal mid-round
- Configurable rounds (3 / 5 / 7 / 10) and player count (2–6)

---

## Project Structure

```
adeline/
├── package.json              # Single root manifest (server deps)
├── README.md
├── .gitignore
│
├── server/                   # Backend (Node.js + Socket.IO)
│   ├── index.js              # HTTP + Socket.IO entry
│   ├── socket-handlers.js    # Wires socket events to game engine
│   └── game/
│       ├── cards.js          # Card definitions, values, isPower()
│       ├── deck.js           # Build & shuffle deck
│       ├── powers.js         # Special card effects (7/8/9/10/J/Q/K/Joker)
│       ├── player.js         # Player state class
│       ├── room.js           # Room manager (lobby + game lifecycle)
│       └── engine.js         # Core game state machine
│
└── client/                   # Frontend (vanilla ES modules, no build step)
    ├── index.html
    ├── manifest.webmanifest  # PWA manifest
    ├── sw.js                 # Service worker (offline shell)
    ├── css/
    │   ├── base.css
    │   ├── lobby.css
    │   ├── game.css
    │   ├── card.css
    │   ├── modal.css
    │   └── animations.css
    └── js/
        ├── main.js           # Bootstraps app
        ├── net/
        │   └── socket.js     # Socket.IO client wrapper
        ├── state/
        │   └── store.js      # Pub/sub state store
        └── ui/
            ├── screens.js    # Screen router (welcome/lobby/game/end)
            ├── welcome.js
            ├── lobby.js
            ├── game.js
            ├── card.js       # Reusable card component
            ├── modal.js
            ├── log.js
            └── toast.js
```

---

## Quick Start

```bash
cd adeline
npm install
npm start
```

The server runs on `http://localhost:3000`. On the same Wi-Fi network you can also visit it from your phone at `http://<your-computer-ip>:3000`.

To deploy publicly (e.g. for friends across the internet), push to any Node host (Render, Fly.io, Railway). The `PORT` environment variable is honoured.

---

## How to Play

1. One player taps **Create Room**, picks a name and round count, and shares the 4-letter code.
2. Other players tap **Join Room**, enter the code, and pick a name.
3. The host taps **Start Game** when everyone has joined (2–6 players).
4. Each player privately peeks at 2 of their 4 cards.
5. On your turn, draw from the deck or take the discard. Then either swap a card, discard, or use a power.
6. When you think you have the lowest hand, **call Adeline**. Everyone else gets one final turn, then hands are revealed.
7. If you called Adeline but weren't the lowest, you take a +10 penalty.
8. Lowest total score after the configured number of rounds wins.

---

## Card Values & Powers

| Card | Value | Power on use |
|---|---|---|
| A | 1 | — |
| 2–6 | face | — |
| **7** | 7 | Peek at one of your own cards |
| **8** | 8 | Peek at another player's card |
| **9** | 9 | Blind swap one of your cards with another player's |
| **10** | 10 | Peek at TWO of your own cards |
| J♠ | **0** | — (low-value bonus) |
| **J♥/J♦/J♣** | 11 | **Reveal**: show any card on the table to everyone |
| **Q** | 12 | **Force Discard**: an opponent discards a random card (drawn replacement is hidden) |
| **K** | 13 | **Reshuffle**: shuffle the discard pile back into the deck |
| **Joker** | 0 | **Wild Swap**: swap any two cards anywhere on the table |

Powers only trigger when the special card is **drawn and used as a power** (you can also choose to keep it or just discard it without using).

---

## Modularity

The game engine (`server/game/engine.js`) is independent of any transport. You can drive it from a CLI, an HTTP API, or the included Socket.IO layer. Swap `socket-handlers.js` with a different transport without touching `engine.js`.

The client UI is split into discrete modules under `client/js/ui/`. Each owns a piece of the DOM and subscribes to the state store — to add a new screen you create one file and register it in `screens.js`.

Adding a new power: edit `server/game/powers.js` (one switch case) and `server/game/cards.js` (mark `isPower`). The client picks up the power name automatically from the server's pending-action message.
