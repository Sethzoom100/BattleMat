require('dotenv').config();
const { createServer } = require('http');
const { Server } = require('socket.io');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('./models/User');
const Group = require('./models/Group');

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

const generateCode = () => Math.random().toString(36).substring(2, 8).toUpperCase();

app.get('/user/:id', async (req, res) => {
    try {
        const user = await User.findById(req.params.id).populate('groups');
        if (!user) return res.status(440).json({ msg: "User not found" });
        res.json({ 
            id: user._id, 
            username: user.username, 
            stats: user.stats, 
            decks: user.decks, 
            deckCycleHistory: user.deckCycleHistory,
            groups: user.groups 
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/create-group', async (req, res) => {
    try {
        const { userId, name } = req.body;
        const user = await User.findById(userId);
        if(!user) return res.status(404).json({msg: "User not found"});

        const code = generateCode();
        const newGroup = new Group({ name, code, members: [userId], admins: [userId] });
        await newGroup.save();

        user.groups.push(newGroup._id);
        await user.save();

        const populatedUser = await User.findById(userId).populate('groups');
        res.json(populatedUser.groups);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/join-group', async (req, res) => {
    try {
        const { userId, code } = req.body;
        const user = await User.findById(userId);
        const group = await Group.findOne({ code });

        if(!user) return res.status(404).json({msg: "User not found"});
        if(!group) return res.status(404).json({msg: "Group not found"});
        if(group.members.includes(userId)) return res.status(400).json({msg: "Already in group"});

        group.members.push(userId);
        await group.save();

        user.groups.push(group._id);
        await user.save();

        const populatedUser = await User.findById(userId).populate('groups');
        res.json(populatedUser.groups);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/leave-group', async (req, res) => {
    try {
        const { userId, groupId } = req.body;
        
        const user = await User.findById(userId);
        if(user) {
            user.groups = user.groups.filter(g => g.toString() !== groupId);
            await user.save();
        }

        const group = await Group.findById(groupId);
        if(group) {
            group.members = group.members.filter(m => m.toString() !== userId);
            group.admins = group.admins.filter(a => a.toString() !== userId);
            
            if (group.members.length === 0) {
                await Group.findByIdAndDelete(groupId);
                console.log(`Group ${groupId} deleted (empty).`);
            } else {
                await group.save();
            }
        }

        const populatedUser = await User.findById(userId).populate('groups');
        res.json(populatedUser ? populatedUser.groups : []);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/kick-member', async (req, res) => {
    try {
        const { requesterId, targetId, groupId } = req.body;
        
        const group = await Group.findById(groupId);
        if(!group) return res.status(404).json({msg: "Group not found"});

        if (!group.admins.includes(requesterId)) {
            return res.status(403).json({msg: "Only admins can kick members."});
        }

        group.members = group.members.filter(m => m.toString() !== targetId);
        group.admins = group.admins.filter(a => a.toString() !== targetId);
        await group.save();

        const targetUser = await User.findById(targetId);
        if(targetUser) {
            targetUser.groups = targetUser.groups.filter(g => g.toString() !== groupId);
            await targetUser.save();
        }

        res.json({ msg: "User kicked" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/group-details/:groupId', async (req, res) => {
    try {
        const group = await Group.findById(req.params.groupId)
            .populate({
                path: 'members',
                select: 'username stats decks matchHistory' 
            });
        res.json(group);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

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
        const user = await User.findOne({ username }).populate('groups');
        if (!user) return res.status(400).json({ msg: "User not found" });
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ msg: "Invalid credentials" });
        const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ 
            token, 
            user: { 
                id: user._id, 
                username: user.username, 
                stats: user.stats, 
                decks: user.decks, 
                deckCycleHistory: user.deckCycleHistory,
                groups: user.groups 
            } 
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

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

app.post('/finish-game', async (req, res) => {
    try {
        const { results } = req.body; 
        console.log("Finishing game with results:", results);

        const updates = results.map(async (player) => {
            if (!player.userId) return; 
            
            const user = await User.findById(player.userId);
            if (!user) return;

            user.stats.gamesPlayed = (user.stats.gamesPlayed || 0) + 1;
            if (player.result === 'win') user.stats.wins = (user.stats.wins || 0) + 1;
            if (player.result === 'loss') user.stats.losses = (user.stats.losses || 0) + 1;

            if (player.deckId) {
                const deckIndex = user.decks.findIndex(d => d._id.toString() === player.deckId);
                if (deckIndex !== -1) {
                    if (player.result === 'win') user.decks[deckIndex].wins = (user.decks[deckIndex].wins || 0) + 1;
                    if (player.result === 'loss') user.decks[deckIndex].losses = (user.decks[deckIndex].losses || 0) + 1;
                }
            }
            
            user.matchHistory.push({
                result: player.result,
                deckId: player.deckId,
                date: new Date()
            });

            user.markModified('stats');
            user.markModified('decks');
            user.markModified('matchHistory'); 
            return user.save();
        });

        await Promise.all(updates);
        res.json({ msg: "Game recorded" });
    } catch (err) { 
        console.error(err);
        res.status(500).json({ error: err.message }); 
    }
});

app.post('/reset-stats', async (req, res) => {
    try {
        const { userId } = req.body;
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ msg: "User not found" });
        user.stats = { wins: 0, losses: 0, gamesPlayed: 0, commanderDamageDealt: 0 };
        user.matchHistory = []; 
        user.markModified('stats');
        user.markModified('matchHistory');
        await user.save();
        res.json(user.stats);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/record-deck-usage', async (req, res) => {
    try {
        const { userId, deckId, resetCycle } = req.body;
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ msg: "User not found" });

        if (resetCycle) {
            user.deckCycleHistory = [deckId]; 
        } else {
            if (!user.deckCycleHistory.includes(deckId)) {
                user.deckCycleHistory.push(deckId);
            }
        }
        await user.save();
        res.json(user.deckCycleHistory);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- SOCKETS ---
const socketToRoom = {};
const socketToUser = {};
const socketIsSpectator = {}; 
const roomHosts = {}; 
const roomData = {}; 

app.get('/', (req, res) => { res.send('BattleMat Server Running'); });

io.on('connection', (socket) => {
    
    socket.on('join-room', async (roomId, userId, isSpectator) => {
        socket.join(roomId);
        socketToRoom[socket.id] = roomId;
        socketToUser[socket.id] = userId;
        socketIsSpectator[socket.id] = isSpectator;
        
        if (!roomData[roomId]) {
            roomData[roomId] = { gameState: {}, turnState: { activeId: null, count: 1 } };
        }

        let currentHostId = roomHosts[roomId];
        const roomSockets = io.sockets.adapter.rooms.get(roomId);
        let hostIsHere = false;
        const activeUsers = [];

        if (roomSockets) {
            for (const sockId of roomSockets) {
                const uId = socketToUser[sockId];
                if (uId) activeUsers.push(uId);
                if (uId === currentHostId) hostIsHere = true;
            }
        }

        if ((!currentHostId || !hostIsHere) && !isSpectator) {
            roomHosts[roomId] = userId;
            currentHostId = userId;
            console.log(`Host assigned to: ${userId}`);
        }

        io.to(roomId).emit('host-update', currentHostId);
        socket.emit('sync-state', roomData[roomId]);
        socket.emit('all-users', activeUsers.filter(id => id !== userId));
        socket.to(roomId).emit('user-connected', userId, isSpectator);
    });

    socket.on('claim-status', ({ type, userId }) => {
        const roomId = socketToRoom[socket.id];
        if (roomId) io.to(roomId).emit('status-claimed', { type, userId });
    });

    // --- DELTA UPDATE HANDLER ---
    // The server just merges what it receives and broadcasts the delta
    socket.on('update-game-state', ({ userId, data }) => {
        const roomId = socketToRoom[socket.id];
        if (roomId) {
            if (!roomData[roomId].gameState[userId]) roomData[roomId].gameState[userId] = {};
            // Server maintains the Source of Truth by merging
            roomData[roomId].gameState[userId] = { ...roomData[roomId].gameState[userId], ...data };
            // Broadcast only the delta so clients can merge it too
            socket.to(roomId).emit('game-state-updated', { userId, data });
        }
    });

    socket.on('update-turn-state', (newState) => {
        const roomId = socketToRoom[socket.id];
        if (roomId) {
            roomData[roomId].turnState = newState; 
            io.to(roomId).emit('turn-state-updated', newState);
        }
    });
    
    socket.on('reset-game-request', (data) => {
        const roomId = socketToRoom[socket.id];
        if (roomId) {
            roomData[roomId] = data; 
            io.to(roomId).emit('game-reset', data);
        }
    });
    
    socket.on('update-seat-order', (newOrder) => {
        const roomId = socketToRoom[socket.id];
        if (roomId) io.to(roomId).emit('seat-order-updated', newOrder);
    });

    socket.on('disconnect', () => {
        const roomId = socketToRoom[socket.id];
        const userId = socketToUser[socket.id];
        
        if (roomId && userId) {
            socket.to(roomId).emit('user-disconnected', userId); 
            
            if (roomHosts[roomId] === userId) {
                const roomSockets = io.sockets.adapter.rooms.get(roomId);
                let newHostFound = false;

                if (roomSockets) {
                    for (const socketId of roomSockets) {
                        if (socketId !== socket.id && !socketIsSpectator[socketId]) {
                            const newHostId = socketToUser[socketId];
                            if (newHostId) {
                                roomHosts[roomId] = newHostId;
                                io.to(roomId).emit('host-update', newHostId);
                                newHostFound = true;
                                break; 
                            }
                        }
                    }
                }

                if (!newHostFound) {
                    delete roomHosts[roomId];
                }
            }
        }
        
        delete socketToRoom[socket.id];
        delete socketToUser[socket.id];
        delete socketIsSpectator[socket.id];
    });
});

process.on('uncaughtException', err => { console.error(err); process.exit(1); });
server.listen(PORT, '0.0.0.0', () => { 
    console.log(`Server running on port ${PORT}`); 
});
