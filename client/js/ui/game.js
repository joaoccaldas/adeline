// Game screen — the core play view.
import { getState, update } from '../state/store.js';
import { net } from '../net/socket.js';
import { renderCard, cardName, cardValue } from './card.js';
import { showToast } from './toast.js';

const PHASE_TITLE = {
  MEMORIZE: 'Memorizar Cartas',
  TURN_START: 'Seu Turno',
  DRAWN: 'Carta Comprada',
  TAKE_DISCARD: 'Pegar Descarte',
  POWER_PROMPT: 'Usar Poder',
  ROUND_OVER: 'Fim da Rodada',
  GAME_OVER: 'Fim de Jogo',
};

export function mountGame() {
  const root = document.getElementById('screen-game');

  return function render() {
    const state = getState();
    root.innerHTML = '';
    if (!state.game) return;

    const game = state.game;
    const me = game.players.find(p => p.id === state.myId);
    if (!me) return;

    const wrap = document.createElement('div');
    wrap.className = 'game';

    wrap.appendChild(headerEl(state, game));
    wrap.appendChild(messageEl(state, game, me));
    if (game.pendingPower) wrap.appendChild(powerBannerEl(game));
    wrap.appendChild(centerRowEl(state, game, me));
    if (game.drawnCard && game.currentPlayerId === state.myId && game.phase === 'DRAWN') {
      wrap.appendChild(drawnBannerEl(state, game));
    }
    wrap.appendChild(myHandEl(state, game, me));
    wrap.appendChild(opponentsEl(state, game));
    wrap.appendChild(logEl(state));

    root.appendChild(wrap);
    root.appendChild(actionBarEl(state, game, me));
  };
}

// ---------- header ----------
function headerEl(state, game) {
  const div = document.createElement('div');
  div.className = 'game-header';
  const phase = PHASE_TITLE[game.phase] || game.phase;
  const turnName = game.players.find(p => p.id === game.currentPlayerId)?.name || '—';
  const isMine = game.currentPlayerId === state.myId;
  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.innerHTML = `
    <div class="round">Rodada ${game.round} / ${game.roundLimit}</div>
    <div class="phase">${phase}</div>
    <div class="turn">${isMine ? "É o seu turno" : `Turno de ${escapeHtml(turnName)}`}${game.adelineCallerId ? ` · Chamou Adelinete (${game.adelineTurnsLeft} restantes)` : ''}</div>
  `;
  const sb = document.createElement('div');
  sb.className = 'scoreboard';
  game.players.forEach(p => {
    const cls = ['score-pill'];
    if (p.id === state.myId) cls.push('you');
    if (p.id === game.currentPlayerId) cls.push('turn');
    if (p.id === game.adelineCallerId) cls.push('adeline');
    const pill = document.createElement('span');
    pill.className = cls.join(' ');
    pill.textContent = `${p.name} · ${p.score}`;
    sb.appendChild(pill);
  });
  div.appendChild(meta);
  div.appendChild(sb);
  return div;
}

// ---------- message bar ----------
function messageEl(state, game, me) {
  const div = document.createElement('div');
  div.className = 'message-bar';
  const { primary, sub } = computeMessage(state, game, me);
  div.innerHTML = `<div class="msg">${escapeHtml(primary)}</div><div class="sub">${escapeHtml(sub)}</div>`;
  return div;
}

function computeMessage(state, game, me) {
  const isMine = game.currentPlayerId === state.myId;
  if (game.phase === 'MEMORIZE') {
    return { primary: 'Memorize suas cartas!', sub: 'Elas serão escondidas em 3 segundos.' };
  }
  if (game.phase === 'POWER_PROMPT') {
    const actor = game.players.find(p => p.id === game.pendingPower.actorId);
    if (game.pendingPower.actorId !== state.myId) {
      return { primary: `${actor?.name} está usando ${game.pendingPower.label}`, sub: 'Aguarde — eles estão escolhendo um alvo.' };
    }
    return { primary: powerPromptText(game.pendingPower), sub: powerSubText(game.pendingPower) };
  }
  if (game.phase === 'TURN_START') {
    if (isMine) return { primary: 'Compre, pegue o descarte ou chame Adelinete', sub: '' };
    const tn = game.players.find(p => p.id === game.currentPlayerId)?.name;
    return { primary: `Aguardando ${tn}...`, sub: '' };
  }
  if (game.phase === 'DRAWN' && isMine) {
    return { primary: `Você comprou ${cardName(game.drawnCard)}`, sub: 'Troque por uma carta da mão, descarte ou use o poder.' };
  }
  if (game.phase === 'DRAWN' && !isMine) {
    const tn = game.players.find(p => p.id === game.currentPlayerId)?.name;
    return { primary: `${tn} comprou uma carta`, sub: '' };
  }
  if (game.phase === 'TAKE_DISCARD' && isMine) {
    return { primary: `Escolha onde trocar ${cardName(game.drawnCard)}`, sub: 'Toque em uma de suas cartas.' };
  }
  if (game.phase === 'ROUND_OVER') return { primary: 'Rodada finalizada', sub: 'Veja as cartas abaixo.' };
  if (game.phase === 'GAME_OVER') return { primary: 'Jogo finalizado', sub: 'Veja o ranking final.' };
  return { primary: '', sub: '' };
}

function powerPromptText(pp) {
  const k = pp.currentPrompt;
  if (k === 'OWN_CARD') return 'Escolha uma de suas cartas';
  if (k === 'OTHER_CARD') return "Escolha uma carta de outro jogador";
  if (k === 'ANY_CARD') return 'Escolha qualquer carta na mesa';
  if (k === 'OTHER_PLAYER') return 'Escolha um jogador como alvo';
  return 'Resolvendo poder...';
}

function powerSubText(pp) {
  const step = `Passo ${pp.promptIdx + 1} de ${pp.promptsTotal}`;
  return `${pp.label} · ${step}`;
}

// ---------- power banner ----------
function powerBannerEl(game) {
  const div = document.createElement('div');
  div.className = 'power-banner';
  const actor = game.players.find(p => p.id === game.pendingPower.actorId);
  div.innerHTML = `
    <div class="label">${escapeHtml(game.pendingPower.label)}</div>
    <div class="text">${escapeHtml(actor?.name || '')} está usando um poder.</div>
  `;
  return div;
}

// ---------- center row (deck/discard) ----------
function centerRowEl(state, game, me) {
  const row = document.createElement('div');
  row.className = 'center-row';

  // Deck
  const deckCol = document.createElement('div');
  deckCol.className = 'pile-col';
  deckCol.appendChild(renderCard({ card: null, faceUp: false, size: 'pile-card' }));
  deckCol.children[0].classList.add('pile-card');
  deckCol.appendChild(textEl(`${game.deckCount} cartas`, 'pile-count'));
  deckCol.appendChild(textEl('Baralho', 'pile-label'));
  row.appendChild(deckCol);

  // Discard
  const discCol = document.createElement('div');
  discCol.className = 'pile-col';
  if (game.discardTop) {
    const c = renderCard({ card: game.discardTop, faceUp: true });
    c.classList.add('pile-card');
    discCol.appendChild(c);
  } else {
    discCol.appendChild(emptyPile('vazio'));
  }
  discCol.appendChild(textEl('—', 'pile-count'));
  discCol.appendChild(textEl('Descarte', 'pile-label'));
  row.appendChild(discCol);

  // Drawn (visible only to current player while in DRAWN/TAKE_DISCARD)
  const drawnCol = document.createElement('div');
  drawnCol.className = 'pile-col';
  if (game.drawnCard && game.currentPlayerId === state.myId) {
    const c = renderCard({ card: game.drawnCard, faceUp: true });
    c.classList.add('pile-card', 'flip-in');
    drawnCol.appendChild(c);
  } else if (game.drawnIsTaken) {
    const c = renderCard({ card: null, faceUp: false });
    c.classList.add('pile-card');
    drawnCol.appendChild(c);
  } else {
    drawnCol.appendChild(emptyPile('—'));
  }
  drawnCol.appendChild(textEl('—', 'pile-count'));
  drawnCol.appendChild(textEl('Puxada', 'pile-label'));
  row.appendChild(drawnCol);

  return row;
}

// ---------- drawn banner (post-draw choice) ----------
function drawnBannerEl(state, game) {
  const div = document.createElement('div');
  div.className = 'drawn-banner';
  const left = document.createElement('div');
  left.appendChild(renderCard({ card: game.drawnCard, faceUp: true }));
  left.firstChild.style.width = '64px';
  div.appendChild(left);

  const actions = document.createElement('div');
  actions.className = 'actions';
  const swapBtn = btn('Trocar pela mão', 'success', () => {
    showToast('Toque em uma de suas cartas para trocar', 'info', 1500);
    update(s => { s.uiSwapMode = true; });
  });
  swapBtn.classList.add('full');
  const discardBtn = btn('Descartar', 'ghost', async () => {
    const res = await net.discardDrawn();
    if (!res?.ok) showToast(res?.error || 'Não foi possível descartar', 'error');
  });
  actions.appendChild(swapBtn);
  if (hasPowerByRank(game.drawnCard)) {
    const powerBtn = btn(`Usar poder do ${cardName(game.drawnCard)}`, 'success', async () => {
      const res = await net.usePower();
      if (!res?.ok) showToast(res?.error || 'Não foi possível usar poder', 'error');
    });
    actions.appendChild(powerBtn);
  }
  actions.appendChild(discardBtn);

  div.appendChild(actions);
  return div;
}

// ---------- my hand ----------
function myHandEl(state, game, me) {
  const pane = document.createElement('div');
  pane.className = 'player-pane is-self' + (me.id === game.currentPlayerId ? ' is-turn' : '') + (me.id === game.adelineCallerId ? ' is-caller' : '');
  pane.appendChild(playerHead(me, state, game));
  const grid = document.createElement('div');
  grid.className = 'hand-grid';
  me.hand.forEach((slot, i) => {
    const peeked = slot.peeked || !!state.privateKnown[me.id]?.[i];
    let card = slot.card;
    // Reveal cards we privately know even when server snapshot redacts them
    if (!card && state.privateKnown[me.id]?.[i]) card = state.privateKnown[me.id][i];
    const faceUp = !!card && (slot.revealed || peeked);
    const sel = isMyCardSelectable(state, game, i);
    const el = renderCard({
      card,
      faceUp,
      peeked: peeked && !slot.revealed,
      publicKnown: slot.revealed && peeked === false ? true : false,
      selectable: sel.on,
      selected: state.selectedOwnSlot === i,
      onClick: sel.on ? sel.onClick : undefined,
    });
    grid.appendChild(el);
  });
  pane.appendChild(grid);
  return pane;
}

// ---------- opponents ----------
function opponentsEl(state, game) {
  const wrap = document.createElement('div');
  wrap.className = 'opponents';
  for (const p of game.players) {
    if (p.id === state.myId) continue;
    const pane = document.createElement('div');
    const cls = ['player-pane'];
    if (p.id === game.currentPlayerId) cls.push('is-turn');
    if (p.id === game.adelineCallerId) cls.push('is-caller');
    if (!p.connected) cls.push('is-disc');
    pane.className = cls.join(' ');
    pane.appendChild(playerHead(p, state, game));
    const grid = document.createElement('div');
    grid.className = 'hand-grid';
    p.hand.forEach((slot, i) => {
      const known = state.privateKnown[p.id]?.[i];
      const card = slot.card || known;
      const faceUp = !!card && (slot.revealed || (!!known));
      const sel = isOpponentCardSelectable(state, game, p, i);
      const el = renderCard({
        card,
        faceUp,
        peeked: !!known && !slot.revealed,
        publicKnown: slot.revealed && !known,
        selectable: sel.on,
        selected: state.selectedTargetKey === `${p.id}:${i}`,
        onClick: sel.on ? sel.onClick : undefined,
      });
      grid.appendChild(el);
    });
    pane.appendChild(grid);

    // Power "OTHER_PLAYER" target — clickable whole pane
    if (game.phase === 'POWER_PROMPT' &&
        game.pendingPower?.actorId === state.myId &&
        game.pendingPower.currentPrompt === 'OTHER_PLAYER') {
      pane.style.cursor = 'pointer';
      pane.style.outline = '3px solid var(--accent)';
      pane.style.outlineOffset = '3px';
      pane.onclick = async () => {
        const res = await net.powerTarget({ playerId: p.id });
        if (!res?.ok) showToast(res?.error || 'Alvo inválido', 'error');
      };
    }
    wrap.appendChild(pane);
  }
  return wrap;
}

function playerHead(p, state, game) {
  const div = document.createElement('div');
  div.className = 'player-head';
  let knownTotal = 0;
  if (p.id === state.myId) {
    p.hand.forEach((slot, i) => {
      const c = slot.card || state.privateKnown[p.id]?.[i];
      if ((slot.revealed || state.privateKnown[p.id]?.[i]) && c) knownTotal += cardValue(c);
    });
  } else {
    p.hand.forEach((slot, i) => {
      const c = state.privateKnown[p.id]?.[i] || slot.card;
      if ((slot.revealed || state.privateKnown[p.id]?.[i]) && c) knownTotal += cardValue(c);
    });
  }
  const meta = p.id === game.currentPlayerId ? 'Turno'
            : p.id === game.adelineCallerId ? 'Chamou Adelinete'
            : (!p.connected ? 'Desconectado' : 'Aguardando');
  div.innerHTML = `
    <div>
      <div class="player-name">${escapeHtml(p.name)}${p.id === state.myId ? ' (você)' : ''}</div>
      <div class="player-meta">${meta}</div>
    </div>
    <div class="known">Conhecido<strong>${knownTotal}</strong></div>
  `;
  return div;
}

// ---------- selection logic ----------
function isMyCardSelectable(state, game, slotIdx) {
  // Swap drawn into own slot
  if ((game.phase === 'DRAWN' || game.phase === 'TAKE_DISCARD') &&
      game.currentPlayerId === state.myId &&
      (game.phase === 'TAKE_DISCARD' || state.uiSwapMode)) {
    return {
      on: true,
      onClick: async () => {
        update(s => { s.uiSwapMode = false; });
        const res = await net.swapDrawn(slotIdx);
        if (!res?.ok) showToast(res?.error || 'Não foi possível trocar', 'error');
      },
    };
  }
  // Power: OWN_CARD or ANY_CARD with you as actor
  if (game.phase === 'POWER_PROMPT' &&
      game.pendingPower.actorId === state.myId &&
      ['OWN_CARD', 'ANY_CARD'].includes(game.pendingPower.currentPrompt)) {
    return {
      on: true,
      onClick: async () => {
        const res = await net.powerTarget({ playerId: state.myId, slot: slotIdx });
        if (!res?.ok) showToast(res?.error || 'Alvo inválido', 'error');
      },
    };
  }
  return { on: false };
}

function isOpponentCardSelectable(state, game, opponent, slotIdx) {
  if (game.phase === 'POWER_PROMPT' &&
      game.pendingPower.actorId === state.myId &&
      ['OTHER_CARD', 'ANY_CARD'].includes(game.pendingPower.currentPrompt)) {
    return {
      on: true,
      onClick: async () => {
        const res = await net.powerTarget({ playerId: opponent.id, slot: slotIdx });
        if (!res?.ok) showToast(res?.error || 'Alvo inválido', 'error');
      },
    };
  }
  return { on: false };
}

function slot(i) { return i; }

// ---------- bottom action bar ----------
function actionBarEl(state, game, me) {
  const bar = document.createElement('div');
  bar.className = 'action-bar';
  const inner = document.createElement('div');
  inner.className = 'action-bar-inner';

  const isMine = game.currentPlayerId === state.myId;
  const canAct = isMine && game.phase === 'TURN_START';

  const drawBtn = btn('Comprar', undefined, async () => {
    const res = await net.drawDeck();
    if (!res?.ok) showToast(res?.error || 'Não foi possível comprar', 'error');
  });
  drawBtn.disabled = !canAct;

  const takeBtn = btn('Pegar Descarte', 'ghost', async () => {
    const res = await net.takeDiscard();
    if (!res?.ok) showToast(res?.error || 'Não foi possível pegar', 'error');
  });
  takeBtn.disabled = !canAct || !game.discardTop;

  const callBtn = btn('Adelinete!', 'success', async () => {
    const res = await net.callAdeline();
    if (!res?.ok) showToast(res?.error || 'Não foi possível chamar', 'error');
  });
  callBtn.disabled = !canAct || !!game.adelineCallerId;

  inner.appendChild(drawBtn);
  inner.appendChild(takeBtn);
  inner.appendChild(callBtn);
  bar.appendChild(inner);
  return bar;
}

// ---------- log ----------
function logEl(state) {
  const div = document.createElement('div');
  div.className = 'log-panel';
  const list = state.log.slice(0, 8);
  if (list.length === 0) {
    div.innerHTML = `<div class="log-item">O histórico do jogo aparecerá aqui.</div>`;
    return div;
  }
  list.forEach((entry, i) => {
    const it = document.createElement('div');
    it.className = 'log-item' + (i === 0 ? ' fresh' : '');
    it.textContent = entry.text;
    div.appendChild(it);
  });
  return div;
}

// ---------- helpers ----------
function btn(label, variant, onClick) {
  const b = document.createElement('button');
  if (variant) b.classList.add(variant);
  b.textContent = label;
  b.onclick = onClick;
  return b;
}
function textEl(text, cls) {
  const d = document.createElement('div');
  d.className = cls;
  d.textContent = text;
  return d;
}
function emptyPile(text) {
  const d = document.createElement('div');
  d.className = 'empty-pile';
  d.textContent = text;
  return d;
}
function escapeHtml(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
function hasPowerByRank(card) {
  if (!card) return false;
  if (['7', '8', '9', '10', 'Q', 'K', 'JOKER'].includes(card.rank)) return true;
  if (card.rank === 'J' && card.suit !== 'S') return true;
  return false;
}
