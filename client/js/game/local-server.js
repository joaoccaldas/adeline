/**
 * LocalServer — simulates the Socket.IO backend in the client.
 */
import { GameEngine } from './engine.js';
import { AIPlayer } from './ai.js';

export class LocalServer {
  constructor(onEvent) {
    this.onEvent = onEvent;
    this.engine = null;
    this.ais = [];
    this.myId = 'player-1';
  }

  async handle(event, payload) {
    try {
      let effect = null;

      switch (event) {
        case 'room:create':
          this.engine = new GameEngine({ roundLimit: payload.roundLimit || 5 });
          this.engine.addPlayer({ id: this.myId, name: payload.name });
          // Auto-add 2 AI bots
          this.addAI('Bot Alpha');
          this.addAI('Bot Beta');
          // Push lobby state
          this._pushState();
          return { ok: true, id: this.myId };

        case 'game:start':
          effect = this.engine.start();
          this._broadcastEffect(effect);
          this._startMemorizeTimer();
          return { ok: true };

        case 'game:drawDeck':
          effect = this.engine.drawFromDeck(this.myId);
          this._broadcastEffect(effect);
          this._tickAI();
          return { ok: true };

        case 'game:takeDiscard':
          effect = this.engine.takeDiscard(this.myId);
          this._broadcastEffect(effect);
          this._tickAI();
          return { ok: true };

        case 'game:swapDrawn':
          effect = this.engine.swapDrawn(this.myId, payload.slot);
          this._broadcastEffect(effect);
          this._tickAI();
          return { ok: true };

        case 'game:discardDrawn':
          effect = this.engine.discardDrawn(this.myId);
          this._broadcastEffect(effect);
          this._tickAI();
          return { ok: true };

        case 'game:usePower':
          effect = this.engine.usePower(this.myId);
          this._broadcastEffect(effect);
          this._tickAI();
          return { ok: true };

        case 'game:powerTarget':
          effect = this.engine.powerTarget(this.myId, payload);
          this._broadcastEffect(effect);
          this._tickAI();
          return { ok: true };

        case 'game:callAdeline':
          effect = this.engine.callAdeline(this.myId);
          this._broadcastEffect(effect);
          this._tickAI();
          return { ok: true };

        case 'game:nextRound':
          effect = this.engine.nextRound(this.myId);
          this._broadcastEffect(effect);
          this._startMemorizeTimer();
          return { ok: true };

        case 'game:setRoundLimit':
          this.engine.setRoundLimit(payload.roundLimit || payload);
          this._pushState();
          return { ok: true };

        default:
          return { ok: false, error: 'Evento desconhecido: ' + event };
      }
    } catch (e) {
      console.error('[LocalServer] Erro:', e);
      return { ok: false, error: e.message };
    }
  }

  addAI(name) {
    const id = 'ai-' + Math.random().toString(36).slice(2, 6);
    this.engine.addPlayer({ id, name });
    this.ais.push(new AIPlayer(id, name));
  }

  _broadcastEffect(effect) {
    if (!effect) return;
    if (effect.log) this.onEvent('game:log', { text: effect.log });
    if (effect.peek) {
      this.onEvent('game:peek', effect.peek);
      this.ais.forEach(ai => ai.observe('peek', effect.peek));
    }
    if (effect.peeks) {
      effect.peeks.forEach(p => {
        this.onEvent('game:peek', p);
        this.ais.forEach(ai => ai.observe('peek', p));
      });
    }
    if (effect.swap) {
      this.ais.forEach(ai => ai.observe('swap', effect.swap));
    }
    if (effect.publicReveal) {
      this.onEvent('game:publicReveal', effect.publicReveal);
    }
    if (effect.roundEnd) {
      this.onEvent('game:roundEnd', effect.roundEnd);
      this.ais.forEach(ai => ai.observe('roundEnd', effect.roundEnd));
    }
    if (effect.gameEnd) this.onEvent('game:gameEnd', effect.gameEnd);
    this._pushState();
  }

  _pushState() {
    const view = this.engine.viewFor(this.myId);
    this.onEvent('game:state', view);
  }

  _startMemorizeTimer() {
    if (this.engine.phase !== 'MEMORIZE') return;
    setTimeout(() => {
      if (this.engine && this.engine.phase === 'MEMORIZE') {
        const eff = this.engine.startTurns();
        this._broadcastEffect(eff);
        this._tickAI();
      }
    }, 3000);
  }

  _tickAI() {
    setTimeout(() => {
      if (!this.engine || this.engine.phase === 'ROUND_OVER' || this.engine.phase === 'GAME_OVER' || this.engine.phase === 'MEMORIZE') return;
      for (const ai of this.ais) {
        const decision = ai.decide(this.engine.viewFor(ai.id));
        if (decision) {
          setTimeout(() => {
            const effect = this._handleAIAction(ai.id, decision);
            if (effect) {
              this._broadcastEffect(effect);
              this._tickAI();
            }
          }, decision.delay || 500);
          return;
        }
      }
    }, 500);
  }

  _handleAIAction(aiId, decision) {
    try {
      const { event, payload } = decision;
      switch (event) {
        case 'game:drawDeck': return this.engine.drawFromDeck(aiId);
        case 'game:takeDiscard': return this.engine.takeDiscard(aiId);
        case 'game:swapDrawn': return this.engine.swapDrawn(aiId, payload.slot);
        case 'game:discardDrawn': return this.engine.discardDrawn(aiId);
        case 'game:usePower': return this.engine.usePower(aiId);
        case 'game:powerTarget': return this.engine.powerTarget(aiId, payload);
        case 'game:callAdeline': return this.engine.callAdeline(aiId);
        default: return null;
      }
    } catch (e) {
      console.warn(`[LocalServer] AI ${aiId} falhou:`, e.message);
      return null;
    }
  }
}
