const { createServer } = require('http');
const { Server } = require('socket.io');
const express = require('express');
const cors = require('cors');

const PORT = process.env.PORT || 3001; 

const corsOptions = {
    origin: function (origin, callback) { callback(null, true); },
    methods: ["GET", "POST"],
    credentials: true
};

const app = express();
app.use(cors(corsOptions));

const server = createServer(app);
const io = new Server(server, { cors: corsOptions });

// --- MEMORY MAPS ---
const socketToRoom = {};
const socketToUser = {}; 

// --- CRITICAL FIX: SERVER-SIDE STATE STORAGE ---
// This holds the latest game data for every user in a room.
// Structure: { "room-id": { "user-peer-id": { life: 40, ... } } }
const roomState = {};

app.get('/', (req, res) => { res.send('BattleMat Server (State Storage Enabled)'); });

io.on('connection', (socket) => {
    
    socket.on('join-room', (roomId, userId) => {
        socket.join(roomId);
        socketToRoom[socket.id] = roomId;
        socketToUser[socket.id] = userId;
        
        console.log(`User ${userId} joined room ${roomId}`);
        
        // 1. Tell others to start video
        socket.to(roomId).emit('user-connected', userId);

        // 2. THE FIX: Send the saved state to the NEW user immediately
        if (roomState[roomId]) {
            // We send the entire room's data to the new guy
            socket.emit('full-state-sync', roomState[roomId]);
        }
    });

    socket.on('update-game-state', ({ userId, data }) => {
        const roomId = socketToRoom[socket.id];
        if (roomId) {
            // 1. Save to Server Memory
            if (!roomState[roomId]) roomState[roomId] = {};
            // Merge new data with existing data to prevent overwriting missing fields
            roomState[roomId][userId] = { ...roomState[roomId][userId], ...data };

            // 2. Broadcast to others
            socket.to(roomId).emit('game-state-updated', { userId, data });
        }
    });

    // Handle other events normally...
    socket.on('update-turn-state', (newState) => {
        const roomId = socketToRoom[socket.id];
        if (roomId) io.to(roomId).emit('turn-state-updated', newState);
    });
    
    socket.on('reset-game-request', (data) => {
        const roomId = socketToRoom[socket.id];
        if (roomId) {
            roomState[roomId] = data; // Reset server memory too
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
            // Optional: We DON'T delete game data on disconnect immediately 
            // so they can refresh and get their life total back.
        }
        
        delete socketToRoom[socket.id];
        delete socketToUser[socket.id];
    });
});

process.on('uncaughtException', err => { console.error(err); process.exit(1); });
server.listen(PORT, () => { console.log(`Server running on port ${PORT}`); });
