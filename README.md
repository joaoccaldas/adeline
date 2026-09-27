# Adeline - Multiplayer Card Game

A real-time multiplayer card game using a Node.js/Express + Socket.IO server and a browser-based JavaScript client. Create a room, share the code, and play with friends.

## Features

- real-time multiplayer over WebSockets;
- mobile-first browser UI;
- room-based play;
- reconnect/network state handling;
- shared game-rule modules across client and server.

## Technology

- Node.js
- Express
- Socket.IO
- browser JavaScript, HTML and CSS

The current client is not React-based; the repository uses plain browser JavaScript modules.

## Local development

```bash
npm ci
npm run dev
```

## Deployment

Deploy to a Node.js hosting provider with WebSocket support.

## Portfolio role

**LAB / PLAYABLE MULTIPLAYER GAME.** Adeline is useful for learning networked game state, room lifecycle, client/server rule sharing, reconnection, and real-time interaction.

## Project context

This is a personal, self-directed learning project by João Caldas. I learn game development and software engineering by building playable systems, studying failures, refactoring experiments, and comparing different approaches.

AI tools are used extensively during research, design, coding, debugging, testing, asset ideation, and documentation as part of that learning process. AI-generated suggestions are treated as inputs to review, not proof of correctness. Multiplayer state, rule consistency, network behavior, and security/privacy boundaries should be tested explicitly.

## Status

Playable learning project / active portfolio candidate.

## Network boundary

The current learning server listens on all interfaces and Socket.IO is configured with permissive CORS to make local/group testing easy. Treat that as a development/lab default, not a hardened public-internet deployment profile.

Before public hosting, configure explicit trusted origins, review abuse/rate limits and room lifecycle, and add deployment-specific security tests without weakening offline/local play.
