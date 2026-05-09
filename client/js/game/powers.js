// Power resolution. Each power is a small state machine that asks the player
// for one or more targets, then mutates engine state.
import { shuffle } from './deck.js';
import { cardName } from './cards.js';
// Powers: PEEK_SELF, PEEK_OTHER, BLIND_SWAP, PEEK_TWO_SELF, REVEAL_ANY, FORCE_DISCARD, RESHUFFLE, WILD_SWAP

export const POWERS = {
  PEEK_SELF: {
    label: 'Espiar sua carta',
    prompts: [{ kind: 'OWN_CARD' }],
    apply(engine, picks, actor) {
      const [{ playerId, slot }] = picks;
      actor.seen.add(slot);
      return {
        peek: { toPlayerId: actor.id, playerId, slot, card: engine.cardAt(playerId, slot) },
        log: `${actor.name} espiou uma de suas cartas.`,
      };
    },
  },

  PEEK_OTHER: {
    label: 'Espiar carta alheia',
    prompts: [{ kind: 'OTHER_CARD' }],
    apply(engine, picks, actor) {
      const [{ playerId, slot }] = picks;
      const target = engine.player(playerId);
      return {
        peek: { toPlayerId: actor.id, playerId, slot, card: engine.cardAt(playerId, slot) },
        log: `${actor.name} espiou uma carta de ${target.name}.`,
      };
    },
  },

  BLIND_SWAP: {
    label: 'Troca cega',
    prompts: [{ kind: 'OWN_CARD' }, { kind: 'OTHER_CARD' }],
    apply(engine, picks, actor) {
      const [own, other] = picks;
      const ownPlayer = actor;
      const otherPlayer = engine.player(other.playerId);
      const a = ownPlayer.hand[own.slot];
      const b = otherPlayer.hand[other.slot];
      ownPlayer.hand[own.slot] = b;
      otherPlayer.hand[other.slot] = a;
      ownPlayer.seen.delete(own.slot);
      otherPlayer.seen.delete(other.slot);
      return {
        swap: { ownPlayerId: actor.id, ownSlot: own.slot, otherPlayerId: other.playerId, otherSlot: other.slot },
        log: `${actor.name} fez uma troca cega com ${otherPlayer.name}.`,
      };
    },
  },

  PEEK_TWO_SELF: {
    label: 'Espiar 2 cartas próprias',
    prompts: [{ kind: 'OWN_CARD' }, { kind: 'OWN_CARD' }],
    apply(engine, picks, actor) {
      const peeks = picks.map(p => {
        actor.seen.add(p.slot);
        return { toPlayerId: actor.id, playerId: actor.id, slot: p.slot, card: engine.cardAt(actor.id, p.slot) };
      });
      return { peeks, log: `${actor.name} espiou duas de suas cartas.` };
    },
  },

  REVEAL_ANY: {
    label: 'Revelar carta',
    prompts: [{ kind: 'ANY_CARD' }],
    apply(engine, picks, actor) {
      const [{ playerId, slot }] = picks;
      const target = engine.player(playerId);
      const card = engine.cardAt(playerId, slot);
      engine.markPubliclyKnown(playerId, slot);
      return {
        publicReveal: { playerId, slot, card },
        log: `${actor.name} revelou a carta ${slot + 1} de ${target.name}: ${cardName(card)}.`,
      };
    },
  },

  FORCE_DISCARD: {
    label: 'Forçar descarte',
    prompts: [{ kind: 'OTHER_PLAYER' }],
    apply(engine, picks, actor) {
      const [{ playerId }] = picks;
      const target = engine.player(playerId);
      const slot = Math.floor(Math.random() * target.hand.length);
      const discarded = target.hand[slot];
      engine.recycleDeckIfNeeded();
      const replacement = engine.deck.pop();
      target.hand[slot] = replacement;
      target.seen.delete(slot);
      engine.discard.push(discarded);
      return { log: `${actor.name} forçou ${target.name} a descartar a posição ${slot + 1} (${cardName(discarded)}).` };
    },
  },

  RESHUFFLE: {
    label: 'Embaralhar descarte',
    prompts: [],
    apply(engine, _picks, actor) {
      const top = engine.discard.pop();
      const merged = shuffle([...engine.deck, ...engine.discard]);
      engine.deck = merged;
      engine.discard = top ? [top] : [];
      return { log: `${actor.name} embaralhou o descarte de volta no baralho.` };
    },
  },

  WILD_SWAP: {
    label: 'Troca livre',
    prompts: [{ kind: 'ANY_CARD' }, { kind: 'ANY_CARD' }],
    apply(engine, picks, actor) {
      const [a, b] = picks;
      const pa = engine.player(a.playerId);
      const pb = engine.player(b.playerId);
      const ca = pa.hand[a.slot];
      const cb = pb.hand[b.slot];
      pa.hand[a.slot] = cb;
      pb.hand[b.slot] = ca;
      pa.seen.delete(a.slot);
      pb.seen.delete(b.slot);
      return {
        swap: { ownPlayerId: a.playerId, ownSlot: a.slot, otherPlayerId: b.playerId, otherSlot: b.slot },
        log: `${actor.name} fez uma troca livre entre duas cartas.`,
      };
    },
  },
};
