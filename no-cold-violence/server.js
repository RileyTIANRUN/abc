const express = require('express');
const https = require("https");
const fs = require("fs");

const app = express();
const portHTTPS = 4300;

app.use(express.static('public'));

const options = {
  key: fs.readFileSync("keys-for-local-https/localhost-key.pem"),
  cert: fs.readFileSync("keys-for-local-https/localhost.pem"),
};

const HTTPSserver = https.createServer(options, app);

const { Server } = require('socket.io');
const io = new Server(HTTPSserver);

io.on('connection', (socket) => {
  console.log("user connected");

  socket.on("messageFromClient", (data) => {
    io.emit("messageFromServer", data);
  });

  socket.on("presence", (data) => {
    io.emit("presenceFromServer", data);
  });

  socket.on("disconnect", () => {
    console.log("user disconnected");
  });
});

HTTPSserver.listen(portHTTPS, () => {
  console.log("HTTPS Server running on", portHTTPS);
});
