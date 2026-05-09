// Rooms map a 4-letter code to a GameEngine + member sockets.
import { GameEngine } from './engine.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 ambiguity

function genCode(rooms) {
  for (let attempt = 0; attempt < 50; attempt++) {
    let code = '';
    for (let i = 0; i < 4; i++) code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    if (!rooms.has(code)) return code;
  }
  throw new Error('Could not generate room code');
}

export class RoomRegistry {
  constructor() {
    this.rooms = new Map(); // code -> Room
  }

  create({ hostName, roundLimit }) {
    const code = genCode(this.rooms);
    const engine = new GameEngine({ roundLimit });
    const room = new Room({ code, engine });
    this.rooms.set(code, room);
    return room;
  }

  get(code) {
    return this.rooms.get(code?.toUpperCase());
  }

  remove(code) {
    this.rooms.delete(code);
  }
}

export class Room {
  constructor({ code, engine }) {
    this.code = code;
    this.engine = engine;
    this.bots = [];       // AiPlayer instances for server-side bots
    this.createdAt = Date.now();
  }

  isEmpty() {
    return this.engine.players.every(p => !p.connected);
  }
}
