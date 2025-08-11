const socket = io();

// canvas + images
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

const introImg = new Image(); introImg.src = 'intro.png';
const redWin = new Image(); redWin.src = 'redwin.png';
const blueWin = new Image(); blueWin.src = 'bluewin.png';
const drawImg = new Image(); drawImg.src = 'draw.png';

const cellSize = 20;
let assignedColor = null;
let state = { bikes: {}, pips: [], running: false, winner: null };
let showIntro = true;

// receive color assignment
socket.on('assigned', color => {
  assignedColor = color;
  console.log('assigned', color);
});

// full state updates
socket.on('state', s => {
  state = s;
  if (state.lobby) {
    showIntro = true;
  } else if (state.running) {
    showIntro = false;
  }
});

// room full
socket.on('roomFull', () => {
  alert('Room full: only two players allowed.');
});

socket.on('goToLobby', () => {
  console.log('Received goToLobby');
  showIntro = true;
  state.running = false;
});

// player left => show intro
socket.on('playerLeft', () => {
  showIntro = true;
});

// Render helpers
function drawBoard() {
  // background
  ctx.fillStyle = 'rgba(8,2,50,1)';
  ctx.fillRect(0,0,canvas.width,canvas.height);

  // grid
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= canvas.width; x += cellSize) {
    ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,canvas.height); ctx.stroke();
  }
  for (let y = 0; y <= canvas.height; y += cellSize) {
    ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(canvas.width,y); ctx.stroke();
  }
}

function drawState() {
  drawBoard();

  // pips
  state.pips.forEach(p => {
    ctx.fillStyle = 'yellow';
    ctx.fillRect(p.x, p.y, cellSize, cellSize);
  });

  // bikes trails
  Object.values(state.bikes).forEach(b => {
    if (!b) return;
    ctx.fillStyle = b.color;
    b.trail.forEach(pos => ctx.fillRect(pos.x, pos.y, cellSize, cellSize));
  });
}

function drawIntro() {
  ctx.fillStyle = 'black';
  ctx.fillRect(0,0,canvas.width,canvas.height);
  if (introImg.complete) ctx.drawImage(introImg, 0, 0);
  ctx.font = '26px Impact';
  ctx.fillStyle = 'white';
  ctx.textAlign = 'center';
  ctx.fillText('Waiting for 2 players. Assigned: ' + (assignedColor || 'none'), canvas.width/2, 560);
  ctx.fillText('Press ENTER to start when both players connected', canvas.width/2, 584);
}

function drawWinnerScreen() {
  ctx.fillStyle = 'black';
  ctx.fillRect(0,0,canvas.width,canvas.height);

  if (state.winner === 'red') {
    if (redWin.complete) ctx.drawImage(redWin, 0,0);
  } else if (state.winner === 'blue') {
    if (blueWin.complete) ctx.drawImage(blueWin, 0,0);
  } else if (state.winner === 'draw') {
    if (drawImg.complete) ctx.drawImage(drawImg, 0,0);
  }

  ctx.font = '20px Impact';
  ctx.fillStyle = 'white';
  ctx.textAlign = 'center';
  ctx.fillText('Press P to restart (go back to lobby)', canvas.width/2, 520);
}

// main draw loop
function render() {
  if (showIntro && !state.running) {
    drawIntro();
  } else if (state.running) {
    drawState();
  } else if (state.winner) {
    drawWinnerScreen();
  } else {
    // default board
    drawBoard();
  }
  requestAnimationFrame(render);
}
requestAnimationFrame(render);

// input handling - send direction to server
document.addEventListener('keydown', e => {
  if (!assignedColor) return;

  // Player controls: red uses arrows, blue uses WASD
  if (assignedColor === 'red') {
    if (e.code === 'ArrowUp') socket.emit('dir', 'up');
    if (e.code === 'ArrowDown') socket.emit('dir', 'down');
    if (e.code === 'ArrowLeft') socket.emit('dir', 'left');
    if (e.code === 'ArrowRight') socket.emit('dir', 'right');
  } else {
    if (e.code === 'KeyW') socket.emit('dir', 'up');
    if (e.code === 'KeyS') socket.emit('dir', 'down');
    if (e.code === 'KeyA') socket.emit('dir', 'left');
    if (e.code === 'KeyD') socket.emit('dir', 'right');
  }

  // Start: Enter (any player) -> server will only start if both players connected
  if (e.code === 'Enter') {
    socket.emit('start');
  }

  // Restart/back to lobby: 'P' after a winner
  if (e.code === 'KeyP') {
    console.log('Key pressed:', e.key);
    socket.emit('restart');
  }
});
