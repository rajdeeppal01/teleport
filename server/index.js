const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*", // allow any origin for testing
    methods: ["GET", "POST"]
  }
});

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // When a desktop app creates a room
  socket.on('create-room', (roomId) => {
    socket.join(roomId);
    console.log(`Desktop ${socket.id} created/joined room: ${roomId}`);
  });

  // When a mobile app joins a room
  socket.on('join-room', (roomId) => {
    socket.join(roomId);
    console.log(`Mobile ${socket.id} joined room: ${roomId}`);
    // Notify the room that a peer has joined
    socket.to(roomId).emit('peer-joined', socket.id);
  });

  // WebRTC Signaling: Forward an offer
  socket.on('offer', (data) => {
    socket.to(data.roomId).emit('offer', {
      offer: data.offer,
      sender: socket.id
    });
  });

  // WebRTC Signaling: Forward an answer
  socket.on('answer', (data) => {
    socket.to(data.roomId).emit('answer', {
      answer: data.answer,
      sender: socket.id
    });
  });

  // WebRTC Signaling: Forward ICE candidates
  socket.on('ice-candidate', (data) => {
    socket.to(data.roomId).emit('ice-candidate', {
      candidate: data.candidate,
      sender: socket.id
    });
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Signaling server listening on port ${PORT}`);
});
