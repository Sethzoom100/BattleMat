const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  stats: {
    wins: { type: Number, default: 0 },
    losses: { type: Number, default: 0 },
    gamesPlayed: { type: Number, default: 0 },
    commanderDamageDealt: { type: Number, default: 0 }
  },
  decks: [{
    name: { type: String, required: true },
    commander: { type: String, required: true },
    image: { type: String },
    wins: { type: Number, default: 0 },
    losses: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
  }],
  // NEW: Tracks IDs of decks played in the current random cycle
  deckCycleHistory: { type: [String], default: [] },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', UserSchema);
