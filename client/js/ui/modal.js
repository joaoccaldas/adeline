// Modal host. Reads state.modal and renders the matching modal.
import { subscribe, update } from '../state/store.js';
import { net } from '../net/socket.js';
import { cardName } from './card.js';

const host = document.getElementById('modal-host');

export function mountModal() {
  subscribe(state => {
    host.innerHTML = '';
    if (!state.modal) return;
    if (state.modal.kind === 'roundEnd') host.appendChild(roundEndModal(state));
    else if (state.modal.kind === 'gameEnd') host.appendChild(gameEndModal(state));
    else if (state.modal.kind === 'help') host.appendChild(helpModal());
  });
}

function dismissBtn(label = 'Fechar') {
  const btn = document.createElement('button');
  btn.className = 'ghost';
  btn.textContent = label;
  btn.onclick = () => update(s => { s.modal = null; });
  return btn;
}

function roundEndModal(state) {
  const { data, game } = { data: state.modal.data, game: state.game };
  const isHost = game?.hostId === state.myId;
  const finalRound = (game?.round ?? 0) >= (game?.roundLimit ?? 0);
  const card = el(`<div class="modal-card"></div>`);
  card.appendChild(el(`<h2>Resultados da Rodada ${data.round}</h2>`));
  const sorted = [...data.scores].sort((a, b) => a.total - b.total);
  const rows = sorted.map(s => {
    const note = s.id === data.callerId && s.penalty ? '+10 penalidade' : s.raw === data.lowest ? 'Menor' : '';
    const cls = s.id === data.callerId && s.penalty ? 'penalty' : s.raw === data.lowest ? 'lowest' : '';
    const cards = s.hand.map(cardName).join(', ');
    return `<tr class="${cls}"><td>${escapeHtml(s.name)}</td><td>${escapeHtml(cards)}</td><td>${s.raw}</td><td>${s.penalty}</td><td><strong>${s.total}</strong></td><td>${note}</td></tr>`;
  }).join('');
  card.appendChild(el(`
    <table class="results-table">
      <thead><tr><th>Jogador</th><th>Mão</th><th>Bruto</th><th>Pen</th><th>Total</th><th>Nota</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `));
  const actions = el(`<div class="actions"></div>`);
  if (isHost) {
    const next = document.createElement('button');
    next.className = 'success full';
    next.textContent = finalRound ? 'Ver Vencedor' : 'Próxima Rodada';
    next.onclick = async () => {
      update(s => { s.modal = null; });
      await net.nextRound();
    };
    actions.appendChild(next);
  } else {
    actions.appendChild(el(`<div class="muted full" style="text-align:center">Aguardando o dono avançar...</div>`));
  }
  card.appendChild(actions);
  return card;
}

function gameEndModal(state) {
  const { data } = state.modal;
  const card = el(`<div class="modal-card"></div>`);
  card.appendChild(el(`<h2>Fim de Jogo</h2>`));
  const winner = data.ranking[0];
  card.appendChild(el(`<p style="margin:0"><strong style="color:var(--accent)">${escapeHtml(winner.name)}</strong> venceu com ${winner.score} pontos!</p>`));
  const rows = data.ranking.map((p, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(p.name)}</td><td>${p.score}</td></tr>`).join('');
  card.appendChild(el(`
    <table class="results-table">
      <thead><tr><th>Pos</th><th>Jogador</th><th>Pontos</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `));
  const actions = el(`<div class="actions"></div>`);
  const close = document.createElement('button');
  close.className = 'full';
  close.textContent = 'Voltar para o Início';
  close.onclick = () => location.reload();
  actions.appendChild(close);
  card.appendChild(actions);
  return card;
}

function helpModal() {
  const card = el(`<div class="modal-card"></div>`);
  card.innerHTML = `
    <h2>Poderes das cartas</h2>
    <ul class="rules">
      <li><strong>7</strong> — Espiar uma de suas cartas</li>
      <li><strong>8</strong> — Espiar carta de outro jogador</li>
      <li><strong>9</strong> — Troca cega com outro jogador</li>
      <li><strong>10</strong> — Vale 10 pontos</li>
      <li><strong>J♠</strong> — 0 pontos, sem poder</li>
      <li><strong>J (♥/♦/♣)</strong> — 11 pontos</li>
      <li><strong>Q</strong> — 12 pontos</li>
      <li><strong>K</strong> — 13 pontos</li>
      <li><strong>Coringa</strong> — 0 pontos</li>
    </ul>
  `;
  card.appendChild(dismissBtn('Entendi'));
  return card;
}

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstChild;
}

export function escapeHtml(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
