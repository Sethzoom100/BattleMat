// server/index.js

// 1. IMPORT NECESSARY MODULES
const { createServer } = require('http');
const { Server } = require('socket.io');
const express = require('express');
const cors = require('cors');

// Define the port, prioritizing the environment variable (for Render)
const PORT = process.env.PORT || 3001; 

// 2. SETUP EXPRESS AND CORS
const app = express();

// WE USE AN ARRAY TO ALLOW BOTH LOCALHOST (FOR TESTING) AND VERCEL (FOR PROD)
const ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:3001",
    "https://battle-mat-dusky.vercel.app" // IMPORTANT: No trailing slash!
];

app.use(cors({
    origin: ALLOWED_ORIGINS,
    methods: ["GET", "POST"]
}));

// 3. CREATE BASE HTTP SERVER AND SOCKET.IO INSTANCE
const server = createServer(app);
const io = new Server(server, {
    cors: {
        origin: ALLOWED_ORIGINS,
        methods: ["GET", "POST"]
    }
});

// 4. DEPLOYMENT HEALTH CHECK ROUTE
// Render needs a quick, simple route to check if the server is alive.
app.get('/', (req, res) => {
    res.send('BattleMat Signaling Server Running');
});


// 5. SOCKET.IO ROOMS AND GAME LOGIC
io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Listen for the client joining a specific room (ROOM_ID from client URL)
    socket.on('join-room', (roomId, userId) => {
        
        // --- CRITICAL ROOM FIX ---
        socket.join(roomId);
        console.log(`User ${userId} joined room: ${roomId}`);
        
        // Broadcast to others in the SAME room that a new user connected
        // The sender needs to update the game state immediately after joining
        socket.to(roomId).emit('user-connected', userId);
    });

    // Handle generic game state updates
    socket.on('update-game-state', ({ userId, data }) => {
        // Find the room the socket is in (excluding its own socket ID room)
        const [roomToBroadcast] = Array.from(socket.rooms).filter(r => r !== socket.id);
        
        if (roomToBroadcast) {
            // Broadcast the update ONLY to others in this specific room
            socket.to(roomToBroadcast).emit('game-state-updated', { userId, data });
        }
    });

    // Handle turn changes
    socket.on('update-turn-state', (newState) => {
        const [roomToBroadcast] = Array.from(socket.rooms).filter(r => r !== socket.id);
        if (roomToBroadcast) {
             // Broadcast to everyone in the room, including sender's client
            io.to(roomToBroadcast).emit('turn-state-updated', newState);
        }
    });
    
    // Handle game reset
    socket.on('reset-game-request', (data) => {
        const [roomToBroadcast] = Array.from(socket.rooms).filter(r => r !== socket.id);
        if (roomToBroadcast) {
            io.to(roomToBroadcast).emit('game-reset', data);
        }
    });
    
    // Handle seat order changes
    socket.on('update-seat-order', (newOrder) => {
        const [roomToBroadcast] = Array.from(socket.rooms).filter(r => r !== socket.id);
        if (roomToBroadcast) {
            io.to(roomToBroadcast).emit('seat-order-updated', newOrder);
        }
    });


    socket.on('disconnect', () => {
        // Find the room the user was in before disconnecting
        const rooms = Array.from(socket.rooms).filter(r => r !== socket.id);
        
        rooms.forEach(roomToBroadcast => {
            socket.to(roomToBroadcast).emit('user-disconnected', socket.id);
            console.log(`User ${socket.id} disconnected from room: ${roomToBroadcast}`);
        });
    });
});

// 6. START SERVER LISTENING
// Global exception handler to diagnose startup crashes on Render
process.on('uncaughtException', err => {
    console.error('CRASH! UNCAUGHT EXCEPTION:', err);
    process.exit(1); 
});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}. Frontend should connect to this port/URL.`);
});
