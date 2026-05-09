// Screen router — switches which screen is visible based on state.screen.
import { subscribe } from '../state/store.js';
import { mountWelcome } from './welcome.js';
import { mountLobby } from './lobby.js';
import { mountGame } from './game.js';

const screens = {
  welcome: { el: document.getElementById('screen-welcome'), render: null },
  lobby:   { el: document.getElementById('screen-lobby'),   render: null },
  game:    { el: document.getElementById('screen-game'),    render: null },
};

export function mountScreens() {
  screens.welcome.render = mountWelcome();
  screens.lobby.render   = mountLobby();
  screens.game.render    = mountGame();

  subscribe(state => {
    for (const [name, s] of Object.entries(screens)) {
      const active = state.screen === name;
      s.el.classList.toggle('hidden', !active);
      if (active && s.render) s.render();
    }
  });
}
