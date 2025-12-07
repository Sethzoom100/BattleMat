// server/index.js (Focus on the 'connection' handler)
// Add this block to the top/bottom of your server file
process.on('uncaughtException', err => {
    console.error('CRASH! UNCAUGHT EXCEPTION:', err);
    // Exit with code 1 (failure) so Render attempts a restart
    process.exit(1); 
});
// ... other imports and setup ...
// server/index.js

// 1. IMPORT NECESSARY MODULES
const { createServer } = require('http'); // For creating the base HTTP server
const { Server } = require('socket.io');   // For creating the Socket.io server
const express = require('express');        // For Express app
const cors = require('cors');              // For handling cross-origin requests

// 2. SETUP EXPRESS APP
const app = express();
app.use(cors());

// 3. CREATE HTTP SERVER (Express app needs to be passed to this)
const server = createServer(app);

// 4. CREATE SOCKET.IO INSTANCE (The 'io' variable MUST be defined here)
const io = new Server(server, {
  cors: {
    // This is the domain where your React frontend is hosted!
    origin: "battle-mat-dusky.vercel.app", // **REPLACE THIS**
    methods: ["GET", "POST"]
  }
});

// Now, the 'io.on("connection", ...)' block should work.

// io.on('connection', (socket) => { ... });
io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // 1. Listen for the specific 'join-room' event sent by the client
    socket.on('join-room', (roomId, userId) => {
        
        // --- CRITICAL FIX: Join the user to the specified room ---
        socket.join(roomId);
        console.log(`User ${userId} joined room: ${roomId}`);
        
        // 2. Broadcast to others in the SAME room
        socket.to(roomId).emit('user-connected', userId);
        
        // If your server needs to send the initial game state, you'd load it here
        // and send it ONLY to the socket that just joined.
    });

    // 3. Listen for game state updates and broadcast ONLY to the room
    socket.on('update-game-state', (data) => {
        // Find all rooms this socket belongs to (should be one: the roomId)
        const [roomToBroadcast] = Array.from(socket.rooms).filter(r => r !== socket.id);
        
        if (roomToBroadcast) {
            // Broadcast the update ONLY to others in this specific room
            socket.to(roomToBroadcast).emit('game-state-updated', data);
        }
    });

    // ... similarly update other events like 'update-turn-state', etc. ...

    socket.on('disconnect', () => {
        // Find the room the user was in before disconnecting
        const [roomToBroadcast] = Array.from(socket.rooms).filter(r => r !== socket.id);
        
        if (roomToBroadcast) {
            socket.to(roomToBroadcast).emit('user-disconnected', socket.id);
            console.log(`User ${socket.id} disconnected from room: ${roomToBroadcast}`);
        }
    });
});

// ... server listen ...
