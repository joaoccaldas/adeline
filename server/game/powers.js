// Power resolution. Each power is a small state machine that asks the player
// for one or more targets, then mutates engine state.
//
// Each power exports:
//   prompts:  ordered list of prompt definitions the engine walks through.
//   apply:    fn(engine, picks) -> { peekResults?, publicReveal?, log }
//
// A "prompt" describes WHAT the engine needs from the player next:
//   { kind: 'OWN_CARD' | 'OTHER_CARD' | 'ANY_CARD' | 'OWN_TWO' | 'OTHER_PLAYER' }
//
// The engine collects answers one at a time, then calls `apply` with all picks.
import { shuffle } from './deck.js';
import { cardName } from './cards.js';

export const POWERS = {
  PEEK_SELF: {
    label: 'Peek own card',
    prompts: [{ kind: 'OWN_CARD' }],
    apply(engine, picks, actor) {
      const [{ playerId, slot }] = picks;
      actor.seen.add(slot);
      return {
        peek: { toPlayerId: actor.id, playerId, slot, card: engine.cardAt(playerId, slot) },
        log: `${actor.name} peeked at one of their own cards.`,
      };
    },
  },

  PEEK_OTHER: {
    label: 'Peek opponent card',
    prompts: [{ kind: 'OTHER_CARD' }],
    apply(engine, picks, actor) {
      const [{ playerId, slot }] = picks;
      const target = engine.player(playerId);
      return {
        peek: { toPlayerId: actor.id, playerId, slot, card: engine.cardAt(playerId, slot) },
        log: `${actor.name} peeked at one of ${target.name}'s cards.`,
      };
    },
  },

  BLIND_SWAP: {
    label: 'Blind swap',
    prompts: [{ kind: 'OWN_CARD' }, { kind: 'OTHER_CARD' }],
    apply(engine, picks, actor) {
      const [own, other] = picks;
      const ownPlayer = actor;
      const otherPlayer = engine.player(other.playerId);
      const a = ownPlayer.hand[own.slot];
      const b = otherPlayer.hand[other.slot];
      ownPlayer.hand[own.slot] = b;
      otherPlayer.hand[other.slot] = a;
      // Both players lose knowledge of the slot they swapped.
      ownPlayer.seen.delete(own.slot);
      otherPlayer.seen.delete(other.slot);
      return { log: `${actor.name} blind-swapped a card with ${otherPlayer.name}.` };
    },
  },

  PEEK_TWO_SELF: {
    label: 'Peek 2 own cards',
    prompts: [{ kind: 'OWN_CARD' }, { kind: 'OWN_CARD' }],
    apply(engine, picks, actor) {
      const peeks = picks.map(p => {
        actor.seen.add(p.slot);
        return { toPlayerId: actor.id, playerId: actor.id, slot: p.slot, card: engine.cardAt(actor.id, p.slot) };
      });
      return {
        peeks,
        log: `${actor.name} peeked at two of their own cards.`,
      };
    },
  },

  REVEAL_ANY: {
    label: 'Reveal a card',
    prompts: [{ kind: 'ANY_CARD' }],
    apply(engine, picks, actor) {
      const [{ playerId, slot }] = picks;
      const target = engine.player(playerId);
      const card = engine.cardAt(playerId, slot);
      // Public reveal — every player sees the card; mark it as known to all.
      engine.markPubliclyKnown(playerId, slot);
      return {
        publicReveal: { playerId, slot, card },
        log: `${actor.name} forced ${target.name}'s slot ${slot + 1} to be revealed: ${cardName(card)}.`,
      };
    },
  },

  FORCE_DISCARD: {
    label: 'Force discard',
    prompts: [{ kind: 'OTHER_PLAYER' }],
    apply(engine, picks, actor) {
      const [{ playerId }] = picks;
      const target = engine.player(playerId);
      // Pick a random slot from the target's hand.
      const slot = Math.floor(Math.random() * target.hand.length);
      const discarded = target.hand[slot];
      // Replace from deck (face-down to everyone).
      engine.recycleDeckIfNeeded();
      const replacement = engine.deck.pop();
      target.hand[slot] = replacement;
      target.seen.delete(slot);
      engine.discard.push(discarded);
      return {
        log: `${actor.name} forced ${target.name} to discard slot ${slot + 1} (${cardName(discarded)}).`,
      };
    },
  },

  RESHUFFLE: {
    label: 'Reshuffle deck',
    prompts: [],
    apply(engine, _picks, actor) {
      const top = engine.discard.pop();
      const merged = shuffle([...engine.deck, ...engine.discard]);
      engine.deck = merged;
      engine.discard = top ? [top] : [];
      return { log: `${actor.name} reshuffled the discard pile back into the deck.` };
    },
  },

  WILD_SWAP: {
    label: 'Wild swap',
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
      return { log: `${actor.name} wild-swapped two cards on the table.` };
    },
  },
};
