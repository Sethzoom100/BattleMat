// server/index.js

const { createServer } = require('http');
const { Server } = require('socket.io');
const express = require('express');
const cors = require('cors');

const PORT = process.env.PORT || 3001; 

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

// --- TRACKING MAPS ---
const socketToRoom = {};
const socketToUser = {}; // NEW: Maps Socket ID -> Peer ID

app.get('/', (req, res) => {
    res.send('BattleMat Server Running (ID Mismatch Fix)');
});

io.on('connection', (socket) => {
    
    socket.on('join-room', (roomId, userId) => {
        socket.join(roomId);
        
        // STORE BOTH MAPPINGS
        socketToRoom[socket.id] = roomId;
        socketToUser[socket.id] = userId; // userId here is the Peer ID
        
        console.log(`User ${userId} joined room: ${roomId}`);
        socket.to(roomId).emit('user-connected', userId);
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

    // --- DISCONNECT HANDLER (FIXED) ---
    socket.on('disconnect', () => {
        const roomId = socketToRoom[socket.id];
        const userId = socketToUser[socket.id]; // Get the Peer ID
        
        if (roomId && userId) {
            // Send the PEER ID (userId), not the Socket ID
            socket.to(roomId).emit('user-disconnected', userId);
            console.log(`User ${userId} disconnected from room ${roomId}`);
            
            // Clean up
            delete socketToRoom[socket.id];
            delete socketToUser[socket.id];
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
