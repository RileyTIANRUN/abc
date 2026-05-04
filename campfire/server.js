const express = require("express");
const https = require("https");
const fs = require("fs");
const app = express();
const portHTTPS = 4300;

app.use(express.static("public"));
const options = {
    key: fs.readFileSync("keys-for-local-https/localhost-key.pem"),
    cert: fs.readFileSync("keys-for-local-https/localhost.pem"),
};

let HTTPSserver = https.createServer(options, app);
const { Server } = require("socket.io");
const io = new Server(HTTPSserver);
const DATA_FILE = "camp_data.json";

let gameState = {
    fuelMinutes: 60,      
    maxFuelMinutes: 120,  
    lastCheckTime: Date.now(),
    totalBurnedMinutes: 0,
    historyLog: [] ,
    fireColor: 'default'
};

let users = {};

function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const fileData = fs.readFileSync(DATA_FILE, 'utf8');
            const parsed = JSON.parse(fileData);
            gameState = parsed.gameState;
            users = parsed.users;
            if (!gameState.historyLog) gameState.historyLog = [];
            console.log("Data loaded from JSON");
        }
    } catch (err) {
        console.error("Error loading data:", err);
    }
}

function saveData() {
    try {
        const dataToSave = { gameState, users };
        fs.writeFileSync(DATA_FILE, JSON.stringify(dataToSave, null, 2));
    } catch (err) {
        console.error("Error saving data:", err);
    }
}

function getFormattedTime() {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
}


function addHistoryEntry(username, type, detail = {}) {
    const timeStr = getFormattedTime();
    let actionText = "";

    switch (type) {
        case "RETURN":
            actionText = `went back to campfire at ${timeStr}, brought ${detail.count || 0} supplys back.`;
            break;
        case "FUEL":
            actionText = `add a ${detail.item} into the campfire at ${timeStr}.`;
            break;
        case "LEAVE":
            actionText = `leave the campfire at ${timeStr}.`;
            break;
        case "USE":
            actionText = `used ${detail.item}, something changed at ${timeStr}.`;
            break;
        default:
            actionText = `did something at ${timeStr}.`;
    }

    const entry = {
        user: username,
        action: actionText
    };

    gameState.historyLog.unshift(entry);

    if (gameState.historyLog.length > 50) gameState.historyLog.pop();

    io.emit("updateLogUI", entry);
    saveData();
}

loadData();

function updateGlobalFire() {
    const now = Date.now();
    const elapsedMinutes = (now - gameState.lastCheckTime) / 60000;
    
    if (gameState.fuelMinutes > 0) {
        const actualConsumption = Math.min(gameState.fuelMinutes, elapsedMinutes);
        gameState.fuelMinutes -= actualConsumption;
        gameState.totalBurnedMinutes += actualConsumption;
    }
    
    gameState.lastCheckTime = now;
}

io.on("connection", (socket) => {
    console.log("A user connected");

    socket.on("userLogin", (username) => {
        updateGlobalFire();
        socket.username = username;

        let gotStick = 0, gotLog = 0, gotSpecial = 0, offlineMinutes = 0;

        if (!users[username]) {
            users[username] = {
                inventory: { stick: 5, log: 5, special: 5 },
                lastSeen: Date.now()
            };
            addHistoryEntry(username, "WELCOME", { count: 10 });
        } else {
            const user = users[username];
            const offlineMs = Date.now() - user.lastSeen;
            offlineMinutes = Math.floor(offlineMs / 60000);

            if (offlineMinutes >= 1) {
                let attempts = Math.min(20, Math.floor(offlineMinutes / 5));
                attempts = Math.max(1, attempts); 

                for (let i = 0; i < attempts; i++) {
                    let r = Math.random() * 100;
                    if (r < 33) gotStick++;
                    else if (r < 66) gotLog++;
                    else gotSpecial++;
                }
                user.inventory.stick = Math.min(99, user.inventory.stick + gotStick);
                user.inventory.log = Math.min(99, user.inventory.log + gotLog);
                user.inventory.special = Math.min(99, user.inventory.special + gotSpecial);
                addHistoryEntry(username, "RETURN", { count: gotStick + gotLog + gotSpecial });
            }
        }

        users[username].lastSeen = Date.now();

        socket.emit("initData", {
            fuelMinutes: gameState.fuelMinutes,
            totalBurnedMinutes: gameState.totalBurnedMinutes,
            inventory: users[username].inventory,
            username: username,
            historyLog: gameState.historyLog, 
            sessionReport: {
                minutes: offlineMinutes,
                itemsFound: gotStick + gotLog + gotSpecial
            }
        });
        saveData();
    });

    socket.on("addFuel", (type) => {
        if (!socket.username) return;
        updateGlobalFire();

        const user = users[socket.username];
        if (user && user.inventory[type] && user.inventory[type] > 0) {
            user.inventory[type]--;
            let bonus = (type === "log") ? 10 : 1; // Log 加得多，Stick 加得少
            gameState.fuelMinutes = Math.min(gameState.maxFuelMinutes, gameState.fuelMinutes + bonus);
            
            addHistoryEntry(socket.username, "FUEL", { item: type });

            io.emit("syncFire", { 
                fuelMinutes: gameState.fuelMinutes,
                totalBurnedMinutes: gameState.totalBurnedMinutes,
                type: type 
            });

            socket.emit("updateInventory", user.inventory);
        }
    });

    socket.on("useSpecial", (itemName) => {
    if (!socket.username || !users[socket.username]) return;
    const user = users[socket.username];
    if (user.inventory.special > 0) {
        user.inventory.special--;
        if (gameState.fireColor === 'default') {
            const colors = ['green', 'purple', 'blue', 'cyan'];
            gameState.fireColor = colors[Math.floor(Math.random() * colors.length)];
        } else {
            gameState.fireColor = 'default';
        }
        addHistoryEntry(socket.username, "USE", { item: "Magic Powder" });
        io.emit("syncFire", { 
            fuelMinutes: gameState.fuelMinutes,
            totalBurnedMinutes: gameState.totalBurnedMinutes,
            fireColor: gameState.fireColor,
            playMagic: true 
        });
        socket.emit("updateInventory", user.inventory);
        saveData();
    }
});

    socket.on("disconnect", () => {
        if (socket.username && users[socket.username]) {
            addHistoryEntry(socket.username, "LEAVE");
            users[socket.username].lastSeen = Date.now();
            saveData();
        }
    });
});


setInterval(() => {
    updateGlobalFire();
    io.emit("syncFire", { 
        fuelMinutes: gameState.fuelMinutes,
        totalBurnedMinutes: gameState.totalBurnedMinutes,
        fireColor: gameState.fireColor 
    });
    saveData();
}, 10000);

HTTPSserver.listen(portHTTPS, () => {
    console.log("Campfire HTTPS Server running on port", portHTTPS);
});