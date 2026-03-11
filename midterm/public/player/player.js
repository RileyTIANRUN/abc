const socket = io()

let myRole = ""
let mySelected = ""
let currentStage = "waiting"

let firstPlayer = ""

let timer = null

let selectedAction = ""
let actionLocked = false

/* ================= JOIN ================= */

socket.emit("joinGame")

socket.on("startGame", (data) => {

    myRole = data.role
    firstPlayer = data.firstPlayer

    document.getElementById("role").innerText = "You are " + myRole

    updateTurn()

    document.getElementById("score").innerText =
        "P1 Score: " + data.p1Score + " | P2 Score: " + data.p2Score

    document.getElementById("selectArea").style.display = "block"

    document.getElementById("stage").innerText = "Stage: Select Your Hand"

    document.getElementById("confirmBtn").style.display = "inline-block"

    startTimer()

})

/* ================= 核心状态同步 (修复 Bug 的关键) ================= */

socket.on("gameState", (data) => {

    currentStage = data.stage
    firstPlayer = data.firstPlayer

    // 彻底修复：
    // 后端 p1Change = 任何身份的先手在修改
    // 后端 p2Change = 任何身份的后手在修改
    const isMyChangeStage = (data.stage === "p1Change" && myRole === firstPlayer) || 
                            (data.stage === "p2Change" && myRole !== firstPlayer);

    if (isMyChangeStage) {

        document.getElementById("selectArea").style.display = "block"

        document.getElementById("confirmBtn").style.display = "inline-block"
        
        document.getElementById("stage").innerText = "Stage: Action Success! Change hand?"

    } else {
        
        // 如果不是我的修改阶段，且当前不在初始选择阶段，则强制隐藏选择区
        // 这解决了“修改权错位”导致的无限循环
        if (currentStage !== "select") {
            document.getElementById("selectArea").style.display = "none"
        }
        
    }

})

socket.on("observer",()=>{

    window.location.href="/observer.html"

})

/* ================= SELECT ================= */

function selectChoice(choice){

    mySelected = choice

    document
        .querySelectorAll("#selectArea button")
        .forEach(b=>b.classList.remove("active"))

    // 使用 event.currentTarget 确保样式应用准确
    if(event && event.currentTarget) {
        event.currentTarget.classList.add("active")
    }

}

/* confirm 才真正提交选择 */

function confirmChoice() {

    if (!mySelected) {
        alert("Select your hand first")
        return
    }

    // 发送手势给服务器
    socket.emit("select", mySelected)

    // 发送确认信号推进阶段
    socket.emit("confirm")

    // 视觉反馈：变为黑底白字
    document.getElementById("confirmBtn").classList.add("active")

    setTimeout(() => {
        document.getElementById("confirmBtn").style.display = "none"
        document.getElementById("confirmBtn").classList.remove("active")
        
        // 确认后立即隐藏选择区，直到下一个允许修改的阶段
        document.getElementById("selectArea").style.display = "none"
    }, 200)
}

/* ================= TURN DISPLAY ================= */

function updateTurn(){

    const turnUI = document.getElementById("turnInfo")

    if(!turnUI) return

    if(myRole === firstPlayer){

        turnUI.innerText = "⭐ You are FIRST PLAYER"

    }else{

        turnUI.innerText = "🛡️ You are SECOND PLAYER"

    }

}

/* ================= FIRST PLAYER TURN (先手回合) ================= */

socket.on("p1Turn", () => {

    currentStage = "p1Turn"

    selectedAction = ""
    actionLocked = false

    clearActions()

    startTimer()

    // 只有当我的角色是服务器指定的 firstPlayer 时，才渲染操作按钮
    if (myRole === firstPlayer) {

        document.getElementById("stage").innerText = "Stage: Your Turn (First Player)"

        addActionButton("Peeping (+10/-10)", "peep")

        addActionButton("Double (+20/-10)", "p1Double")

        addConfirmButton()

    } else {

        document.getElementById("stage").innerText = "Stage: Waiting for First Player..."
        
        // 非当前操作者清空动作区，防止误触
        clearActions()

    }

})

socket.on("peekResult", (choice) => {

    alert("🔍 INFILTRATION: Opponent currently has " + choice.toUpperCase())

    document.getElementById("stage").innerText = "Action Result: Change hand or Confirm."

})

/* ================= SECOND PLAYER TURN (后手回合) ================= */

socket.on("p2Turn", () => {

    currentStage = "p2Turn"

    selectedAction = ""
    actionLocked = false

    clearActions()

    startTimer()

    // 只有当我的角色不是 firstPlayer 时，才渲染后手操作按钮
    if (myRole !== firstPlayer) {

        document.getElementById("stage").innerText = "Stage: Your Turn (Second Player)"

        addActionButton("Check Peeping (+10/-10)", "checkPeeping")

        addActionButton("Check Lose (+10/-10)", "checkLose")

        addActionButton("Double (+20/-10)", "p2Double")

        addConfirmButton()

    } else {

        document.getElementById("stage").innerText = "Stage: Waiting for Second Player..."
        
        // 非当前操作者清空动作区
        clearActions()

    }

})

socket.on("peepStatus", (status) => {

    alert(status ? "🚨 WARNING: Your hand was PEEPED!" : "✅ SAFE: No one peeped your hand.")

})

socket.on("loseStatus", (lose) => {

    alert(lose ? "📉 VULNERABLE: You are currently set to LOSE." : "🏆 SECURE: You are currently winning or draw.")

})

/* ================= NEGOTIATION (最终阶段) ================= */

socket.on("finalStage", () => {

    currentStage = "final"

    selectedAction = ""
    actionLocked = false

    document.getElementById("stage").innerText = "Stage: Negotiation"

    clearActions()

    startTimer()

    addActionButton("Propose Draw (+5/+5)", "proposeDraw")

    addActionButton("Reveal", "reveal")

    addConfirmButton()

})

/* ================= RESULT ================= */

socket.on("revealResult", (data) => {

    document.getElementById("score").innerText =
        "P1 Score: " + data.p1Score + " | P2 Score: " + data.p2Score

    alert(
        "P1: " + data.p1 +
        "\nP2: " + data.p2 +
        "\nWinner: " + data.winner
    )

    socket.emit("ackReveal")

})

/* ================= NEXT ROUND ================= */

socket.on("startNextRound",(data)=>{

    mySelected = ""
    selectedAction = ""
    actionLocked = false

    firstPlayer = data.firstPlayer

    updateTurn()

    document.getElementById("score").innerText =
        "P1 Score: " + data.p1Score + " | P2 Score: " + data.p2Score

    document.getElementById("stage").innerText = "Stage: Select Your Hand"

    document.getElementById("selectArea").style.display = "block"

    document.getElementById("confirmBtn").style.display = "inline-block"

    clearActions()

    startTimer()

})

/* ================= GAME OVER ================= */

socket.on("gameOverAsk",(data)=>{

    document.getElementById("stage").innerText = "Game Ended"

    clearActions()

    addActionButton("Continue Playing","continueGame")

    addConfirmButton()

})

/* ================= EMOJI ================= */

socket.on("emoji",(data)=>{

    const target = (data.role === "player1") ? "p1status" : "p2status"

    const el = document.getElementById(target)
    
    if(el) el.innerText = data.role + " : " + data.emoji

})

function sendEmoji(e){

    socket.emit("emoji",e)

}

/* ================= PLAYER LEFT ================= */

socket.on("playerLeft",()=>{

    alert("Opponent left the game. Room reset.")

    resetUI()

})

/* ================= TIMER ================= */

function startTimer(){

    let time = 20

    const timerUI = document.getElementById("countdown")

    if(!timerUI) return

    clearInterval(timer)

    timerUI.innerText = time

    timer = setInterval(()=>{

        time--

        timerUI.innerText = time

        if(time <= 0){

            clearInterval(timer)

        }

    },1000)

}

/* ================= UI HELPERS ================= */

function addActionButton(text, action){

    const btn = document.createElement("button")

    btn.innerText = text

    btn.onclick = (e)=>{

        if(actionLocked) return

        selectedAction = action

        document
            .querySelectorAll("#actionArea button")
            .forEach(b=>b.classList.remove("active"))

        e.currentTarget.classList.add("active")

    }

    document.getElementById("actionArea").appendChild(btn)

}

function addConfirmButton(){

    const btn = document.createElement("button")

    btn.innerText = "Confirm Action"

    btn.className = "confirm"

    btn.onclick = (e)=>{

        if(!selectedAction){

            alert("Select an action first")

            return

        }

        actionLocked = true

        // 触控反馈
        e.currentTarget.classList.add("active")

        socket.emit(selectedAction)

        setTimeout(() => {
            // 动作确认后清空该区域，防止在阶段切换过程中二次点击
            clearActions()
        }, 200)

    }

    document.getElementById("actionArea").appendChild(btn)

}

function clearActions() {

    const area = document.getElementById("actionArea")
    
    if(area) area.innerHTML = ""

}

function resetUI() {

    const stageEl = document.getElementById("stage")
    if(stageEl) stageEl.innerText = "Waiting..."

    const selectArea = document.getElementById("selectArea")
    if(selectArea) selectArea.style.display = "none"

    clearActions()

}