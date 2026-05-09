/**
 * Net layer — wraps LocalServer (offline, vs bots) and Socket.IO (online, real multiplayer).
 * Call net.useLocal() or net.useOnline() to select the mode before making calls.
 */
import { setState, update, pushLog, recordPrivateKnown, clearPrivateKnown } from '../state/store.js';
import { showToast } from '../ui/toast.js';
import { LocalServer } from '../game/local-server.js';

let _mode = null;       // 'local' | 'online'
let _localServer = null;
let _ioSocket = null;

// ---- shared helpers ----
function _cardName(c) {
  if (!c) return '—';
  if (c.rank === 'JOKER') return 'Coringa';
  const glyph = { S: '♠', H: '♥', D: '♦', C: '♣' }[c.suit] || '';
  return c.rank + glyph;
}

function _routeEvent(event, data) {
  switch (event) {
    case 'game:state':
      setState({
        game: data,
        ...(data.code != null ? { roomCode: data.code } : {}),
        ...(data.you  != null ? { myId: data.you }     : {}),
        pendingPower: data.pendingPower,
        screen: data.phase === 'LOBBY' ? 'lobby' : 'game',
      });
      break;
    case 'game:log':
      pushLog(data.text);
      break;
    case 'game:peek':
      recordPrivateKnown(data.playerId, data.slot, data.card);
      showToast(`Você viu: ${_cardName(data.card)}`, 'peek', 2400);
      break;
    case 'game:roundEnd':
      update(s => { s.modal = { kind: 'roundEnd', data }; });
      clearPrivateKnown();
      break;
    case 'game:gameEnd':
      update(s => { s.modal = { kind: 'gameEnd', data }; });
      break;
    // game:publicReveal causes a subsequent game:state broadcast; no local action needed.
  }
}

// ---- local mode ----
function _ensureLocal() {
  if (!_localServer) {
    _localServer = new LocalServer(_routeEvent);
    setState({ connected: true, myId: _localServer.myId, mode: 'local' });
  }
  return _localServer;
}

async function _localCall(event, payload) {
  return _ensureLocal().handle(event, payload);
}

// ---- online mode ----
function _ensureOnline() {
  if (_ioSocket) return _ioSocket;
  // `io` is the global exposed by /socket.io/socket.io.js (served by Express automatically).
  _ioSocket = window.io({ autoConnect: true });

  _ioSocket.on('connect', () => setState({ connected: true, myId: _ioSocket.id, mode: 'online' }));
  _ioSocket.on('disconnect', () => setState({ connected: false }));

  _ioSocket.on('game:state', data => _routeEvent('game:state', data));
  _ioSocket.on('game:log', data => _routeEvent('game:log', data));
  _ioSocket.on('game:peek', data => _routeEvent('game:peek', data));
  _ioSocket.on('game:roundEnd', data => _routeEvent('game:roundEnd', data));
  _ioSocket.on('game:gameEnd', data => _routeEvent('game:gameEnd', data));
  _ioSocket.on('error:msg', data => showToast(data.message, 'error'));

  return _ioSocket;
}

function _onlineCall(event, payload) {
  return new Promise(resolve => {
    const sock = _ensureOnline();
    const timer = setTimeout(() => resolve({ ok: false, error: 'Tempo esgotado' }), 8000);
    sock.emit(event, payload, result => {
      clearTimeout(timer);
      resolve(result ?? { ok: true });
    });
  });
}

function _call(event, payload) {
  if (_mode === 'online') return _onlineCall(event, payload);
  return _localCall(event, payload);
}

// ---- public API ----
export const net = {
  /** Switch to offline mode (vs bots). Creates local engine immediately. */
  useLocal() {
    _mode = 'local';
    _ensureLocal();
  },

  /** Switch to online mode (real Socket.IO server). */
  useOnline() {
    _mode = 'online';
    _ensureOnline();
  },

  createRoom: ({ name, roundLimit }) => _call('room:create', { name, roundLimit }),
  joinRoom:   ({ code, name })        => _onlineCall('room:join', { code, name }),
  leaveRoom:  ()                      => {
    if (_ioSocket) _ioSocket.emit('room:leave');
    return Promise.resolve({ ok: true });
  },
  setRoundLimit: roundLimit  => _call('game:setRoundLimit', { roundLimit }),
  startGame:     ()          => _call('game:start', {}),
  addBot:        ()          => _call('room:addBot', {}),
  drawDeck:      ()          => _call('game:drawDeck', {}),
  takeDiscard:   ()          => _call('game:takeDiscard', {}),
  swapDrawn:     slot        => _call('game:swapDrawn', { slot }),
  discardDrawn:  ()          => _call('game:discardDrawn', {}),
  usePower:      ()          => _call('game:usePower', {}),
  powerTarget:   target      => _call('game:powerTarget', target),
  callAdeline:   ()          => _call('game:callAdeline', {}),
  nextRound:     ()          => _call('game:nextRound', {}),
};
