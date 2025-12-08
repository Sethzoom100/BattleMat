// server/index.js

// 1. IMPORT NECESSARY MODULES
const { createServer } = require('http');
const { Server } = require('socket.io');
const express = require('express');
const cors = require('cors');

// Define the port (Render uses the PORT env var)
const PORT = process.env.PORT || 3001; 

// 2. SETUP "BULLETPROOF" CORS
// This configuration allows ANY website to connect.
// It solves the "trailing slash" issue permanently.
const corsOptions = {
    origin: function (origin, callback) {
        // null origin means the request is from a server/mobile app (allow it)
        // true means "reflect the origin" (allow the website asking)
        callback(null, true);
    },
    methods: ["GET", "POST"],
    credentials: true
};

const app = express();

// Apply CORS to Express
app.use(cors(corsOptions));

// 3. CREATE SERVER & SOCKET
const server = createServer(app);
const io = new Server(server, {
    cors: corsOptions // Apply CORS to Socket.io
});

// 4. HEALTH CHECK ROUTE
app.get('/', (req, res) => {
    res.send('BattleMat Signaling Server Running (CORS Fixed)');
});

// 5. SOCKET.IO LOGIC
io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.on('join-room', (roomId, userId) => {
        socket.join(roomId);
        console.log(`User ${userId} joined room: ${roomId}`);
        socket.to(roomId).emit('user-connected', userId);
    });

    socket.on('update-game-state', ({ userId, data }) => {
        const [roomToBroadcast] = Array.from(socket.rooms).filter(r => r !== socket.id);
        if (roomToBroadcast) {
            socket.to(roomToBroadcast).emit('game-state-updated', { userId, data });
        }
    });

    socket.on('update-turn-state', (newState) => {
        const [roomToBroadcast] = Array.from(socket.rooms).filter(r => r !== socket.id);
        if (roomToBroadcast) {
            io.to(roomToBroadcast).emit('turn-state-updated', newState);
        }
    });
    
    socket.on('reset-game-request', (data) => {
        const [roomToBroadcast] = Array.from(socket.rooms).filter(r => r !== socket.id);
        if (roomToBroadcast) {
            io.to(roomToBroadcast).emit('game-reset', data);
        }
    });
    
    socket.on('update-seat-order', (newOrder) => {
        const [roomToBroadcast] = Array.from(socket.rooms).filter(r => r !== socket.id);
        if (roomToBroadcast) {
            io.to(roomToBroadcast).emit('seat-order-updated', newOrder);
        }
    });

    socket.on('disconnect', () => {
        const rooms = Array.from(socket.rooms).filter(r => r !== socket.id);
        rooms.forEach(roomToBroadcast => {
            socket.to(roomToBroadcast).emit('user-disconnected', socket.id);
        });
    });
});

// 6. START SERVER
process.on('uncaughtException', err => {
    console.error('CRASH! UNCAUGHT EXCEPTION:', err);
    process.exit(1); 
});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}. Accepting all CORS origins.`);
});
