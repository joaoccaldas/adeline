// Player state. Hand is an ordered array (slots 0..3). `seen` tracks which
// of THIS player's slot indices they have privately peeked at.
export class Player {
  constructor({ id, name }) {
    this.id = id;          // socket id (or stable id across reconnects)
    this.name = name;
    this.score = 0;        // cumulative across rounds
    this.hand = [];        // array of card objects
    this.seen = new Set(); // indices of own slots this player has peeked at
    this.connected = true;
  }

  reset() {
    this.hand = [];
    this.seen = new Set();
  }

  publicView() {
    return { id: this.id, name: this.name, score: this.score, connected: this.connected };
  }
}
