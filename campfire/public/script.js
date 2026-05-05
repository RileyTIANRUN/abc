if(location.hostname.toLowerCase().startsWith('browsercircus') || location.hostname.toLowerCase().startsWith('www')){
  socket = io({path: "/riley/port-4300/socket.io"});  // e.g. '/riley/port-4300/socket.io' or '/socket.io'
}else{
  socket = io(); 
}
const USERNAME_KEY = "campfire_username";
let myUsername = localStorage.getItem(USERNAME_KEY);
let fuelMinutes = 0;
let totalBurned = 0;
let inventory = { stick: 0, log: 0, special: 0, potato: 0, cooked_potato: 0 };
let activeItem = 'stick';
let handItem = null;
let currentFireColor = 'default';

let stones = [];
let flames = {};
let sparks = [];
let smokes = [];
let floatingIcons = [];
let burstTimer = 0;
let isExtinguished = false;

let sndCampfire, sndMagic, sndCook, sndEat, sndOuch;;
let sndAmbients = [];
let currentAmbient = null;

let imgStick, imgLog, imgSpecial, imgPotato, imgCookedPotato, imgHand;

let campY; 
let fireScale = 1.0;
let cursorDispScale = 1.0;

function preload() {
    sndCampfire = loadSound('sounds/campfire.wav');
    sndAmbients = [
        loadSound('sounds/environment1.wav'),
        loadSound('sounds/environment2.wav'),
        loadSound('sounds/wind.wav'),
        loadSound('sounds/wolf.wav')
    ];
    sndMagic = loadSound('sounds/magic.wav');
    sndCook = loadSound('sounds/cook.wav');
    sndEat = loadSound('sounds/eat.mp3');
    sndOuch = loadSound('sounds/ouch.wav');

    imgStick = loadImage('image/stick.png');
    imgLog = loadImage('image/log.png');
    imgSpecial = loadImage('image/special.png');
    imgPotato = loadImage('image/potato.png');
    imgCookedPotato = loadImage('image/cooked-potato.png');
    imgHand = loadImage('image/hand.png');
}

function setup() {
    createCanvas(windowWidth, windowHeight);
    calculateLayout();
    initStones();
    for (let i = -300; i <= 300; i += 5) flames[i] = random(0.8, 1.2);

    const overlay = document.getElementById('login-overlay');
    const newUI = document.getElementById('new-player-ui');
    const returnUI = document.getElementById('returning-player-ui');

    if (!myUsername) {
        newUI.style.display = 'block';
        returnUI.style.display = 'none';
        document.getElementById('start-btn').onclick = function(e) {
            e.stopPropagation();
            let val = document.getElementById('name-input').value.trim();
            if (val) {
                myUsername = val;
                localStorage.setItem(USERNAME_KEY, myUsername);
                enterCamp();
            }
        };
    } else {
        newUI.style.display = 'none';
        returnUI.style.display = 'block';
        overlay.onclick = function() {
            enterCamp();
        };
    }
}

function enterCamp() {
    document.getElementById('login-overlay').style.display = 'none';
    userStartAudio().then(() => {
        sndCampfire.loop();
        sndCampfire.setVolume(0.5);
        scheduleNextAmbient();
        loginToServer();
    });
}

function loginToServer() {
    socket.emit("userLogin", myUsername);
}

function scheduleNextAmbient() {
    let nextDelay = random(40000, 60000); 
    setTimeout(() => {
        playRandomAmbient();
        scheduleNextAmbient(); 
    }, nextDelay);
}

function playRandomAmbient() {
    if (currentAmbient && currentAmbient.isPlaying()) return;
    let snd = random(sndAmbients);
    currentAmbient = snd;
    let dur = snd.duration();
    let playDuration = 15; 
    let startTime = random(0, dur - playDuration); 
    snd.play(0, 1, 0, startTime, playDuration);
    snd.setVolume(0); 
    snd.fade(0.8, 2); 
    setTimeout(() => {
        if (snd.isPlaying()) snd.fade(0, 2);
    }, 13000);
}

socket.on("initData", (data) => {
    fuelMinutes = data.fuelMinutes;
    totalBurned = data.totalBurnedMinutes;
    inventory = data.inventory;
    updateUI();
    if (data.historyLog) {
        const logList = document.getElementById('log-list');
        logList.innerHTML = ""; 
        data.historyLog.forEach(log => appendLogToUI(log));
    }
});

socket.on("updateLogUI", (logData) => {
    appendLogToUI(logData);
});

socket.on("syncFire", (data) => {
    fuelMinutes = data.fuelMinutes;
    totalBurned = data.totalBurnedMinutes;
    if (data.fireColor) currentFireColor = data.fireColor;
    if (data.playMagic && sndMagic) sndMagic.play();
    if (data.type) burstTimer = 90; 
});

socket.on("updateInventory", (inv) => {
    inventory = inv;
    updateUI();
});

function appendLogToUI(log) {
    const logList = document.getElementById('log-list');
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.innerHTML = `<strong>${log.user}</strong> ${log.action}`;
    logList.insertBefore(entry, logList.firstChild);
}

function toggleUI(type) {
    const diary = document.getElementById('diary-overlay');
    const backpack = document.getElementById('backpack-overlay');
    if (type === 'diary') {
        diary.style.display = (diary.style.display === 'flex') ? 'none' : 'flex';
        backpack.style.display = 'none';
    } else {
        backpack.style.display = (backpack.style.display === 'flex') ? 'none' : 'flex';
        diary.style.display = 'none';
    }
}

function setActive(type) {
    activeItem = type;
    handItem = null;
    document.querySelectorAll('.slot').forEach(s => s.classList.remove('active'));
    document.getElementById('slot-' + type).classList.add('active');
    updateHandButton();
}

function setHand(type) {
    handItem = type;
    activeItem = null;
    document.querySelectorAll('.slot').forEach(s => s.classList.remove('active'));
    updateHandButton();
    toggleUI('backpack');
}

function updateHandButton() {
    const btn = document.getElementById('slot-hand');
    const imgElement = btn.querySelector('img');
    const countElement = document.getElementById('hand-count');
    
    if (handItem === 'potato') {
        imgElement.src = 'image/potato.png';
        countElement.innerText = inventory.potato || 0;
    } else if (handItem === 'cooked_potato') {
        imgElement.src = 'image/cooked-potato.png';
        countElement.innerText = inventory.cooked_potato || 0;
    } else {
        imgElement.src = 'image/hand.png';
        countElement.innerText = "";
    }
}


function updateUI() {
    document.getElementById('inv-stick').innerText = inventory.stick || 0;
    document.getElementById('inv-log').innerText = inventory.log || 0;
    document.getElementById('inv-special').innerText = inventory.special || 0;
    
    const potCount = inventory.potato || 0;
    const cPotCount = inventory.cooked_potato || 0;
    
    const bagEmptyMsg = document.getElementById('bag-empty-msg');
    const potatoList = document.getElementById('potato-list');
    
    if (potCount > 0 || cPotCount > 0) {
        bagEmptyMsg.style.display = 'none';
        potatoList.style.display = 'block';
        document.getElementById('bag-potato-count').innerText = potCount;
        document.getElementById('bag-cooked-count').innerText = cPotCount;
    } else {
        bagEmptyMsg.style.display = 'block';
        potatoList.style.display = 'none';
    }
    updateHandButton();
}

function draw() {
    background(10, 10, 15);
    let fPerc = (fuelMinutes / 120) * 100;
    isExtinguished = (fPerc <= 0);
    updateParticles(fPerc);
    
    push();
    translate(width / 2, campY);
    scale(fireScale);
    drawStoneHalf(true);
    if (!isExtinguished && fPerc > 0.1) drawFireSystem(fPerc);
    drawStoneHalf(false);
    pop();

    for (let i = floatingIcons.length - 1; i >= 0; i--) {
        floatingIcons[i].update();
        floatingIcons[i].display();
        if (floatingIcons[i].isDead()) floatingIcons.splice(i, 1);
    }

    drawCustomCursor();

    document.getElementById('remain-val').innerText = floor(fuelMinutes);
    document.getElementById('burned-val').innerText = floor(totalBurned);
}

function drawCustomCursor() {
    let img = null;
    if (activeItem === 'stick') img = imgStick;
    else if (activeItem === 'log') img = imgLog;
    else if (activeItem === 'special') img = imgSpecial;
    else if (handItem === 'potato') img = imgPotato;
    else if (handItem === 'cooked_potato') img = imgCookedPotato;

    if (img) {
        cursorDispScale = lerp(cursorDispScale, 1.0, 0.2);
        push();
        imageMode(CENTER);
        image(img, mouseX, mouseY, 40 * cursorDispScale, 40 * cursorDispScale);
        pop();
        noCursor();
    } else {
        cursor();
    }
}

function touchStarted() {
    if (document.getElementById('diary-overlay').style.display === 'flex' || 
        document.getElementById('backpack-overlay').style.display === 'flex' ||
        document.getElementById('login-overlay').style.display === 'flex') {
        return;
    }
    cursorDispScale = 1.25;
    if (mouseY < height * 0.75) {
        
        if (!handItem && !activeItem) {
            if (sndOuch) sndOuch.play();
            return; 
        }

    
        if (handItem === 'potato' && inventory.potato > 0) {
            if (dist(mouseX, mouseY, width/2, campY) < 100 && !isExtinguished) {
                sndCook.play(0, 1, 1, 0, 1);
                socket.emit('cookPotato');
                floatingIcons.push(new FloatingIcon(mouseX, mouseY, imgPotato));
                return;
            }
        }

       
        if (handItem === 'cooked_potato' && inventory.cooked_potato > 0) {
            sndEat.play();
            socket.emit('eatPotato');
            floatingIcons.push(new FloatingIcon(mouseX, mouseY, imgCookedPotato));
            return;
        }

   
        let imgToDraw = null;
        if (activeItem === 'stick' && inventory.stick > 0) imgToDraw = imgStick;
        if (activeItem === 'log' && inventory.log > 0) imgToDraw = imgLog;
        if (activeItem === 'special' && inventory.special > 0) imgToDraw = imgSpecial;

        if (imgToDraw) {
            floatingIcons.push(new FloatingIcon(mouseX, mouseY, imgToDraw));
            if (activeItem === 'special') {
                socket.emit('useSpecial', 'Magic Powder');
            } else {
                if (!isExtinguished) {
                    socket.emit('addFuel', activeItem);
                } else if (dist(mouseX, mouseY, width/2, campY) < 100) {
                    socket.emit('addFuel', 'stick');
                }
            }
        }
    }
}

function calculateLayout() {
    campY = height * 0.6;
    fireScale = width < 600 ? width / 450 : 1.0;
}

function drawFireSystem(fPerc) {
    if (frameCount % 4 === 0) {
        for (let i = -300; i <= 300; i += 5) flames[i] = random(0.8, 1.2);
    }
    let baseH = map(fPerc, 0, 100, 20, 220, true);
    let targetW = fPerc > 20 ? 80 : map(fPerc, 0, 20, 15, 80, true);
    let targetH = (burstTimer > 0) ? baseH * 1.6 : baseH;
    let alphaMult = map(fPerc, 0, 20, 0.2, 1.0, true);
    let c1, c2, c3, c4, c5;
    if (currentFireColor === 'green') {
        c1 = color(0, 40, 0, 15 * alphaMult);
        c2 = color(0, 150, 50, 45 * alphaMult);
        c3 = color(50, 255, 100, 85 * alphaMult);
        c4 = color(150, 255, 180, 130 * alphaMult);
        c5 = color(200, 255, 220, 200 * alphaMult);
    } else if (currentFireColor === 'purple') {
        c1 = color(30, 0, 40, 15 * alphaMult);
        c2 = color(100, 0, 150, 45 * alphaMult);
        c3 = color(180, 50, 255, 85 * alphaMult);
        c4 = color(220, 150, 255, 130 * alphaMult);
        c5 = color(240, 200, 255, 200 * alphaMult);
    } else if (currentFireColor === 'blue') {
        c1 = color(0, 0, 50, 15 * alphaMult);
        c2 = color(0, 50, 180, 45 * alphaMult);
        c3 = color(50, 150, 255, 85 * alphaMult);
        c4 = color(150, 220, 255, 130 * alphaMult);
        c5 = color(200, 240, 255, 200 * alphaMult);
    } else if (currentFireColor === 'cyan') {
        c1 = color(0, 40, 40, 15 * alphaMult);
        c2 = color(0, 120, 150, 45 * alphaMult);
        c3 = color(0, 200, 255, 85 * alphaMult);
        c4 = color(150, 255, 255, 130 * alphaMult);
        c5 = color(220, 255, 255, 200 * alphaMult);
    } else {
        c1 = color(40, 0, 0, 15 * alphaMult);
        c2 = color(180, 0, 0, 45 * alphaMult);
        c3 = color(255, 65, 0, 85 * alphaMult);
        c4 = color(255, 155, 0, 130 * alphaMult);
        c5 = color(255, 220, 0, 200 * alphaMult);
    }
    drawLayer(targetW * 1.8, targetH * 1.1, c1);
    drawLayer(targetW * 1.4, targetH * 1.0, c2);
    drawLayer(targetW * 1.0, targetH * 0.9, c3);
    drawLayer(targetW * 0.7, targetH * 0.7, c4);
    drawLayer(targetW * 0.4, targetH * 0.5, c5);
    if (burstTimer > 0) burstTimer--;
}

function drawLayer(w, h, col) {
    fill(col); noStroke();
    beginShape();
    vertex(-w * 0.5, 5); 
    for (let x = -w * 0.5; x <= w * 0.5; x += w * 0.05) {
        let index = floor(map(x, -w*0.5, w*0.5, -150, 150));
        let n = flames[index] || 1; 
        let shapeK = 1 - pow(abs(x) / (w * 0.5), 2.2); 
        let y = -h * n * (shapeK * 1.2 + 0.1); 
        vertex(x + sin(frameCount * 0.15 + x * 0.1) * (w * 0.04), y);
    }
    vertex(w * 0.5, 5);
    bezierVertex(w * 0.3, 15, -w * 0.3, 15, -w * 0.5, 5);
    endShape(CLOSE);
}

function updateParticles(fPerc) {
    let smokeChance = isExtinguished ? 0.3 : map(fPerc, 0, 100, 0.1, 0.6);
    if (random(1) < smokeChance) {
        let sY = campY - (isExtinguished ? 20 : map(fPerc, 0, 100, 20, 200) * 0.7);
        smokes.push(new Smoke(width/2 + random(-20,20), sY));
    }
    let sparkChance = burstTimer > 0 ? 0.8 : 0.1;
    if (random(1) < sparkChance && !isExtinguished && fPerc > 10) {
        sparks.push(new Spark(width/2 + random(-15,15), campY - 50));
    }
    for (let i = smokes.length-1; i>=0; i--) {
        smokes[i].update(); smokes[i].display();
        if (smokes[i].isDead()) smokes.splice(i, 1);
    }
    for (let i = sparks.length-1; i>=0; i--) {
        sparks[i].update(); sparks[i].display();
        if (sparks[i].isDead()) sparks.splice(i, 1);
    }
}

class Smoke {
    constructor(x, y) {
        this.pos = createVector(x, y);
        this.vel = createVector(random(-0.2, 0.2), random(-0.5, -1.2));
        this.life = 255;
        this.sz = random(40, 70);
        this.drift = random(0.01, 0.05);
    }
    update() {
        this.pos.add(this.vel);
        this.life -= 0.5;
        this.sz += 0.05;
        this.pos.x += sin(frameCount * this.drift + this.pos.y * 0.01) * 0.4;
    }
    display() {
        noStroke();
        fill(isExtinguished ? 60 : 90, map(this.life, 0, 255, 0, 30));
        ellipse(this.pos.x, this.pos.y, this.sz * fireScale);
    }
    isDead() { return this.life < 0; }
}

class Spark {
    constructor(x, y) {
        this.pos = createVector(x, y);
        this.vel = createVector(random(-1.2, 1.2), random(-3, -7));
        this.life = 255;
    }
    update() { this.pos.add(this.vel); this.life -= 4; }
    display() {
        noStroke();
        fill(255, 230, 100, this.life);
        ellipse(this.pos.x, this.pos.y, random(1.5, 3) * fireScale);
    }
    isDead() { return this.life < 0; }
}

class FloatingIcon {
    constructor(x, y, img) {
        this.pos = createVector(x, y);
        this.vel = createVector(0, -1.5);
        this.life = 255;
        this.img = img;
        this.size = 60;
    }
    update() {
        this.pos.add(this.vel);
        this.life -= 4;
    }
    display() {
        push();
        imageMode(CENTER);
        tint(255, this.life);
        image(this.img, this.pos.x, this.pos.y, this.size, this.size);
        pop();
    }
    isDead() { return this.life < 0; }
}

function initStones() {
    stones = [];
    for (let i = 0; i < 14; i++) {
        let angle = map(i, 0, 14, 0, TWO_PI);
        stones.push({ angle, x: cos(angle) * 110, y: sin(angle) * 38, w: random(65, 85), h: random(40, 55), color: random(80, 110) });
    }
}

function drawStoneHalf(isBack) {
    for (let s of stones) {
        if (isBack === (s.angle > PI && s.angle < TWO_PI)) {
            push(); translate(s.x, s.y);
            stroke(20); strokeWeight(2.5);
            fill(isExtinguished ? s.color * 0.5 : s.color);
            beginShape();
            let rx = s.w/2, ry = s.h/2;
            vertex(-rx, ry * 0.4); bezierVertex(-rx, -ry, rx, -ry, rx, ry * 0.4);
            vertex(rx * 0.9, ry); vertex(-rx * 0.9, ry);
            endShape(CLOSE);
            pop();
        }
    }
}

function windowResized() {
    resizeCanvas(windowWidth, windowHeight);
    calculateLayout();
}