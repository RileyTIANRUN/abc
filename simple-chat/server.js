const express = require('express');
const https = require("https");
const fs = require("fs");
const app = express(); 
const portHTTPS = 3000; 
app.use(express.static('public'));

const options = {
    key: fs.readFileSync("keys-for-local-https/localhost-key.pem"),
    cert: fs.readFileSync("keys-for-local-https/localhost.pem"),
};

const HTTPSsever = https.createServer(options, app)

const { Server } = require('socket.io'); // include library
const io = new Server(HTTPSserver); // start socket io

io.on('connection',(socket) => {
    console.log('a user is connect')
})


HTTPSsever.listen(portHTTPS, function (req, res) {
    console.log("HTTPS Server started at port", portHTTPS);
});




