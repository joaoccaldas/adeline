// Tiny pub/sub state store. Modules subscribe to slices they care about.
// All client-side state goes through here so swapping the renderer is easy.

const listeners = new Set();
const state = {
  screen: 'welcome',     // 'welcome' | 'lobby' | 'game'
  connected: false,
  myName: localStorage.getItem('adeline:name') || '',
  myId: null,
  roomCode: null,
  game: null,            // last server snapshot
  log: [],               // newest first
  privateKnown: {},      // { [playerId]: { [slot]: card } } — cards only YOU know
  pendingPower: null,    // local snapshot of any active power
  modal: null,
};

export function getState() { return state; }

export function setState(patch) {
  Object.assign(state, patch);
  emit();
}

export function update(fn) {
  fn(state);
  emit();
}

export function subscribe(fn) {
  listeners.add(fn);
  fn(state);
  return () => listeners.delete(fn);
}

function emit() {
  for (const fn of listeners) fn(state);
}

export function rememberName(name) {
  state.myName = name;
  localStorage.setItem('adeline:name', name);
}

export function pushLog(text) {
  state.log = [{ id: crypto.randomUUID(), text, t: Date.now() }, ...state.log].slice(0, 30);
  emit();
}

export function recordPrivateKnown(playerId, slot, card) {
  if (!state.privateKnown[playerId]) state.privateKnown[playerId] = {};
  state.privateKnown[playerId][slot] = card;
  emit();
}

export function clearPrivateKnown() {
  state.privateKnown = {};
  emit();
}
