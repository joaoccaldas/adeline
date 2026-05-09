// Build and shuffle decks. Pure functions.
import { SUITS, RANKS } from './cards.js';
import { randomUUID } from 'node:crypto';

export function buildDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ id: randomUUID(), rank, suit });
    }
  }
  deck.push({ id: randomUUID(), rank: 'JOKER', suit: null });
  deck.push({ id: randomUUID(), rank: 'JOKER', suit: null });
  return shuffle(deck);
}

export function shuffle(cards) {
  const arr = [...cards];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
