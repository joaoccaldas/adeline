import { cardValue, hasPower, powerOf } from './cards.js';
export class AIPlayer {
  constructor(id, name) { this.id = id; this.name = name; this.memory = {}; }
  observe(type, data) {
    if (type === 'peek' && data.toPlayerId === this.id) {
      if (!this.memory[data.playerId]) this.memory[data.playerId] = {};
      this.memory[data.playerId][data.slot] = data.card;
    }
    if (type === 'swap') {
      // After a blind/wild swap, the affected slots are unknown again.
      if (this.memory[data.ownPlayerId]) delete this.memory[data.ownPlayerId][data.ownSlot];
      if (this.memory[data.otherPlayerId]) delete this.memory[data.otherPlayerId][data.otherSlot];
    }
    if (type === 'roundEnd') this.memory = {};
  }
  decide(game) {
    const me = game.players.find(p => p.id === this.id);
    if (!me || game.currentPlayerId !== this.id) return null;
    if (game.phase === 'TURN_START') return this._turnStart(game, me);
    if (game.phase === 'DRAWN') return this._drawn(game, me);
    if (game.phase === 'TAKE_DISCARD') { const mx = this._maxKnown(); return mx ? { event: 'game:swapDrawn', payload: { slot: mx.slot }, delay: 1000 } : { event: 'game:swapDrawn', payload: { slot: 0 }, delay: 1000 }; }
    if (game.phase === 'POWER_PROMPT') return this._power(game, me);
    return null;
  }
  _turnStart(game, me) {
    const allKnown = Object.keys(this.memory[this.id] || {}).length === me.handSize;
    if (allKnown && this._knownValue(me.handSize) < 10 && !game.adelineCallerId) return { event: 'game:callAdeline', payload: {}, delay: 1500 };
    const d = game.discardTop;
    if (d) { const v = cardValue(d); const mx = this._maxKnown(); if (v <= 4 || (mx && v < cardValue(mx.card))) return { event: 'game:takeDiscard', payload: {}, delay: 1000 }; }
    return { event: 'game:drawDeck', payload: {}, delay: 1000 };
  }
  _drawn(game, me) {
    const drawn = game.drawnCard;
    if (!drawn) return null;
    if (hasPower(drawn)) return { event: 'game:usePower', payload: {}, delay: 1200 };
    const v = cardValue(drawn); const mx = this._maxKnown();
    if (mx && v < cardValue(mx.card)) return { event: 'game:swapDrawn', payload: { slot: mx.slot }, delay: 1200 };
    if (v <= 5) { for (let i = 0; i < me.handSize; i++) { if (!this.memory[this.id]?.[i]) return { event: 'game:swapDrawn', payload: { slot: i }, delay: 1200 }; } }
    return { event: 'game:discardDrawn', payload: {}, delay: 800 };
  }
  _power(game, me) {
    const pp = game.pendingPower; const k = pp.currentPrompt;
    if (k === 'OWN_CARD') { for (let i = 0; i < me.handSize; i++) { if (!this.memory[this.id]?.[i]) return { event: 'game:powerTarget', payload: { playerId: this.id, slot: i }, delay: 800 }; } return { event: 'game:powerTarget', payload: { playerId: this.id, slot: 0 }, delay: 800 }; }
    if (k === 'OTHER_CARD') { for (const p of game.players) { if (p.id === this.id) continue; for (let i = 0; i < p.handSize; i++) { if (!this.memory[p.id]?.[i]) return { event: 'game:powerTarget', payload: { playerId: p.id, slot: i }, delay: 800 }; } } const t = game.players.find(p => p.id !== this.id); return { event: 'game:powerTarget', payload: { playerId: t.id, slot: 0 }, delay: 800 }; }
    if (k === 'OTHER_PLAYER') { const t = game.players.find(p => p.id !== this.id); return { event: 'game:powerTarget', payload: { playerId: t.id }, delay: 800 }; }
    return null;
  }
  _knownValue(size) { let s = 0; for (let i = 0; i < size; i++) { const c = this.memory[this.id]?.[i]; s += c ? cardValue(c) : 7; } return s; }
  _maxKnown() { let mx = null; for (const [sl, card] of Object.entries(this.memory[this.id] || {})) { if (!mx || cardValue(card) > cardValue(mx.card)) mx = { slot: parseInt(sl), card }; } return mx; }
}
