// GameEngine — the canonical game state machine.
// Transport-agnostic: methods return `Effect` objects that describe
// what to broadcast (public log) and what to send privately (peeks).
//
// Phases:
//   LOBBY            -> waiting for host to start
//   MEMORIZE         -> players privately see 2 starting cards for 3 seconds
//   TURN_START       -> current player chooses: drawDeck / takeDiscard / callAdeline
//   DRAWN            -> player has a drawn card, chooses: swap / discard / use power
//   SWAP_DRAWN       -> player picks own slot to swap drawn card into
//   TAKE_DISCARD     -> player picks own slot to swap discard top into
//   POWER_PROMPT     -> engine is collecting targets for an active power
//   ROUND_OVER       -> reveal + score
//   GAME_OVER        -> final ranking
import { buildDeck, shuffle } from './deck.js';
import { cardValue, hasPower, powerOf, cardName, POWER_LABEL } from './cards.js';
import { POWERS } from './powers.js';
import { Player } from './player.js';

const HAND_SIZE = 4;
const INITIAL_PEEK_COUNT = 2;
const ADELINE_PENALTY = 10;

export class GameEngine {
  constructor({ roundLimit = 5 } = {}) {
    this.players = [];          // ordered by seat
    this.hostId = null;
    this.phase = 'LOBBY';
    this.round = 0;
    this.roundLimit = roundLimit;

    this.deck = [];
    this.discard = [];
    this.drawn = null;          // { card, source: 'DECK' | 'DISCARD' }

    this.currentSeat = 0;       // index into players

    this.adeline = null;        // { callerId, turnsLeft }
    this.publicKnown = {};      // { [playerId]: Set<slotIndex> } cards everyone has seen

    this.pendingPower = null;   // { code, picks:[], promptIdx, actorId }
    this.lastResults = null;
  }

  // ---------- helpers ----------
  player(id) { return this.players.find(p => p.id === id); }
  current() { return this.players[this.currentSeat]; }
  cardAt(playerId, slot) { return this.player(playerId)?.hand[slot]; }
  isHost(id) { return id === this.hostId; }
  isPubliclyKnown(playerId, slot) {
    return this.publicKnown[playerId]?.has(slot) ?? false;
  }
  markPubliclyKnown(playerId, slot) {
    if (!this.publicKnown[playerId]) this.publicKnown[playerId] = new Set();
    this.publicKnown[playerId].add(slot);
    // Also let the owner see it.
    this.player(playerId)?.seen.add(slot);
  }

  // ---------- lobby ----------
  addPlayer({ id, name }) {
    if (this.phase !== 'LOBBY') throw new Error('Game already started');
    if (this.players.length >= 6) throw new Error('Room full');
    if (this.players.find(p => p.id === id)) return this.player(id);
    const p = new Player({ id, name });
    this.players.push(p);
    if (!this.hostId) this.hostId = id;
    return p;
  }

  removePlayer(id) {
    if (this.phase === 'LOBBY') {
      this.players = this.players.filter(p => p.id !== id);
      if (this.hostId === id) this.hostId = this.players[0]?.id ?? null;
    } else {
      // Mark as disconnected; do not remove mid-game.
      const p = this.player(id);
      if (p) p.connected = false;
    }
  }

  reconnect(id) {
    const p = this.player(id);
    if (p) p.connected = true;
  }

  setRoundLimit(n) {
    if (this.phase !== 'LOBBY') return;
    this.roundLimit = Number(n) || 5;
  }

  // ---------- start ----------
  start() {
    if (this.phase !== 'LOBBY') throw new Error('Already started');
    if (this.players.length < 2) throw new Error('Need at least 2 players');
    this.round = 1;
    return this._startRound();
  }

  _startRound() {
    this.deck = buildDeck();
    this.discard = [];
    this.drawn = null;
    this.adeline = null;
    this.publicKnown = {};
    this.pendingPower = null;
    for (const p of this.players) p.reset();
    for (const p of this.players) {
      for (let i = 0; i < HAND_SIZE; i++) p.hand.push(this.deck.pop());
    }
    this.discard.push(this.deck.pop());
    this.currentSeat = 0;
    this.phase = 'MEMORIZE';
    return this._effect({ log: `Início da Rodada ${this.round}. Memorize suas 2 primeiras cartas!` });
  }

  /** Advance from memorization to actual turns. */
  startTurns() {
    if (this.phase !== 'MEMORIZE') return this._effect({});
    this.phase = 'TURN_START';
    return this._effect({ log: `O tempo acabou! Turno de ${this.current().name}.` });
  }

  // ---------- turn actions ----------
  drawFromDeck(playerId) {
    this._assertTurn(playerId);
    if (this.phase !== 'TURN_START') throw new Error('Cannot draw now');
    this.recycleDeckIfNeeded();
    const card = this.deck.pop();
    if (!card) throw new Error('Deck empty');
    this.drawn = { card, source: 'DECK' };
    this.phase = 'DRAWN';
    return this._effect({ log: `${this.current().name} comprou do baralho.` });
  }

  takeDiscard(playerId) {
    this._assertTurn(playerId);
    if (this.phase !== 'TURN_START') throw new Error('Cannot take now');
    const top = this.discard.pop();
    if (!top) throw new Error('Discard empty');
    this.drawn = { card: top, source: 'DISCARD' };
    this.phase = 'TAKE_DISCARD';
    return this._effect({ log: `${this.current().name} pegou ${cardName(top)} do descarte.` });
  }

  swapDrawn(playerId, slot) {
    this._assertTurn(playerId);
    if (this.phase !== 'DRAWN' && this.phase !== 'TAKE_DISCARD') throw new Error('Cannot swap now');
    const p = this.current();
    const replaced = p.hand[slot];
    p.hand[slot] = this.drawn.card;
    p.seen.add(slot); // they saw the card going in
    this.discard.push(replaced);
    const log = `${p.name} trocou pela carta ${cardName(this.drawn.card)} (posição ${slot + 1}) e descartou ${cardName(replaced)}.`;
    this.drawn = null;
    return this._endTurn(log);
  }

  discardDrawn(playerId) {
    this._assertTurn(playerId);
    if (this.phase !== 'DRAWN') throw new Error('Cannot discard now');
    this.discard.push(this.drawn.card);
    const log = `${this.current().name} descartou ${cardName(this.drawn.card)}.`;
    this.drawn = null;
    return this._endTurn(log);
  }

  /** Use the drawn card's power. The card moves to discard immediately. */
  usePower(playerId) {
    this._assertTurn(playerId);
    if (this.phase !== 'DRAWN') throw new Error('Cannot use power now');
    if (!hasPower(this.drawn?.card)) throw new Error('No power on this card');
    const code = powerOf(this.drawn.card);
    const card = this.drawn.card;
    this.discard.push(card);
    this.drawn = null;
    const power = POWERS[code];
    if (power.prompts.length === 0) {
      // Resolve immediately
      const out = power.apply(this, [], this.current());
      return this._endTurn(out.log ?? '');
    }
    this.pendingPower = { code, picks: [], promptIdx: 0, actorId: this.current().id };
    this.phase = 'POWER_PROMPT';
    return this._effect({ log: `${this.current().name} usa ${cardName(card)} — ${POWER_LABEL[code]}.` });
  }

  /** Provide a target for the active power's current prompt. */
  powerTarget(playerId, target) {
    if (this.phase !== 'POWER_PROMPT') throw new Error('No active power');
    if (this.pendingPower.actorId !== playerId) throw new Error('Not your power');
    const power = POWERS[this.pendingPower.code];
    const prompt = power.prompts[this.pendingPower.promptIdx];
    this._validateTarget(prompt, playerId, target);
    this.pendingPower.picks.push(target);
    this.pendingPower.promptIdx++;
    if (this.pendingPower.promptIdx < power.prompts.length) {
      return this._effect({});
    }
    const actor = this.player(this.pendingPower.actorId);
    const out = power.apply(this, this.pendingPower.picks, actor);
    this.pendingPower = null;
    return this._endTurn(out.log ?? '', out);
  }

  callAdeline(playerId) {
    this._assertTurn(playerId);
    if (this.phase !== 'TURN_START') throw new Error('Cannot call now');
    if (this.adeline) throw new Error('Already called');
    this.adeline = { callerId: playerId, turnsLeft: this.players.length - 1 };
    const log = `${this.current().name} chamou Adelinete! Todos os outros têm um turno final.`;
    return this._advanceTurn(log, true);
  }

  // ---------- internal turn flow ----------
  _endTurn(log, extra = {}) {
    if (this.adeline) {
      this.adeline.turnsLeft--;
      if (this.adeline.turnsLeft <= 0) return this._finishRound(log, extra);
    }
    return this._advanceTurn(log, false, extra);
  }

  _advanceTurn(log, fromCall, extra = {}) {
    const n = this.players.length;
    let next = (this.currentSeat + 1) % n;
    // Skip disconnected players and (during Adeline) the caller.
    for (let i = 0; i < n; i++) {
      const p = this.players[next];
      const isCallerSkip = this.adeline && p.id === this.adeline.callerId;
      if (p.connected !== false && !isCallerSkip) break;
      next = (next + 1) % n;
    }
    this.currentSeat = next;
    this.phase = 'TURN_START';
    const turnLog = fromCall ? '' : ` Turno passa para ${this.current().name}.`;
    return this._effect({ log: log + turnLog, ...extra });
  }

  _finishRound(extraLog = '', extra = {}) {
    this.phase = 'ROUND_OVER';
    const scores = this.players.map(p => ({
      id: p.id,
      name: p.name,
      raw: p.hand.reduce((s, c) => s + cardValue(c), 0),
      penalty: 0,
    }));
    const lowest = Math.min(...scores.map(s => s.raw));
    const callerId = this.adeline?.callerId;
    if (callerId) {
      const callerScore = scores.find(s => s.id === callerId);
      if (callerScore && callerScore.raw > lowest) callerScore.penalty = ADELINE_PENALTY;
    }
    for (const s of scores) {
      s.total = s.raw + s.penalty;
      const player = this.player(s.id);
      player.score += s.total;
      s.cumulative = player.score;
      s.hand = player.hand;
    }
    this.lastResults = { round: this.round, scores, lowest, callerId };
    return this._effect({ log: extraLog ? extraLog + ' Fim da rodada.' : 'Fim da rodada.', roundEnd: this.lastResults, ...extra });
  }

  /** Called by host (or auto) to move to next round / end game. */
  nextRound(playerId) {
    if (!this.isHost(playerId)) throw new Error('Only host can advance');
    if (this.phase !== 'ROUND_OVER') throw new Error('Round not over');
    if (this.round >= this.roundLimit) {
      this.phase = 'GAME_OVER';
      const ranking = [...this.players].sort((a, b) => a.score - b.score).map(p => ({ id: p.id, name: p.name, score: p.score }));
      return this._effect({ log: 'Fim de jogo.', gameEnd: { ranking } });
    }
    this.round++;
    return this._startRound();
  }

  recycleDeckIfNeeded() {
    if (this.deck.length > 0) return;
    const top = this.discard.pop();
    this.deck = shuffle(this.discard);
    this.discard = top ? [top] : [];
  }

  _assertTurn(playerId) {
    if (this.current()?.id !== playerId) throw new Error('Not your turn');
  }

  _validateTarget(prompt, actorId, target) {
    if (!target || typeof target.playerId !== 'string') throw new Error('Bad target');
    const targetPlayer = this.player(target.playerId);
    if (!targetPlayer) throw new Error('Unknown player');
    if (prompt.kind === 'OWN_CARD' && target.playerId !== actorId) throw new Error('Must pick own card');
    if (prompt.kind === 'OTHER_CARD' && target.playerId === actorId) throw new Error('Must pick another player');
    if (prompt.kind === 'OTHER_PLAYER' && target.playerId === actorId) throw new Error('Must pick another player');
    if (prompt.kind !== 'OTHER_PLAYER') {
      if (typeof target.slot !== 'number') throw new Error('Bad slot');
      if (target.slot < 0 || target.slot >= targetPlayer.hand.length) throw new Error('Bad slot');
    }
  }

  // ---------- view (for serializing to clients) ----------
  /**
   * Build a state snapshot from the perspective of `viewerId`.
   * Hidden cards are returned as null. Cards the viewer has personally peeked,
   * or cards publicly revealed, are sent in full.
   */
  viewFor(viewerId) {
    const viewer = this.player(viewerId);
    return {
      phase: this.phase,
      round: this.round,
      roundLimit: this.roundLimit,
      hostId: this.hostId,
      currentPlayerId: this.current()?.id ?? null,
      deckCount: this.deck.length,
      discardTop: this.discard[this.discard.length - 1] ?? null,
      drawnCard: this.drawn && this.current()?.id === viewerId ? this.drawn.card : null,
      drawnIsTaken: !!this.drawn,
      drawnSource: this.drawn?.source ?? null,
      adelineCallerId: this.adeline?.callerId ?? null,
      adelineTurnsLeft: this.adeline?.turnsLeft ?? 0,
      pendingPower: this.pendingPower
        ? {
            code: this.pendingPower.code,
            label: POWER_LABEL[this.pendingPower.code],
            actorId: this.pendingPower.actorId,
            promptIdx: this.pendingPower.promptIdx,
            promptsTotal: POWERS[this.pendingPower.code].prompts.length,
            currentPrompt: POWERS[this.pendingPower.code].prompts[this.pendingPower.promptIdx]?.kind ?? null,
          }
        : null,
      initialPeekRemaining: 0,
      players: this.players.map(p => ({
        id: p.id,
        name: p.name,
        score: p.score,
        connected: p.connected,
        handSize: p.hand.length,
        // Per-slot card visibility:
        // - You see your own peeked slots fully.
        // - Anyone sees publicly-revealed slots.
        // - Round-over reveals everything.
        hand: p.hand.map((c, i) => {
          const youOwn = p.id === viewerId;
          const everyone = this.isPubliclyKnown(p.id, i);
          const isMemorize = this.phase === 'MEMORIZE' && youOwn && i < 2;
          const isRoundOver = this.phase === 'ROUND_OVER' || this.phase === 'GAME_OVER';
          const personallySeen = youOwn && viewer.seen.has(i);
          
          if (isRoundOver || everyone || isMemorize || personallySeen) {
            return { revealed: true, card: c, peeked: i < 2 || everyone || personallySeen };
          }
          return { revealed: false, card: null, peeked: false };
        }),
      })),
      results: this.phase === 'ROUND_OVER' || this.phase === 'GAME_OVER' ? this.lastResults : null,
    };
  }

  _effect(extra) {
    return { ...extra };
  }
}
