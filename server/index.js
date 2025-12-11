require('dotenv').config();
const { createServer } = require('http');
const { Server } = require('socket.io');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('./models/User');

const PORT = process.env.PORT || 3001; 
const MONGO_URI = process.env.MONGO_URI; 
const JWT_SECRET = process.env.JWT_SECRET || "battlemat_secret";

const corsOptions = {
    origin: function (origin, callback) { callback(null, true); },
    methods: ["GET", "POST", "DELETE"],
    credentials: true
};

const app = express();
app.use(cors(corsOptions));
app.use(express.json());

const server = createServer(app);
const io = new Server(server, { cors: corsOptions });

if (MONGO_URI) {
    mongoose.connect(MONGO_URI)
        .then(() => console.log('✅ Connected to MongoDB'))
        .catch(err => console.error('❌ MongoDB Connection Error:', err));
} else {
    console.log('⚠️ No MONGO_URI found. Database features will not work.');
}

// --- ROUTES ---

app.post('/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ msg: "Missing fields" });
        const existingUser = await User.findOne({ username });
        if (existingUser) return res.status(400).json({ msg: "Username taken" });
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        const newUser = new User({ username, password: hashedPassword });
        await newUser.save();
        res.json({ msg: "User created" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });
        if (!user) return res.status(400).json({ msg: "User not found" });
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ msg: "Invalid credentials" });
        const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, user: { id: user._id, username: user.username, stats: user.stats, decks: user.decks } });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ADD DECK
app.post('/add-deck', async (req, res) => {
    try {
        const { userId, name, commander, image } = req.body;
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ msg: "User not found" });
        user.decks.push({ name, commander, image });
        await user.save();
        res.json(user.decks);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE DECK
app.delete('/delete-deck', async (req, res) => {
    try {
        const { userId, deckId } = req.body;
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ msg: "User not found" });
        user.decks = user.decks.filter(deck => deck._id.toString() !== deckId);
        await user.save();
        res.json(user.decks);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// UPDATE STATS
app.post('/update-stats', async (req, res) => {
    try {
        const { userId, win, loss, deckId } = req.body;
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ msg: "User not found" });

        if (win) user.stats.wins += 1;
        if (loss) user.stats.losses += 1;
        user.stats.gamesPlayed += 1;

        if (deckId) {
            const deck = user.decks.find(d => d._id.toString() === deckId);
            if (deck) {
                if (win) deck.wins += 1;
                if (loss) deck.losses += 1;
            }
        }

        await user.save();
        res.json({ stats: user.stats, decks: user.decks });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- NEW: RESET STATS ROUTE ---
app.post('/reset-stats', async (req, res) => {
    try {
        const { userId } = req.body;
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ msg: "User not found" });

        // Reset Global Stats
        user.stats = { wins: 0, losses: 0, gamesPlayed: 0, commanderDamageDealt: 0 };
        
        // Optional: We can also reset all deck stats if you want, but usually players 
        // prefer to keep deck history even if season stats reset. 
        // For now, we only reset the GLOBAL player score.
        
        await user.save();
        res.json(user.stats);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- SOCKETS ---
const socketToRoom = {};
app.get('/', (req, res) => { res.send('BattleMat Server Running'); });

io.on('connection', (socket) => {
    socket.on('join-room', (roomId, userId, isSpectator) => {
        socket.join(roomId);
        socketToRoom[socket.id] = roomId;
        socket.to(roomId).emit('user-connected', userId, isSpectator);
    });
    socket.on('claim-status', ({ type, userId }) => {
        const roomId = socketToRoom[socket.id];
        if (roomId) io.to(roomId).emit('status-claimed', { type, userId });
    });
    socket.on('update-game-state', ({ userId, data }) => {
        const roomId = socketToRoom[socket.id];
        if (roomId) socket.to(roomId).emit('game-state-updated', { userId, data });
    });
    socket.on('update-turn-state', (newState) => {
        const roomId = socketToRoom[socket.id];
        if (roomId) io.to(roomId).emit('turn-state-updated', newState);
    });
    socket.on('reset-game-request', (data) => {
        const roomId = socketToRoom[socket.id];
        if (roomId) io.to(roomId).emit('game-reset', data);
    });
    socket.on('update-seat-order', (newOrder) => {
        const roomId = socketToRoom[socket.id];
        if (roomId) io.to(roomId).emit('seat-order-updated', newOrder);
    });
    socket.on('disconnect', () => {
        const roomId = socketToRoom[socket.id];
        if (roomId) socket.to(roomId).emit('user-disconnected');
        delete socketToRoom[socket.id];
    });
});

process.on('uncaughtException', err => { console.error(err); process.exit(1); });
server.listen(PORT, () => { console.log(`Server running on port ${PORT}`); });
