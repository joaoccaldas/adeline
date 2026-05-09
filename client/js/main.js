// App entry. Mount UI modules; local game engine runs in-browser.
import './net/socket.js';
import { mountScreens } from './ui/screens.js';
import { mountModal } from './ui/modal.js';

mountScreens();
mountModal();

// Prevent iOS double-tap zoom on the game surface
document.addEventListener('gesturestart', e => e.preventDefault());
