const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*", // allow all for development
    methods: ["GET", "POST"]
  }
});

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Create room
  socket.on('create-room', (roomId) => {
    socket.join(roomId);
    console.log(`User ${socket.id} created and joined room: ${roomId}`);
    socket.emit('room-created', roomId);
  });

  // Join room
  socket.on('join-room', (roomId) => {
    const clients = io.sockets.adapter.rooms.get(roomId);
    if (!clients || clients.size === 0) {
      socket.emit('error', 'Room not found.');
      return;
    }
    
    if (clients.size >= 2) {
      socket.emit('error', 'Room is locked! Max 2 participants allowed.');
      return;
    }

    socket.join(roomId);
    console.log(`User ${socket.id} joined room: ${roomId}`);
    // Notify everyone else in the room that a user joined
    socket.to(roomId).emit('user-joined', socket.id);
    socket.emit('room-joined', roomId);
  });

  // Relay offer
  socket.on('offer', (offer, roomId) => {
    socket.to(roomId).emit('offer', offer, socket.id);
  });

  // Relay answer
  socket.on('answer', (answer, roomId) => {
    socket.to(roomId).emit('answer', answer, socket.id);
  });

  // Relay ICE candidate
  socket.on('ice-candidate', (candidate, roomId) => {
    socket.to(roomId).emit('ice-candidate', candidate, socket.id);
  });

  // Relay Chat Messages
  socket.on('chat-message', (message, roomId, mode) => {
    socket.to(roomId).emit('chat-message', message, mode);
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Signaling server listening on port ${PORT}`);
});
