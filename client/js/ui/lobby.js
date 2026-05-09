// Lobby screen — shows room code, players, host controls.
import { getState, update } from '../state/store.js';
import { net } from '../net/socket.js';
import { showToast } from './toast.js';

export function mountLobby() {
  const root = document.getElementById('screen-lobby');

  return function render() {
    const s = getState();
    root.innerHTML = '';
    if (!s.game) return;
    const isHost = s.game.hostId === s.myId;

    root.appendChild(codePanel(s.roomCode));
    root.appendChild(playersPanel(s));
    root.appendChild(controlsPanel(s, isHost));
    root.appendChild(helpRow());
  };
}

function codePanel(code) {
  const div = document.createElement('div');
  div.className = 'lobby-code';
  div.innerHTML = `
    <div class="label">Código da sala · toque para copiar</div>
    <div class="code">${code ?? '----'}</div>
  `;
  div.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(code);
      showToast('Código copiado', 'info', 1400);
    } catch { /* ignore */ }
  });
  return div;
}

function playersPanel(state) {
  const div = document.createElement('div');
  div.className = 'panel col';
  div.innerHTML = `<h2 class="h2">Jogadores (${state.game.players.length}/6)</h2>`;
  const list = document.createElement('div');
  list.className = 'player-list';
  state.game.players.forEach((p, i) => {
    const row = document.createElement('div');
    const cls = ['player-row'];
    if (p.id === state.game.hostId) cls.push('host');
    if (!p.connected) cls.push('disconnected');
    row.className = cls.join(' ');
    row.innerHTML = `
      <div class="seat">${i + 1}</div>
      <div class="name">${escapeHtml(p.name)}${p.id === state.myId ? ' (você)' : ''}</div>
      <div class="badge">${p.id === state.game.hostId ? 'Dono' : (p.connected ? 'Pronto' : 'Off')}</div>
    `;
    list.appendChild(row);
  });
  div.appendChild(list);
  return div;
}

function controlsPanel(state, isHost) {
  const div = document.createElement('div');
  div.className = 'panel col';
  if (isHost) {
    const select = document.createElement('label');
    select.innerHTML = `Rodadas`;
    const sel = document.createElement('select');
    [3, 5, 7, 10].forEach(n => {
      const opt = document.createElement('option');
      opt.value = String(n);
      opt.textContent = `${n} rodadas`;
      if (n === state.game.roundLimit) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.onchange = () => net.setRoundLimit(Number(sel.value));
    select.appendChild(sel);
    div.appendChild(select);

    const start = document.createElement('button');
    start.className = 'success full';
    start.textContent = 'Começar Jogo';
    start.disabled = state.game.players.length < 2;
    start.onclick = async () => {
      const res = await net.startGame();
      if (!res?.ok) showToast(res?.error || 'Não foi possível iniciar', 'error');
    };
    div.appendChild(start);

    const addBot = document.createElement('button');
    addBot.className = 'ghost full';
    addBot.textContent = '+ Adicionar Bot';
    addBot.disabled = state.game.players.length >= 6;
    addBot.onclick = async () => {
      const res = await net.addBot();
      if (!res?.ok) showToast(res?.error || 'Não foi possível adicionar bot', 'error');
    };
    div.appendChild(addBot);
  } else {
    const note = document.createElement('div');
    note.className = 'muted';
    note.textContent = 'Aguardando o dono iniciar...';
    div.appendChild(note);
  }
  const leave = document.createElement('button');
  leave.className = 'ghost full';
  leave.textContent = 'Sair da Sala';
  leave.onclick = () => location.reload();
  div.appendChild(leave);
  return div;
}

function helpRow() {
  const row = document.createElement('div');
  row.className = 'row between';
  const help = document.createElement('button');
  help.className = 'ghost';
  help.textContent = 'Poderes das Cartas';
  help.onclick = () => update(s => { s.modal = { kind: 'help' }; });
  row.appendChild(help);
  return row;
}

function escapeHtml(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
