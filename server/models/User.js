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
    image: { type: String }, // URL to commander art
    wins: { type: Number, default: 0 },
    losses: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
  }],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', UserSchema);
