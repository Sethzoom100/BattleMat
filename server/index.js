// server/index.js

const { createServer } = require('http');
const { Server } = require('socket.io');
const express = require('express');
const cors = require('cors');

const PORT = process.env.PORT || 3001; 

// ALLOWED ORIGINS (Update this if your URL changes)
const corsOptions = {
    origin: function (origin, callback) {
        callback(null, true);
    },
    methods: ["GET", "POST"],
    credentials: true
};

const app = express();
app.use(cors(corsOptions));

const server = createServer(app);
const io = new Server(server, {
    cors: corsOptions
});

// --- CRITICAL FIX: TRACK SOCKETS TO ROOMS ---
// This map remembers which room a socketID belongs to.
// This ensures we can notify the room even after the socket disconnects.
const socketToRoom = {};

app.get('/', (req, res) => {
    res.send('BattleMat Signaling Server Running (Ghost Fix Applied)');
});

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join-room', (roomId, userId) => {
        // 1. Join the socket room
        socket.join(roomId);
        
        // 2. RECORD THE MAPPING (Fixes the ghost camera issue)
        socketToRoom[socket.id] = roomId;
        
        console.log(`User ${userId} joined room: ${roomId}`);
        
        // 3. Tell others a new user is here
        socket.to(roomId).emit('user-connected', userId);
    });

    socket.on('update-game-state', ({ userId, data }) => {
        const roomId = socketToRoom[socket.id];
        if (roomId) {
            socket.to(roomId).emit('game-state-updated', { userId, data });
        }
    });

    socket.on('update-turn-state', (newState) => {
        const roomId = socketToRoom[socket.id];
        if (roomId) {
            io.to(roomId).emit('turn-state-updated', newState);
        }
    });
    
    socket.on('reset-game-request', (data) => {
        const roomId = socketToRoom[socket.id];
        if (roomId) {
            io.to(roomId).emit('game-reset', data);
        }
    });
    
    socket.on('update-seat-order', (newOrder) => {
        const roomId = socketToRoom[socket.id];
        if (roomId) {
            io.to(roomId).emit('seat-order-updated', newOrder);
        }
    });

    // --- DISCONNECT HANDLER (The Fix) ---
    socket.on('disconnect', () => {
        // 1. Look up which room they were in
        const roomId = socketToRoom[socket.id];
        
        if (roomId) {
            // 2. Tell everyone in that room to remove this specific ID
            socket.to(roomId).emit('user-disconnected', socket.id);
            console.log(`User ${socket.id} disconnected from room ${roomId}`);
            
            // 3. Clean up the map
            delete socketToRoom[socket.id];
        }
    });
});

process.on('uncaughtException', err => {
    console.error('CRASH! UNCAUGHT EXCEPTION:', err);
    process.exit(1); 
});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
