// Card definitions, values, names, and which cards have powers.
// Pure data — no transport, no I/O.

export const SUITS = ['S', 'H', 'D', 'C']; // spades, hearts, diamonds, clubs
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export const SUIT_GLYPH = { S: '♠', H: '♥', D: '♦', C: '♣' };
export const RED_SUITS = new Set(['H', 'D']);

/** Numeric scoring value of a card. */
export function cardValue(card) {
  if (!card) return 0;
  if (card.rank === 'JOKER') return 0;
  if (card.rank === 'J' && card.suit === 'S') return 0;
  if (card.rank === 'A') return 1;
  if (card.rank === 'J') return 11;
  if (card.rank === 'Q') return 12;
  if (card.rank === 'K') return 13;
  return Number(card.rank);
}

/**
 * Returns the power name for a card, or null if it has no power.
 */
export function powerOf(card) {
  if (!card) return null;
  if (card.rank === '7') return 'PEEK_SELF';
  if (card.rank === '8') return 'PEEK_OTHER';
  if (card.rank === '9') return 'BLIND_SWAP';
  if (card.rank === '10') return 'PEEK_TWO_SELF';
  if (card.rank === 'J' && card.suit !== 'S') return 'REVEAL_ANY';
  if (card.rank === 'Q') return 'FORCE_DISCARD';
  if (card.rank === 'K') return 'RESHUFFLE';
  if (card.rank === 'JOKER') return 'WILD_SWAP';
  return null;
}

export function hasPower(card) {
  return powerOf(card) !== null;
}

/** Friendly display string for logs / public messages. */
export function cardName(card) {
  if (!card) return 'sem carta';
  if (card.rank === 'JOKER') return 'Coringa';
  return card.rank + SUIT_GLYPH[card.suit];
}

/** Power label shown to players in the UI. */
export const POWER_LABEL = {
  PEEK_SELF: 'Espiar sua carta',
  PEEK_OTHER: 'Espiar carta alheia',
  BLIND_SWAP: 'Troca cega',
  PEEK_TWO_SELF: 'Espiar 2 cartas próprias',
  REVEAL_ANY: 'Revelar carta',
  FORCE_DISCARD: 'Forçar descarte',
  RESHUFFLE: 'Embaralhar descarte',
  WILD_SWAP: 'Troca livre',
};
