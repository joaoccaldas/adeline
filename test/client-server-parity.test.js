import test from 'node:test';
import assert from 'node:assert/strict';

import * as clientCards from '../client/js/game/cards.js';
import * as serverCards from '../server/game/cards.js';
import * as clientDeck from '../client/js/game/deck.js';
import * as serverDeck from '../server/game/deck.js';
import { Player as ClientPlayer } from '../client/js/game/player.js';
import { Player as ServerPlayer } from '../server/game/player.js';

function canonicalCard(card) {
  return `${card.rank}:${card.suit ?? 'NONE'}`;
}

test('client/server card tables stay in parity', () => {
  assert.deepEqual(clientCards.SUITS, serverCards.SUITS);
  assert.deepEqual(clientCards.RANKS, serverCards.RANKS);
  assert.deepEqual(clientCards.POWER_LABEL, serverCards.POWER_LABEL);
});

test('client/server scoring and powers agree for every card', () => {
  const cards = [
    ...clientCards.SUITS.flatMap((suit) =>
      clientCards.RANKS.map((rank) => ({ rank, suit }))
    ),
    { rank: 'JOKER', suit: null },
  ];

  for (const card of cards) {
    assert.equal(clientCards.cardValue(card), serverCards.cardValue(card), canonicalCard(card));
    assert.equal(clientCards.powerOf(card), serverCards.powerOf(card), canonicalCard(card));
    assert.equal(clientCards.hasPower(card), serverCards.hasPower(card), canonicalCard(card));
    assert.equal(clientCards.cardName(card), serverCards.cardName(card), canonicalCard(card));
  }
});

test('client/server deck composition agrees independent of random IDs/order', () => {
  const client = clientDeck.buildDeck().map(canonicalCard).sort();
  const server = serverDeck.buildDeck().map(canonicalCard).sort();
  assert.equal(client.length, 54);
  assert.deepEqual(client, server);
});

test('client/server player public state stays compatible', () => {
  const input = { id: 'player-1', name: 'Player 1' };
  const client = new ClientPlayer(input);
  const server = new ServerPlayer(input);

  assert.deepEqual(client.publicView(), server.publicView());
  client.score = server.score = 42;
  client.connected = server.connected = false;
  assert.deepEqual(client.publicView(), server.publicView());

  client.hand = [{ rank: 'A', suit: 'S' }];
  server.hand = [{ rank: 'A', suit: 'S' }];
  client.seen.add(0);
  server.seen.add(0);
  client.reset();
  server.reset();

  assert.deepEqual(client.publicView(), server.publicView());
  assert.equal(client.hand.length, 0);
  assert.equal(server.hand.length, 0);
  assert.equal(client.seen.size, 0);
  assert.equal(server.seen.size, 0);
});
