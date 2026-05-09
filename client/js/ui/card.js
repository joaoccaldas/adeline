// Card component — renders a single card element from server data.
const SUIT_GLYPH = { S: '♠', H: '♥', D: '♦', C: '♣' };
const RED_SUITS = new Set(['H', 'D']);

/**
 * @param {object} opts
 * @param {object|null} opts.card - {rank, suit} or null for back
 * @param {boolean} opts.faceUp
 * @param {boolean} [opts.peeked]    - private "you've seen this" badge
 * @param {boolean} [opts.publicKnown]
 * @param {boolean} [opts.selectable]
 * @param {boolean} [opts.selected]
 * @param {string}  [opts.size]      - 'tiny' | undefined
 * @param {Function}[opts.onClick]
 */
export function renderCard(opts = {}) {
  const { card, faceUp, peeked, publicKnown, selectable, selected, size, onClick } = opts;
  const el = document.createElement('div');
  const classes = ['card'];
  classes.push(faceUp && card ? 'face' : 'back');
  if (size) classes.push(size);
  if (faceUp && card?.rank === 'JOKER') classes.push('joker');
  if (faceUp && card && RED_SUITS.has(card.suit)) classes.push('red');
  if (peeked) classes.push('peeked');
  if (publicKnown) classes.push('public-known');
  if (selectable) classes.push('selectable');
  if (selected) classes.push('selected');
  el.className = classes.join(' ');

  if (faceUp && card) {
    if (card.rank === 'JOKER') {
      el.innerHTML = `<span class="rank">Joker</span>`;
    } else {
      const glyph = SUIT_GLYPH[card.suit] || '';
      el.innerHTML = `<span><span class="rank">${card.rank}</span><span class="suit">${glyph}</span></span>`;
    }
  } else {
    el.innerHTML = `<span class="pattern">Adelinete</span>`;
  }

  if (selectable && onClick) {
    el.addEventListener('click', onClick);
  }
  return el;
}

export function cardName(c) {
  if (!c) return '—';
  if (c.rank === 'JOKER') return 'Joker';
  return c.rank + (SUIT_GLYPH[c.suit] || '');
}

export function cardValue(c) {
  if (!c) return 0;
  if (c.rank === 'JOKER') return 0;
  if (c.rank === 'J' && c.suit === 'S') return 0;
  if (c.rank === 'A') return 1;
  if (c.rank === 'J') return 11;
  if (c.rank === 'Q') return 12;
  if (c.rank === 'K') return 13;
  return Number(c.rank);
}
