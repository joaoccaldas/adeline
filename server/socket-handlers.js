// Wires Socket.IO events to the game engine. The engine itself knows nothing
// about sockets — this file is the only transport-coupled piece.
import { RoomRegistry } from './game/room.js';
import { AiPlayer } from './game/ai.js';
import { POWERS } from './game/powers.js';

const registry = new RoomRegistry();

// socket -> { roomCode, playerId }
const memberOf = new WeakMap();

export function attachSocketHandlers(io) {
  // Periodic cleanup of empty rooms.
  setInterval(() => {
    for (const [code, room] of registry.rooms) {
      if (room.isEmpty() && Date.now() - room.createdAt > 10 * 60 * 1000) {
        registry.remove(code);
      }
    }
  }, 60_000).unref();

  io.on('connection', socket => {
    socket.on('room:create', ({ name, roundLimit }, cb) => {
      try {
        const cleanName = sanitizeName(name);
        const room = registry.create({ hostName: cleanName, roundLimit });
        room.engine.addPlayer({ id: socket.id, name: cleanName });
        memberOf.set(socket, { roomCode: room.code, playerId: socket.id });
        socket.join(room.code);
        cb?.({ ok: true, code: room.code, playerId: socket.id });
        broadcastState(io, room);
      } catch (err) {
        cb?.({ ok: false, error: err.message });
      }
    });

    socket.on('room:join', ({ code, name }, cb) => {
      try {
        const room = registry.get(code);
        if (!room) throw new Error('Sala não encontrada');
        const cleanName = sanitizeName(name);
        // Reconnect support: if a player with the same name is disconnected, restore them.
        const existing = room.engine.players.find(p => p.name === cleanName && !p.connected);
        if (existing && room.engine.phase !== 'LOBBY') {
          const oldId = existing.id;
          existing.id = socket.id;
          if (room.engine.publicKnown[oldId]) {
            room.engine.publicKnown[socket.id] = room.engine.publicKnown[oldId];
            delete room.engine.publicKnown[oldId];
          }
          if (room.engine.adeline?.callerId === oldId) room.engine.adeline.callerId = socket.id;
          if (room.engine.pendingPower?.actorId === oldId) room.engine.pendingPower.actorId = socket.id;
          room.engine.reconnect(socket.id);
        } else {
          room.engine.addPlayer({ id: socket.id, name: cleanName });
        }
        memberOf.set(socket, { roomCode: room.code, playerId: socket.id });
        socket.join(room.code);
        cb?.({ ok: true, code: room.code, playerId: socket.id });
        broadcastState(io, room);
      } catch (err) {
        cb?.({ ok: false, error: err.message });
      }
    });

    socket.on('room:leave', () => leave(io, socket));

    socket.on('game:setRoundLimit', ({ roundLimit }, cb) => {
      const ctx = run(io, socket, room => {
        if (!room.engine.isHost(socket.id)) throw new Error('Somente o dono');
        room.engine.setRoundLimit(roundLimit);
      });
      cb?.(ctx);
    });

    socket.on('game:start', (_, cb) => {
      const ctx = run(io, socket, room => {
        if (!room.engine.isHost(socket.id)) throw new Error('Somente o dono pode começar');
        const fx = room.engine.start();
        deliverEffect(io, room, fx);
        startMemorizeTimer(io, room);
      });
      cb?.(ctx);
    });

    socket.on('room:addBot', (_, cb) => {
      const ctx = run(io, socket, room => {
        if (!room.engine.isHost(socket.id)) throw new Error('Somente o dono pode adicionar bots');
        if (room.engine.phase !== 'LOBBY') throw new Error('Bots só podem ser adicionados no lobby');
        const botIdx = room.bots.length + 1;
        const botName = `Bot ${botIdx}`;
        const botId = `bot-${Date.now()}-${botIdx}`;
        const ai = new AiPlayer(botId);
        room.engine.addPlayer({ id: botId, name: botName });
        room.bots.push(ai);
        broadcastState(io, room);
      });
      cb?.(ctx);
    });

    socket.on('game:startTurns', (_, cb) => {
      const ctx = run(io, socket, room => {
        const fx = room.engine.startTurns();
        deliverEffect(io, room, fx);
        tickBots(io, room);
      });
      cb?.(ctx);
    });

    socket.on('game:drawDeck', (_, cb) => {
      const ctx = run(io, socket, room => {
        deliverEffect(io, room, room.engine.drawFromDeck(socket.id));
        tickBots(io, room);
      });
      cb?.(ctx);
    });

    socket.on('game:takeDiscard', (_, cb) => {
      const ctx = run(io, socket, room => {
        deliverEffect(io, room, room.engine.takeDiscard(socket.id));
        tickBots(io, room);
      });
      cb?.(ctx);
    });

    socket.on('game:swapDrawn', ({ slot }, cb) => {
      const ctx = run(io, socket, room => {
        deliverEffect(io, room, room.engine.swapDrawn(socket.id, slot));
        tickBots(io, room);
      });
      cb?.(ctx);
    });

    socket.on('game:discardDrawn', (_, cb) => {
      const ctx = run(io, socket, room => {
        deliverEffect(io, room, room.engine.discardDrawn(socket.id));
        tickBots(io, room);
      });
      cb?.(ctx);
    });

    socket.on('game:usePower', (_, cb) => {
      const ctx = run(io, socket, room => {
        deliverEffect(io, room, room.engine.usePower(socket.id));
        tickBots(io, room);
      });
      cb?.(ctx);
    });

    socket.on('game:powerTarget', (target, cb) => {
      const ctx = run(io, socket, room => {
        deliverEffect(io, room, room.engine.powerTarget(socket.id, target));
        tickBots(io, room);
      });
      cb?.(ctx);
    });

    socket.on('game:callAdeline', (_, cb) => {
      const ctx = run(io, socket, room => {
        deliverEffect(io, room, room.engine.callAdeline(socket.id));
        tickBots(io, room);
      });
      cb?.(ctx);
    });

    socket.on('game:nextRound', (_, cb) => {
      const ctx = run(io, socket, room => {
        const fx = room.engine.nextRound(socket.id);
        deliverEffect(io, room, fx);
        startMemorizeTimer(io, room);
        tickBots(io, room);
      });
      cb?.(ctx);
    });

    socket.on('disconnect', () => leave(io, socket));
  });
}

function run(io, socket, fn) {
  try {
    const meta = memberOf.get(socket);
    if (!meta) return { ok: false, error: 'Não está em uma sala' };
    const room = registry.get(meta.roomCode);
    if (!room) return { ok: false, error: 'Sala finalizada' };
    fn(room);
    return { ok: true };
  } catch (err) {
    socket.emit('error:msg', { message: err.message });
    return { ok: false, error: err.message };
  }
}

function leave(io, socket) {
  const meta = memberOf.get(socket);
  if (!meta) return;
  const room = registry.get(meta.roomCode);
  memberOf.delete(socket);
  if (!room) return;
  room.engine.removePlayer(socket.id);
  socket.leave(room.code);
  broadcastState(io, room);
  if (room.isEmpty()) registry.remove(room.code);
}

function deliverEffect(io, room, effect) {
  if (!effect) return;
  if (effect.log) io.to(room.code).emit('game:log', { text: effect.log });
  // Private peek payloads
  if (effect.peek) sendPeek(io, room, effect.peek);
  if (effect.peeks) effect.peeks.forEach(p => sendPeek(io, room, p));
  // Public reveals get sent as a transient toast/log; the resulting state
  // already marks the slot as publicly known so the next snapshot reflects it.
  if (effect.publicReveal) {
    io.to(room.code).emit('game:publicReveal', effect.publicReveal);
  }
  if (effect.roundEnd) io.to(room.code).emit('game:roundEnd', effect.roundEnd);
  if (effect.gameEnd) io.to(room.code).emit('game:gameEnd', effect.gameEnd);
  broadcastState(io, room);
}

function sendPeek(io, room, peek) {
  // Send the actual card only to the peeker.
  io.to(peek.toPlayerId).emit('game:peek', {
    playerId: peek.playerId,
    slot: peek.slot,
    card: peek.card,
  });
}

function broadcastState(io, room) {
  // Personalize the state per player.
  for (const player of room.engine.players) {
    if (!player.connected) continue;
    io.to(player.id).emit('game:state', {
      code: room.code,
      you: player.id,
      ...room.engine.viewFor(player.id),
    });
  }
}

function sanitizeName(name) {
  const trimmed = String(name ?? '').trim().slice(0, 16);
  return trimmed || 'Jogador';
}

function startMemorizeTimer(io, room) {
  if (room.engine.phase !== 'MEMORIZE') return;
  setTimeout(() => {
    if (room.engine.phase === 'MEMORIZE') {
      const fx = room.engine.startTurns();
      deliverEffect(io, room, fx);
      tickBots(io, room);
    }
  }, 3000);
}

/** Execute the next bot turn if the current player is a bot. */
function tickBots(io, room) {
  const { engine } = room;
  if (['LOBBY', 'MEMORIZE', 'ROUND_OVER', 'GAME_OVER'].includes(engine.phase)) return;
  const current = engine.current();
  if (!current) return;
  const bot = room.bots.find(b => b.id === current.id);
  if (!bot) return;

  setTimeout(() => {
    try {
      let effect = null;
      if (engine.phase === 'TURN_START') {
        const action = bot.decideTurnStart(engine);
        if (action === 'callAdeline') effect = engine.callAdeline(bot.id);
        else if (action === 'takeDiscard') effect = engine.takeDiscard(bot.id);
        else effect = engine.drawFromDeck(bot.id);
      } else if (engine.phase === 'DRAWN') {
        const dec = bot.decideDrawn(engine.drawn.card);
        if (dec.action === 'usePower') effect = engine.usePower(bot.id);
        else if (dec.action === 'swapDrawn') {
          bot.recordSwapIn(dec.slot, engine.drawn.card);
          effect = engine.swapDrawn(bot.id, dec.slot);
        } else effect = engine.discardDrawn(bot.id);
      } else if (engine.phase === 'TAKE_DISCARD') {
        const slot = bot.decideSwapForTakeDiscard();
        bot.recordSwapIn(slot, engine.drawn.card);
        effect = engine.swapDrawn(bot.id, slot);
      } else if (engine.phase === 'POWER_PROMPT' && engine.pendingPower?.actorId === bot.id) {
        const pp = engine.pendingPower;
        const promptKind = POWERS[pp.code].prompts[pp.promptIdx].kind;
        const target = bot.decidePowerTarget(promptKind, bot.id, engine.players);
        effect = engine.powerTarget(bot.id, target);
      }
      if (effect) {
        if (effect.peek && effect.peek.toPlayerId === bot.id) {
          bot.recordPeek(effect.peek.slot, effect.peek.card);
        }
        deliverEffect(io, room, effect);
        tickBots(io, room);
      }
    } catch (e) {
      console.error('[Bot]', current.name, e.message);
    }
  }, 800);
}
