// Welcome screen — offline (vs bots) and online (create/join room) modes.
import { rememberName, getState, setState } from '../state/store.js';
import { net } from '../net/socket.js';
import { showToast } from './toast.js';

export function mountWelcome() {
  const root = document.getElementById('screen-welcome');

  function render() {
    const s = getState();
    root.innerHTML = '';
    root.appendChild(brand());

    // Shared name input
    const namePanel = document.createElement('div');
    namePanel.className = 'panel col';
    namePanel.innerHTML = `
      <label>Seu nome
        <input id="welcome-name" maxlength="16" placeholder="Jogador" value="${escapeAttr(s.myName)}" autocomplete="off" />
      </label>
    `;
    root.appendChild(namePanel);

    // ---- Offline section ----
    const offlinePanel = document.createElement('div');
    offlinePanel.className = 'panel col';

    const offlineTitle = document.createElement('h2');
    offlineTitle.className = 'h2';
    offlineTitle.textContent = 'Jogar sozinho';
    offlinePanel.appendChild(offlineTitle);

    const offlineBtn = button('Jogar vs Bots', async () => {
      const name = nameInput().trim();
      if (!name) return showToast('Escolha um nome primeiro', 'error');
      rememberName(name);
      net.useLocal();
      const res = await net.createRoom({ name, roundLimit: 5 });
      if (!res?.ok) return showToast(res?.error || 'Não foi possível criar', 'error');
      const startRes = await net.startGame();
      if (!startRes?.ok) showToast(startRes?.error || 'Não foi possível iniciar', 'error');
    });
    offlineBtn.classList.add('full');
    offlinePanel.appendChild(offlineBtn);
    root.appendChild(offlinePanel);

    // ---- Online section ----
    const onlinePanel = document.createElement('div');
    onlinePanel.className = 'panel col';

    const onlineTitle = document.createElement('h2');
    onlineTitle.className = 'h2';
    onlineTitle.textContent = 'Multijogador';
    onlinePanel.appendChild(onlineTitle);

    // Create room
    const createBtn = button('Criar Sala', async () => {
      const name = nameInput().trim();
      if (!name) return showToast('Escolha um nome primeiro', 'error');
      rememberName(name);
      net.useOnline();
      const res = await net.createRoom({ name, roundLimit: 5 });
      if (!res?.ok) return showToast(res?.error || 'Não foi possível criar sala', 'error');
      setState({ roomCode: res.code, myId: res.playerId });
    });
    createBtn.classList.add('full', 'success');
    onlinePanel.appendChild(createBtn);

    // Join room
    const joinRow = document.createElement('div');
    joinRow.className = 'row';
    joinRow.style.gap = '0.5rem';
    const codeInput = document.createElement('input');
    codeInput.id = 'join-code';
    codeInput.placeholder = 'Código (ex: ABCD)';
    codeInput.maxLength = 4;
    codeInput.style.flex = '1';
    codeInput.style.textTransform = 'uppercase';
    codeInput.addEventListener('input', () => { codeInput.value = codeInput.value.toUpperCase(); });

    const joinBtn = button('Entrar', async () => {
      const name = nameInput().trim();
      const code = codeInput.value.trim().toUpperCase();
      if (!name) return showToast('Escolha um nome primeiro', 'error');
      if (code.length !== 4) return showToast('Digite um código de 4 letras', 'error');
      rememberName(name);
      net.useOnline();
      const res = await net.joinRoom({ code, name });
      if (!res?.ok) return showToast(res?.error || 'Não foi possível entrar', 'error');
      setState({ roomCode: res.code, myId: res.playerId });
    });

    joinRow.appendChild(codeInput);
    joinRow.appendChild(joinBtn);
    onlinePanel.appendChild(joinRow);
    root.appendChild(onlinePanel);

    root.appendChild(rulesPanel());
  }

  function nameInput() {
    return document.getElementById('welcome-name')?.value ?? '';
  }

  return render;
}

function brand() {
  const div = document.createElement('div');
  div.className = 'brand';
  div.innerHTML = `
    <h1 class="h1">Adelinete</h1>
    <p>Um jogo de memória com cartas escondidas. Espie, troque, vigie — chame Adelinete antes que alguém roube a menor pontuação.</p>
  `;
  return div;
}

function rulesPanel() {
  const div = document.createElement('div');
  div.className = 'panel';
  div.innerHTML = `
    <h2 class="h2" style="margin-bottom:0.5rem">Como jogar</h2>
    <ul class="rules">
      <li>Cada jogador recebe 4 cartas viradas para baixo e memoriza 2.</li>
      <li>No seu turno: compre do baralho, pegue do descarte ou chame Adelinete.</li>
      <li>Cartas especiais (7, 8, 9, 10, J, Q, K, Coringa) têm poderes especiais.</li>
      <li>Chame Adelinete quando achar que tem a menor mão da mesa.</li>
      <li>Se chamar e não for o menor, penalidade de +10 pontos.</li>
      <li>Quem tiver menos pontos acumulados após a rodada final vence.</li>
    </ul>
  `;
  return div;
}

function button(label, onClick) {
  const b = document.createElement('button');
  b.textContent = label;
  b.onclick = onClick;
  return b;
}
function escapeAttr(s) { return String(s ?? '').replaceAll('"', '&quot;'); }
