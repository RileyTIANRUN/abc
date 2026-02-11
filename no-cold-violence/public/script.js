// let socket = io();
// socket connection that works locally and on the server:
if(location.hostname.toLowerCase().startsWith('browsercircus') || location.hostname.toLowerCase().startsWith('www')){
  socket = io({path: "/riley/port-4300/socket.io"});  // e.g. '/riley/port-4300/socket.io' or '/socket.io'
}else{
  socket = io(); 
}
const usernameInput = document.getElementById("usernameInput");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const chatBox = document.getElementById("chatBox");
const statusBar = document.getElementById("statusBar");

let myName = "";
let others = {}; 
// others[name] = { lastUpdate, mode }

usernameInput.addEventListener("input", () => {
  myName = usernameInput.value.trim();
});

sendBtn.addEventListener("click", sendMessage);

messageInput.addEventListener("input", () => {
  if (!myName) return;

  if (messageInput.value.length > 0) {
    socket.emit("presence", {
      sender: myName,
      type: "typing",
      time: Date.now()
    });
  }
});

function sendMessage() {
  if (!myName || !messageInput.value) return;

  socket.emit("messageFromClient", {
    sender: myName,
    message: messageInput.value
  });

  messageInput.value = "";
}

socket.on("messageFromServer", (data) => {
  const div = document.createElement("div");
  div.classList.add("message");

  if (data.sender === myName) {
    div.classList.add("me");
  } else {
    div.classList.add("other");
    resetStatus(data.sender);
  }

  div.innerText = `${data.sender}: ${data.message}`;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
});

socket.on("presenceFromServer", (data) => {
  if (data.sender === myName) return;

  others[data.sender] = {
    lastUpdate: Date.now(),
    mode: "typing"
  };
});

function resetStatus(name) {
  others[name] = {
    lastUpdate: Date.now(),
    mode: "sent"
  };
}

function renderStatus() {
  statusBar.innerHTML = "";
  const now = Date.now();

  let hasColdViolence = false;

  Object.keys(others).forEach(name => {
    const elapsed = (now - others[name].lastUpdate) / 1000;
    let text = "";
    let breathing = false;

    if (others[name].mode === "typing") {
      if (elapsed > 10) {
        text = "is hesitating…";
        breathing = true;
      } else {
        text = "is typing…";
      }
    } else {
      if (elapsed > 10) {
        text = "is giving you the silent treatment";
        hasColdViolence = true;
      } else {
        text = "has not seen your message yet";
      }
    }

    const div = document.createElement("div");
    div.className = "status-item";
    if (breathing) div.classList.add("breathing");
    div.innerText = `${name} ${text}`;
    statusBar.appendChild(div);
  });

  document.body.classList.toggle("cold-violence", hasColdViolence);
}


setInterval(renderStatus, 1000);
