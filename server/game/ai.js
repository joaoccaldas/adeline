// AI player — server-side bot that plays Adeline with basic strategy.
// Tracks only the cards it has explicitly peeked or swapped in (fair play).
import { cardValue, hasPower, powerOf } from './cards.js';

const CALL_THRESHOLD = 14; // estimated hand total at which AI calls Adeline
const HAND_SIZE = 4;

export class AiPlayer {
  constructor(id) {
    this.id = id;
    this.knownCards = {}; // slot -> card  (only what it has seen)
  }

  // Called whenever the AI peeks at one of its own slots.
  recordPeek(slot, card) {
    this.knownCards[slot] = card;
  }

  // Called whenever the AI swaps a new card into a slot.
  recordSwapIn(slot, card) {
    this.knownCards[slot] = card;
  }

  // Forget a slot (e.g. after an opponent blind-swaps it away).
  forgetSlot(slot) {
    delete this.knownCards[slot];
  }

  // Estimated hand score — unknown slots assumed to be 7 (rough average).
  estimatedScore() {
    let total = 0;
    for (let i = 0; i < HAND_SIZE; i++) {
      const c = this.knownCards[i];
      total += c ? cardValue(c) : 7;
    }
    return total;
  }

  // ---------- decision helpers ----------

  /** Returns 'callAdeline' | 'takeDiscard' | 'drawDeck' */
  decideTurnStart(engine) {
    if (this.estimatedScore() <= CALL_THRESHOLD) return 'callAdeline';

    const discardTop = engine.discard[engine.discard.length - 1];
    if (discardTop) {
      const dv = cardValue(discardTop);
      const worstSlot = this._worstKnownSlot();
      if (worstSlot !== -1 && dv < cardValue(this.knownCards[worstSlot])) {
        return 'takeDiscard';
      }
    }
    return 'drawDeck';
  }

  /** Returns { action: 'usePower' | 'swapDrawn' | 'discardDrawn', slot? } */
  decideDrawn(drawnCard) {
    if (hasPower(drawnCard)) {
      const code = powerOf(drawnCard);
      // Always use info-gathering and disruptive powers.
      if (['PEEK_SELF', 'PEEK_TWO_SELF', 'PEEK_OTHER', 'FORCE_DISCARD', 'RESHUFFLE'].includes(code)) {
        return { action: 'usePower' };
      }
      // BLIND_SWAP / WILD_SWAP / REVEAL_ANY: use if hand is bad.
      if (this.estimatedScore() > 20) {
        return { action: 'usePower' };
      }
    }

    const dv = cardValue(drawnCard);
    const worstSlot = this._worstKnownSlot();
    if (worstSlot !== -1 && dv < cardValue(this.knownCards[worstSlot])) {
      return { action: 'swapDrawn', slot: worstSlot };
    }
    return { action: 'discardDrawn' };
  }

  /** Which slot to put the taken discard card into. */
  decideSwapForTakeDiscard() {
    const worst = this._worstKnownSlot();
    return worst !== -1 ? worst : Math.floor(Math.random() * HAND_SIZE);
  }

  /**
   * Pick a power target for a POWER_PROMPT prompt.
   * promptKind: 'OWN_CARD' | 'OTHER_CARD' | 'ANY_CARD' | 'OTHER_PLAYER'
   */
  decidePowerTarget(promptKind, myId, players) {
    const others = players.filter(p => p.id !== myId && p.connected !== false);

    if (promptKind === 'OWN_CARD') {
      // Prefer unknown slots (to gain info); else pick worst known.
      const unknownSlot = [0, 1, 2, 3].find(s => !Object.prototype.hasOwnProperty.call(this.knownCards, s));
      if (unknownSlot !== undefined) return { playerId: myId, slot: unknownSlot };
      const worst = this._worstKnownSlot();
      return { playerId: myId, slot: worst !== -1 ? worst : 0 };
    }

    if (promptKind === 'OTHER_PLAYER') {
      const target = others[Math.floor(Math.random() * others.length)];
      return { playerId: target?.id ?? myId };
    }

    if (promptKind === 'OTHER_CARD') {
      const target = others[Math.floor(Math.random() * others.length)];
      if (!target) return { playerId: myId, slot: Math.floor(Math.random() * HAND_SIZE) };
      return { playerId: target.id, slot: Math.floor(Math.random() * HAND_SIZE) };
    }

    if (promptKind === 'ANY_CARD') {
      if (others.length > 0) {
        const target = others[Math.floor(Math.random() * others.length)];
        return { playerId: target.id, slot: Math.floor(Math.random() * HAND_SIZE) };
      }
      return { playerId: myId, slot: Math.floor(Math.random() * HAND_SIZE) };
    }

    return { playerId: myId, slot: 0 };
  }

  // ---------- internal ----------
  _worstKnownSlot() {
    let worst = -1;
    let worstVal = -1;
    for (const [s, card] of Object.entries(this.knownCards)) {
      const v = cardValue(card);
      if (v > worstVal) { worstVal = v; worst = Number(s); }
    }
    return worst;
  }
}
