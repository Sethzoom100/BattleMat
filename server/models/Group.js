const mongoose = require('mongoose');

const GroupSchema = new mongoose.Schema({
  name: { type: String, required: true },
  code: { type: String, required: true, unique: true }, // Unique 6-digit code
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // List of users
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Group', GroupSchema);
