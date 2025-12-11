const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, './.env') });
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
const JWT_SECRET = process.env.JWT_SECRET || "battlemat_secret_key_change_me";

const corsOptions = {
    origin: function (origin, callback) { callback(null, true); },
    methods: ["GET", "POST"],
    credentials: true
};

const app = express();
app.use(cors(corsOptions));
app.use(express.json()); // Allow JSON parsing for login forms

const server = createServer(app);
const io = new Server(server, { cors: corsOptions });

// --- DATABASE CONNECTION ---
if (MONGO_URI) {
    mongoose.connect(MONGO_URI)
        .then(() => console.log('✅ Connected to MongoDB'))
        .catch(err => console.error('❌ MongoDB Connection Error:', err));
} else {
    console.log('⚠️ No MONGO_URI found. Database features will not work.');
}

// --- AUTH ROUTES ---

// REGISTER
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

        res.json({ msg: "User created successfully" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// LOGIN
app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });
        if (!user) return res.status(400).json({ msg: "User not found" });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ msg: "Invalid credentials" });

        const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ 
            token, 
            user: { id: user._id, username: user.username, stats: user.stats } 
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET STATS
app.get('/stats/:userId', async (req, res) => {
    try {
        const user = await User.findById(req.params.userId).select('-password');
        res.json(user);
    } catch (err) {
        res.status(404).json({ msg: "User not found" });
    }
});

// UPDATE STATS (Protected would be better, but keeping simple)
app.post('/update-stats', async (req, res) => {
    try {
        const { userId, win, loss, damageDealt } = req.body;
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ msg: "User not found" });

        if (win) user.stats.wins += 1;
        if (loss) user.stats.losses += 1;
        user.stats.gamesPlayed += 1;
        if (damageDealt) user.stats.commanderDamageDealt += damageDealt;

        await user.save();
        res.json(user.stats);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- SOCKET.IO GAME LOGIC (UNCHANGED) ---
const socketToRoom = {};
const socketToUser = {}; 

app.get('/', (req, res) => { res.send('BattleMat Server Running (With Database)'); });

io.on('connection', (socket) => {
    
    socket.on('join-room', (roomId, userId, isSpectator) => {
        socket.join(roomId);
        socketToRoom[socket.id] = roomId;
        socketToUser[socket.id] = userId;
        
        console.log(`User ${userId} joined room ${roomId} (Spectator: ${isSpectator})`);
        socket.to(roomId).emit('user-connected', userId, isSpectator);
    });

    socket.on('claim-status', ({ type, userId }) => {
        const roomId = socketToRoom[socket.id];
        if (roomId) {
            io.to(roomId).emit('status-claimed', { type, userId });
        }
    });

    socket.on('sync-request', () => {
        const roomId = socketToRoom[socket.id];
        if (roomId) socket.to(roomId).emit('sync-requested');
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
        const userId = socketToUser[socket.id];
        
        if (roomId && userId) {
            console.log(`User ${userId} disconnected from ${roomId}`);
            socket.to(roomId).emit('user-disconnected', userId);
        }
        
        delete socketToRoom[socket.id];
        delete socketToUser[socket.id];
    });
});

process.on('uncaughtException', err => { console.error(err); process.exit(1); });
server.listen(PORT, () => { console.log(`Server running on port ${PORT}`); });