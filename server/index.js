const express = require('express');
const app = express();
const server = require('http').Server(app);
const io = require('socket.io')(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Store seating arrangements in memory
// Key: RoomID, Value: Array of UserIDs ['userA', 'userB', ...]
const roomSeats = {};

io.on('connection', (socket) => {
  
  socket.on('join-room', (roomId, userId) => {
    socket.join(roomId);
    
    // --- SEATING LOGIC ---
    if (!roomSeats[roomId]) roomSeats[roomId] = [];
    
    // Add user if not already in the seat list
    if (!roomSeats[roomId].includes(userId)) {
        roomSeats[roomId].push(userId);
    }

    // 1. Broadcast the synchronized seat order to EVERYONE (including the new user)
    io.in(roomId).emit('seat-order-updated', roomSeats[roomId]);
    
    // 2. Standard User Joined event (for WebRTC connection)
    socket.to(roomId).emit('user-connected', userId);

    // --- GAME LISTENERS ---
    socket.on('update-game-state', (data) => {
        socket.to(roomId).emit('game-state-updated', data);
    });

    socket.on('update-turn-state', (newState) => {
        socket.to(roomId).emit('turn-state-updated', newState);
    });

    socket.on('reset-game-request', (data) => {
        io.in(roomId).emit('game-reset', data);
    });

    socket.on('update-seat-order', (newOrder) => {
        // Update server memory
        roomSeats[roomId] = newOrder;
        // Broadcast new order to everyone
        io.in(roomId).emit('seat-order-updated', newOrder);
    });

    socket.on('disconnect', () => {
      // Remove user from seats
      if (roomSeats[roomId]) {
          roomSeats[roomId] = roomSeats[roomId].filter(id => id !== userId);
          io.in(roomId).emit('seat-order-updated', roomSeats[roomId]);
      }
      socket.to(roomId).emit('user-disconnected', userId);
    });
  });
});

server.listen(3001, () => {
  console.log('✅ Game Logic Server running on port 3001');
});