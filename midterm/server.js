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

let HTTPSserver = https.createServer(options, app);

const { Server } = require('socket.io');
const io = new Server(HTTPSserver);

/* ================= GLOBAL ================= */

let players = {};
let observers = [];

let game = {};

let revealAckCount = 0;
let continueVotes = 0;

let firstPlayer = "player1";

let emojiStatus = {
    player1: "",
    player2: ""
};

/* ================= STATE SYNC ================= */

function broadcastState(){

    io.emit("gameState",{

        stage:game.stage,
        firstPlayer:firstPlayer,

        p1Score:game.p1Score,
        p2Score:game.p2Score,

        p1Choice:game.p1Choice,
        p2Choice:game.p2Choice,

        p1Confirmed:game.p1Confirmed,
        p2Confirmed:game.p2Confirmed,

        p1Peeked:game.p1Peeked,
        p2Peeked:game.p2Peeked, 
        p1Double:game.p1Double,
        p2Double:game.p2Double,

        p1UsedPower: game.p1UsedPower,
        p2UsedPower: game.p2UsedPower
    });
}

/* ================= INIT ================= */

function initGame() {

    players = {};
    observers = [];

    game = {

        stage: "waiting",

        p1Score: 100,
        p2Score: 100,

        p1Choice: null,
        p2Choice: null,

        p1Confirmed: false,
        p2Confirmed: false,

        p1UsedPower: false,
        p2UsedPower: false,

        p1Peeked: false,
        p2Peeked: false,
        p1Double: false,
        p2Double: false,

        p1Draw: false,
        p2Draw: false
    };

    revealAckCount = 0;
    continueVotes = 0;

    firstPlayer = "player1";

    emojiStatus = {
        player1:"",
        player2:""
    };

    console.log("=== FULL INIT ===");
}

initGame();

/* ================= ROUND RESET ================= */

function resetRound() {

    game.stage = "select";

    game.p1Choice = null;
    game.p2Choice = null;

    game.p1Confirmed = false;
    game.p2Confirmed = false;

    game.p1UsedPower = false;
    game.p2UsedPower = false;

    game.p1Peeked = false;
    game.p2Peeked = false;
    game.p1Double = false;
    game.p2Double = false;

    game.p1Draw = false;
    game.p2Draw = false;

    revealAckCount = 0;

    /* 先手轮换 */
    firstPlayer = firstPlayer === "player1" ? "player2" : "player1";

    console.log("=== NEW ROUND ===");

    broadcastState();
}

/* ================= END CHECK ================= */

function checkGameEnd(){

    if(
        game.p1Score >= 150 ||
        game.p1Score <= 50 ||
        game.p2Score >= 150 ||
        game.p2Score <= 50
    ) {
        io.emit("gameOverAsk",{
            p1Score: game.p1Score,
            p2Score: game.p2Score
        });
        return true;
    }

    return false;
}

/* ================= CONNECTION ================= */

io.on("connection", (socket) => {

    console.log("Connected:", socket.id);

    /* ================= JOIN ================= */

    socket.on("joinGame", () => {

        if (Object.keys(players).length >= 2) {

            observers.push(socket.id);

            socket.emit("observer");

            socket.emit("gameState",{
                stage:game.stage,
                firstPlayer:firstPlayer,
                p1Score:game.p1Score,
                p2Score:game.p2Score
            });

            return;
        }

        const role = Object.keys(players).length === 0 ? "player1" : "player2";
        players[socket.id] = role;

        console.log(socket.id, "joined as", role);

        if (Object.keys(players).length === 2) {

            game.stage = "select";

            for (let id in players) {

                io.to(id).emit("startGame", {
                    role: players[id],
                    p1Score: game.p1Score,
                    p2Score: game.p2Score,
                    firstPlayer:firstPlayer
                });

            }

            broadcastState();
        }

    });

    /* ================= SELECT ================= */

    socket.on("select", (choice) => {

        const role = players[socket.id];
        
        if (role === "player1") game.p1Choice = choice;
        if (role === "player2") game.p2Choice = choice;

        broadcastState();
    });

    socket.on("confirm", () => {

        const role = players[socket.id];

        // 逻辑：如果是初始选择阶段
        if (game.stage === "select") {
            if (role === "player1") game.p1Confirmed = true;
            if (role === "player2") game.p2Confirmed = true;

            if (game.p1Confirmed && game.p2Confirmed) {
                game.stage = "p1Turn"; 
                io.emit("p1Turn"); 
                broadcastState();
            }
        } 
        // 关键逻辑：如果是修改手势后的确认
        else if (game.stage === "p1Change" || game.stage === "p2Change") {
            
            // 判断确认者是不是本轮的先手
            if (role === firstPlayer) {
                // 先手修改完 -> 轮到后手回合
                game.stage = "p2Turn"; 
                io.emit("p2Turn");
            } else {
                // 后手修改完 -> 进结算，打破死循环
                game.stage = "final";
                io.emit("finalStage");
            }
            
            broadcastState();
        }
    });

    /* ================= FIRST PLAYER TURN ================= */

    socket.on("peep", () => {

        const role = players[socket.id];
        if(role !== firstPlayer) return;
        
        if(role === "player1") {
            game.p1UsedPower = true;
            game.p1Peeked = true;
            socket.emit("peekResult", game.p2Choice);
        } else {
            game.p2UsedPower = true;
            game.p2Peeked = true;
            socket.emit("peekResult", game.p1Choice);
        }

        // 修正：先手触发的统一为 p1Change
        game.stage = "p1Change"; 

        broadcastState();
    });

    /* ================= SECOND PLAYER TURN ================= */

    socket.on("checkPeeping", () => {

        const role = players[socket.id];
        if(role === firstPlayer) return;

        if(role === "player1") game.p1UsedPower = true; else game.p2UsedPower = true;

        const opponentPeeked = (firstPlayer === "player1") ? game.p1Peeked : game.p2Peeked;
        socket.emit("peepStatus", opponentPeeked);

        // 修正：后手触发的统一为 p2Change，无论他是 P1 还是 P2
        game.stage = "p2Change";

        broadcastState();
    });

    socket.on("checkLose", () => {

        const role = players[socket.id];
        if(role === firstPlayer) return;

        if(role === "player1") game.p1UsedPower = true; else game.p2UsedPower = true;

        const result = judge(game.p1Choice, game.p2Choice);

        // 后手是否输了
        const lose = (role === "player1" && result === "p2") || (role === "player2" && result === "p1");

        socket.emit("loseStatus", lose);

        // 修正：后手触发的统一为 p2Change，无论他是 P1 还是 P2
        game.stage = "p2Change";

        broadcastState();
    });

    /* ================= DOUBLE ================= */

    socket.on("p1Double",()=>{

        const role = players[socket.id];
        if(role !== firstPlayer) return;

        if(role === "player1") {
            game.p1UsedPower = true;
            game.p1Double = true;
        } else {
            game.p2UsedPower = true;
            game.p2Double = true;
        }

        game.stage = "p2Turn";
        io.emit("p2Turn");
        broadcastState();
    });

    socket.on("p2Double",()=>{

        const role = players[socket.id];
        if(role === firstPlayer) return;

        if(role === "player1") {
            game.p1UsedPower = true;
            game.p1Double = true;
        } else {
            game.p2UsedPower = true;
            game.p2Double = true;
        }

        game.stage="final";
        io.emit("finalStage");

        broadcastState();
    });

    /* ================= FINAL ================= */

    socket.on("proposeDraw", () => {

        const role = players[socket.id];

        if (role === "player1") game.p1Draw = true;
        if (role === "player2") game.p2Draw = true;

        if (game.p1Draw && game.p2Draw) {
            applyDraw();
        }

        broadcastState();
    });

    socket.on("reveal", () => {

        applyResult();
        broadcastState();
    });

    /* ================= EMOJI ================= */

    socket.on("emoji",(emoji)=>{

        const role = players[socket.id];

        if(role === "player1") emojiStatus.player1 = emoji;
        if(role === "player2") emojiStatus.player2 = emoji;

        io.emit("emoji",{
            role:role,
            emoji:emoji
        });

    });

    /* ================= ACK ================= */

    socket.on("ackReveal",()=>{

        revealAckCount++;

        if(revealAckCount >= 2){

            if(!checkGameEnd()){

                resetRound();

                io.emit("startNextRound",{
                    p1Score:game.p1Score,
                    p2Score:game.p2Score,
                    firstPlayer:firstPlayer
                });

            }

        }

    });

    /* ================= CONTINUE ================= */

    socket.on("continueGame",()=>{

        continueVotes++;

        if(continueVotes >= 2){

            continueVotes = 0;

            resetRound();

            io.emit("startNextRound",{
                p1Score:game.p1Score,
                p2Score:game.p2Score,
                firstPlayer:firstPlayer
            });

        }

    });

    /* ================= DISCONNECT ================= */

    socket.on("disconnect",()=>{

        console.log("Disconnected:", socket.id);

        if(players[socket.id]){

            delete players[socket.id];

            console.log("Player disconnected, resetting game");

            initGame();

            io.emit("playerLeft");

        }

    });

});

/* ================= RULES ================= */

function judge(a, b) {

    if (a === b) return "draw";

    if (
        (a === "rock" && b === "scissors") ||
        (a === "paper" && b === "rock") ||
        (a === "scissors" && b === "paper")
    ) return "p1";

    return "p2";
}

function applyDraw() {

    game.p1Score += 5;
    game.p2Score += 5;

    io.emit("revealResult", {
        p1: game.p1Choice,
        p2: game.p2Choice,
        winner: "draw",
        p1Score: game.p1Score,
        p2Score: game.p2Score
    });
}

function applyResult() {

    const result = judge(game.p1Choice, game.p2Choice);

    let p1Gain = 0;
    let p2Gain = 0;

    if (result === "draw") {
        p1Gain = 5;
        p2Gain = 5;
    }

    if (result === "p1") {
        p1Gain = game.p1Double ? 20 : 10;
        p2Gain = -10;
    }

    if (result === "p2") {
        p2Gain = game.p2Double ? 20 : 10;
        p1Gain = game.p1Peeked ? -20 : -10;
    }

    game.p1Score += p1Gain;
    game.p2Score += p2Gain;

    io.emit("revealResult", {
        p1: game.p1Choice,
        p2: game.p2Choice,
        winner: result,
        p1Score: game.p1Score,
        p2Score: game.p2Score
    });
}

HTTPSserver.listen(portHTTPS, function () {
    console.log("HTTPS Server started at port", portHTTPS);
});