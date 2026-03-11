let socket;
if(location.hostname.toLowerCase().startsWith('browsercircus') || location.hostname.toLowerCase().startsWith('www')){
  socket = io({path: "/riley/port-4300/socket.io"});  // e.g. '/leon/port-4100/socket.io' or '/socket.io'
}else{
  socket = io(); 
}

const params = new URLSearchParams(window.location.search);
const roomId = params.get("room");

socket.emit("joinAsObserver", roomId);

socket.on("observerPeek", () => {
  document.getElementById("info").innerText =
    "First player peeked.";
});

socket.on("roundResult", result => {
  document.getElementById("info").innerText = result;
});