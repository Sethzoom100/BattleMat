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

app.get('/', (req, res) => { res.send('BattleMat Server Running (Final Fix)'); });

io.on('connection', (socket) => {
    
    socket.on('join-room', (roomId, userId) => {
        socket.join(roomId);
        // Map Socket ID to Room AND Peer ID
        socketToRoom[socket.id] = roomId;
        socketToUser[socket.id] = userId;
        
        console.log(`User ${userId} joined room ${roomId}`);
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

    // --- ROBUST DISCONNECT ---
    socket.on('disconnect', () => {
        const roomId = socketToRoom[socket.id];
        const userId = socketToUser[socket.id];
        
        if (roomId && userId) {
            console.log(`User ${userId} disconnected from ${roomId}`);
            // Send the specific Peer ID to remove
            socket.to(roomId).emit('user-disconnected', userId);
        }
        
        // Cleanup
        delete socketToRoom[socket.id];
        delete socketToUser[socket.id];
    });
});

process.on('uncaughtException', err => { console.error(err); process.exit(1); });
server.listen(PORT, () => { console.log(`Server running on port ${PORT}`); });
