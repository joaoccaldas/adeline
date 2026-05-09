import { buildDeck, shuffle } from './deck.js';
import { cardValue, hasPower, powerOf, cardName, POWER_LABEL } from './cards.js';
import { POWERS } from './powers.js';
import { Player } from './player.js';
const HAND_SIZE = 4;
const ADELINE_PENALTY = 10;
export class GameEngine {
  constructor({ roundLimit = 5 } = {}) {
    this.players = [];
    this.hostId = null;
    this.phase = 'LOBBY';
    this.round = 0;
    this.roundLimit = roundLimit;
    this.deck = [];
    this.discard = [];
    this.drawn = null;
    this.currentSeat = 0;
    this.adeline = null;
    this.publicKnown = {};
    this.pendingPower = null;
    this.lastResults = null;
  }
  player(id) { return this.players.find(p => p.id === id); }
  current() { return this.players[this.currentSeat]; }
  cardAt(pid, slot) { return this.player(pid)?.hand[slot]; }
  isHost(id) { return id === this.hostId; }
  isPubliclyKnown(pid, slot) { return this.publicKnown[pid]?.has(slot) ?? false; }
  markPubliclyKnown(pid, slot) {
    if (!this.publicKnown[pid]) this.publicKnown[pid] = new Set();
    this.publicKnown[pid].add(slot);
    this.player(pid)?.seen.add(slot);
  }
  addPlayer({ id, name }) {
    if (this.phase !== 'LOBBY') throw new Error('Jogo ja iniciado');
    if (this.players.length >= 6) throw new Error('Sala cheia');
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
    } else { const p = this.player(id); if (p) p.connected = false; }
  }
  setRoundLimit(n) { if (this.phase !== 'LOBBY') return; this.roundLimit = Number(n) || 5; }
  start() {
    if (this.phase !== 'LOBBY') throw new Error('Ja iniciado');
    if (this.players.length < 2) throw new Error('Precisa de 2+ jogadores');
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
    for (const p of this.players) { for (let i = 0; i < HAND_SIZE; i++) p.hand.push(this.deck.pop()); }
    this.discard.push(this.deck.pop());
    this.currentSeat = 0;
    this.phase = 'MEMORIZE';
    return this._effect({ log: 'Inicio da Rodada ' + this.round + '. Memorize suas 2 primeiras cartas!' });
  }
  startTurns() {
    if (this.phase !== 'MEMORIZE') return this._effect({});
    this.phase = 'TURN_START';
    return this._effect({ log: 'O tempo acabou! Turno de ' + this.current().name + '.' });
  }
  drawFromDeck(pid) {
    this._assertTurn(pid);
    if (this.phase !== 'TURN_START') throw new Error('Nao pode comprar agora');
    this.recycleDeckIfNeeded();
    const card = this.deck.pop();
    if (!card) throw new Error('Baralho vazio');
    this.drawn = { card, source: 'DECK' };
    this.phase = 'DRAWN';
    return this._effect({ log: this.current().name + ' comprou do baralho.' });
  }
  takeDiscard(pid) {
    this._assertTurn(pid);
    if (this.phase !== 'TURN_START') throw new Error('Nao pode pegar agora');
    const top = this.discard.pop();
    if (!top) throw new Error('Descarte vazio');
    this.drawn = { card: top, source: 'DISCARD' };
    this.phase = 'TAKE_DISCARD';
    return this._effect({ log: this.current().name + ' pegou ' + cardName(top) + ' do descarte.' });
  }
  swapDrawn(pid, slot) {
    this._assertTurn(pid);
    if (this.phase !== 'DRAWN' && this.phase !== 'TAKE_DISCARD') throw new Error('Nao pode trocar');
    const p = this.current();
    const replaced = p.hand[slot];
    p.hand[slot] = this.drawn.card;
    p.seen.add(slot);
    this.discard.push(replaced);
    const log = p.name + ' trocou por ' + cardName(this.drawn.card) + ' e descartou ' + cardName(replaced) + '.';
    this.drawn = null;
    return this._endTurn(log);
  }
  discardDrawn(pid) {
    this._assertTurn(pid);
    if (this.phase !== 'DRAWN') throw new Error('Nao pode descartar');
    this.discard.push(this.drawn.card);
    const log = this.current().name + ' descartou ' + cardName(this.drawn.card) + '.';
    this.drawn = null;
    return this._endTurn(log);
  }
  usePower(pid) {
    this._assertTurn(pid);
    if (this.phase !== 'DRAWN') throw new Error('Nao pode usar poder');
    if (!hasPower(this.drawn?.card)) throw new Error('Sem poder');
    const code = powerOf(this.drawn.card);
    const card = this.drawn.card;
    this.discard.push(card);
    this.drawn = null;
    const power = POWERS[code];
    if (power.prompts.length === 0) { const out = power.apply(this, [], this.current()); return this._endTurn(out.log ?? ''); }
    this.pendingPower = { code, picks: [], promptIdx: 0, actorId: this.current().id };
    this.phase = 'POWER_PROMPT';
    return this._effect({ log: this.current().name + ' usa ' + cardName(card) + ' - ' + POWER_LABEL[code] + '.' });
  }
  powerTarget(pid, target) {
    if (this.phase !== 'POWER_PROMPT') throw new Error('Sem poder ativo');
    if (this.pendingPower.actorId !== pid) throw new Error('Nao e seu poder');
    const power = POWERS[this.pendingPower.code];
    const prompt = power.prompts[this.pendingPower.promptIdx];
    this._validateTarget(prompt, pid, target);
    this.pendingPower.picks.push(target);
    this.pendingPower.promptIdx++;
    if (this.pendingPower.promptIdx < power.prompts.length) return this._effect({});
    const actor = this.player(this.pendingPower.actorId);
    const out = power.apply(this, this.pendingPower.picks, actor);
    this.pendingPower = null;
    return this._endTurn(out.log ?? '', out);
  }
  callAdeline(pid) {
    this._assertTurn(pid);
    if (this.phase !== 'TURN_START') throw new Error('Nao pode chamar');
    if (this.adeline) throw new Error('Ja chamou');
    this.adeline = { callerId: pid, turnsLeft: this.players.length - 1 };
    return this._advanceTurn(this.current().name + ' chamou Adelinete!', true);
  }
  _endTurn(log, extra = {}) {
    if (this.adeline) { this.adeline.turnsLeft--; if (this.adeline.turnsLeft <= 0) return this._finishRound(log, extra); }
    return this._advanceTurn(log, false, extra);
  }
  _advanceTurn(log, fromCall, extra = {}) {
    let next = (this.currentSeat + 1) % this.players.length;
    if (this.adeline) { const cs = this.players.findIndex(p => p.id === this.adeline.callerId); if (next === cs) next = (next + 1) % this.players.length; }
    this.currentSeat = next;
    this.phase = 'TURN_START';
    const tl = fromCall ? '' : ' Turno de ' + this.current().name + '.';
    return this._effect({ log: log + tl, ...extra });
  }
  _finishRound(el = '', extra = {}) {
    this.phase = 'ROUND_OVER';
    const scores = this.players.map(p => ({ id: p.id, name: p.name, raw: p.hand.reduce((s, c) => s + cardValue(c), 0), penalty: 0 }));
    const lowest = Math.min(...scores.map(s => s.raw));
    const cid = this.adeline?.callerId;
    if (cid) { const cs = scores.find(s => s.id === cid); if (cs && cs.raw > lowest) cs.penalty = 10; }
    for (const s of scores) { s.total = s.raw + s.penalty; const pl = this.player(s.id); pl.score += s.total; s.cumulative = pl.score; s.hand = pl.hand; }
    this.lastResults = { round: this.round, scores, lowest, callerId: cid };
    return this._effect({ log: (el ? el + ' ' : '') + 'Fim da rodada.', roundEnd: this.lastResults, ...extra });
  }
  nextRound(pid) {
    if (!this.isHost(pid)) throw new Error('Somente o dono');
    if (this.phase !== 'ROUND_OVER') throw new Error('Rodada nao acabou');
    if (this.round >= this.roundLimit) {
      this.phase = 'GAME_OVER';
      const ranking = [...this.players].sort((a, b) => a.score - b.score).map(p => ({ id: p.id, name: p.name, score: p.score }));
      return this._effect({ log: 'Fim de jogo.', gameEnd: { ranking } });
    }
    this.round++;
    return this._startRound();
  }
  recycleDeckIfNeeded() { if (this.deck.length > 0) return; const top = this.discard.pop(); this.deck = shuffle(this.discard); this.discard = top ? [top] : []; }
  _assertTurn(pid) { if (this.current()?.id !== pid) throw new Error('Nao e seu turno'); }
  _validateTarget(prompt, actorId, target) {
    if (!target || typeof target.playerId !== 'string') throw new Error('Alvo invalido');
    const tp = this.player(target.playerId);
    if (!tp) throw new Error('Jogador desconhecido');
    if (prompt.kind === 'OWN_CARD' && target.playerId !== actorId) throw new Error('Deve ser sua carta');
    if (prompt.kind === 'OTHER_CARD' && target.playerId === actorId) throw new Error('Deve ser outro jogador');
    if (prompt.kind === 'OTHER_PLAYER' && target.playerId === actorId) throw new Error('Deve ser outro jogador');
    if (prompt.kind !== 'OTHER_PLAYER') { if (typeof target.slot !== 'number') throw new Error('Posicao invalida'); if (target.slot < 0 || target.slot >= tp.hand.length) throw new Error('Posicao invalida'); }
  }
  viewFor(viewerId) {
    const viewer = this.player(viewerId);
    return {
      phase: this.phase, round: this.round, roundLimit: this.roundLimit, hostId: this.hostId,
      currentPlayerId: this.current()?.id ?? null, deckCount: this.deck.length,
      discardTop: this.discard[this.discard.length - 1] ?? null,
      drawnCard: this.drawn && this.current()?.id === viewerId ? this.drawn.card : null,
      drawnIsTaken: !!this.drawn, drawnSource: this.drawn?.source ?? null,
      adelineCallerId: this.adeline?.callerId ?? null, adelineTurnsLeft: this.adeline?.turnsLeft ?? 0,
      pendingPower: this.pendingPower ? { code: this.pendingPower.code, label: POWER_LABEL[this.pendingPower.code], actorId: this.pendingPower.actorId, promptIdx: this.pendingPower.promptIdx, promptsTotal: POWERS[this.pendingPower.code].prompts.length, currentPrompt: POWERS[this.pendingPower.code].prompts[this.pendingPower.promptIdx]?.kind ?? null } : null,
      players: this.players.map(p => ({
        id: p.id, name: p.name, score: p.score, connected: p.connected, handSize: p.hand.length,
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
  _effect(extra) { return { ...extra }; }
}
