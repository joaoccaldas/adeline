# Adeline - Multiplayer Card Game

## What This Is
A real-time multiplayer card game built with React. Create a room, share the code, play with friends.

## How to Play
1. **Create a Room:** Tap "Create Room", pick a name and how many rounds to play, then share the 4-letter code. 
2. **Join a Room::** Toher players tap "Join Room", enter the code, and pick a name.
3. **Start:** When everyone has joined, the host taps "Start Game" to begin.
4. **Play:** Each player privately peeks at 2 of their 4 cards. At their turn, they draw from the deck or take the top of the discard pile. You must discard one card after drawing.
5. **Win:** After all rounds, the player with the lowest total score wins!

## Special Cards
2. **Duck:** If you draw a Duck, you can steal one of your own cards and look at one of your opponent's cards.
7. **Seven:** If you draw a Seven, you can swap one of your cards with another player's card. Note: You can only swap a card you have not previously seen.
8. **Elight:** If you draw an Eight, you can peek at one of your own cards.
9. **Nine:** If you draw a Nine, you can steal one of your own cards and look at one of your opponent's cards.
10. **Ten::** If you draw a Ten, you can steal one of your own cards and look at one of your opponent's cards.
**** **Rule:** Who ever draws a Ten has the right to steal one of their own cards and look at one of their opponent's cards.

## Features
- Real-time multiplayer over WebSockets (Socket.IO)
- Mobile-first responsive UI
- Reconnection support if a player loses signal mid-round
- Custom game states, optimized for Production
- React Context API for state management

## Technology
React
*.js, HTML5, CSS, and Socket.IO.

## Usage
To run locally:
```bash
npm install
npm run dev
```

## Deployment
Deploys easily to any Node.js hosting provider. Supports adaptive and interactive gameplay.

## Status
Complete. Played with family. Open source for other families.

*"Built by Jmão Caldas for family game night | joaoccaldas@gmail.com"*