const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('.'));

const WIDTH = 600;
const HEIGHT = 600;
const cellSize = 20;
const movesPerSecond = 15;
const moveDelay = Math.round(1000 / movesPerSecond);

let players = { red: null, blue: null }; // socket ids
let socketsToColor = {}; // reverse mapping
let gameTickTimer = null;
let lastMove = Date.now();

let game = {
  bikes: {},
  pips: [],
  running: false,
  winner: null // 'red'|'blue'|'draw'|null
};

function resetGameState() {
  game.bikes = {
    red: {
      x: 100,
      y: 300,
      dir: 'right',
      color: 'red',
      trail: [],           // completely empty trail
      trailLength: 3       // starting length
    },
    blue: {
      x: 500,
      y: 300,
      dir: 'left',
      color: 'blue',
      trail: [],
      trailLength: 3
    }
  };

  game.pips = [];          // no leftover pips
  game.running = false;    // game hasn’t started
  game.winner = null;      // no winner yet

  spawnPip();              // put first pip in for the next match
}

function spawnPip() {
  const cellsX = WIDTH / cellSize;
  const cellsY = HEIGHT / cellSize;
  const x = Math.floor(Math.random() * cellsX) * cellSize;
  const y = Math.floor(Math.random() * cellsY) * cellSize;
  game.pips.push({ x, y });
}

function isCollidingBike(bike, bikes) {
  // wall collision
  if (bike.x < 0 || bike.x >= WIDTH || bike.y < 0 || bike.y >= HEIGHT) return true;

  // check trails: for own bike exclude last element (current head) so stepping into current head isn't considered
  for (let [key, other] of Object.entries(bikes)) {
    const trailToCheck = (other === bike) ? other.trail.slice(0, -1) : other.trail;
    for (let pos of trailToCheck) {
      if (pos.x === bike.x && pos.y === bike.y) return true;
    }
  }
  return false;
}

function performGameTick() {
  if (!game.running) return;

  // move bikes
  for (let color of ['red','blue']) {
    const b = game.bikes[color];
    if (!b) continue;
    if (b.dir === 'up') b.y -= cellSize;
    if (b.dir === 'down') b.y += cellSize;
    if (b.dir === 'left') b.x -= cellSize;
    if (b.dir === 'right') b.x += cellSize;

    b.trail.push({ x: b.x, y: b.y });
    if (b.trail.length > b.trailLength) b.trail.shift();
  }

  // pip collection (only red and blue heads)
  for (let i = game.pips.length - 1; i >= 0; i--) {
    const pip = game.pips[i];
    for (let color of ['red','blue']) {
      const b = game.bikes[color];
      if (b.x === pip.x && b.y === pip.y) {
        b.trailLength++;
        game.pips.splice(i, 1);
        spawnPip();
        break;
      }
    }
  }

  // collision checks
  const red = game.bikes.red;
  const blue = game.bikes.blue;
  const redCollision = isCollidingBike(red, game.bikes);
  const blueCollision = isCollidingBike(blue, game.bikes);

  // Both in same cell -> draw
  if (red.x === blue.x && red.y === blue.y) {
    game.running = false;
    game.winner = 'draw';
  } else if (redCollision && blueCollision) {
    // both collided (different cells) -> draw too
    game.running = false;
    game.winner = 'draw';
  } else if (redCollision) {
    game.running = false;
    game.winner = 'blue';
  } else if (blueCollision) {
    game.running = false;
    game.winner = 'red';
  }

  // broadcast full state
  io.emit('state', {
    bikes: game.bikes,
    pips: game.pips,
    running: game.running,
    winner: game.winner
  });
}

resetGameState();

// accept connections
io.on('connection', socket => {
  console.log('connect', socket.id);

  // assign a color if free
  let assigned = null;
  if (!players.red) {
    players.red = socket.id;
    assigned = 'red';
  } else if (!players.blue) {
    players.blue = socket.id;
    assigned = 'blue';
  } else {
    socket.emit('roomFull');
    return;
  }
  socketsToColor[socket.id] = assigned;

  socket.emit('assigned', assigned);
  // send current state immediately
  socket.emit('state', { bikes: game.bikes, pips: game.pips, running: game.running, winner: game.winner });

  // input: change direction
  socket.on('dir', dir => {
    const col = socketsToColor[socket.id];
    if (!col) return;
    // prevent reversing directly
    const current = game.bikes[col].dir;
    if ((current === 'up' && dir === 'down') ||
        (current === 'down' && dir === 'up') ||
        (current === 'left' && dir === 'right') ||
        (current === 'right' && dir === 'left')) {
      return;
    }
    game.bikes[col].dir = dir;
  });

  // start game (only if both players present)
  socket.on('start', () => {
    if (players.red && players.blue && !game.running) {
      resetGameState(); // clear trails and pips so both start fresh
      game.running = true;
      // broadcast start
      io.emit('state', { bikes: game.bikes, pips: game.pips, running: game.running, winner: game.winner });
    }
  });

  // restart to lobby
  socket.on('restart', () => {
    resetGameState();
    console.log('reset working')
    game.running = false;
    game.winner = null;
    io.emit('state', { 
        bikes: game.bikes, 
        pips: game.pips, 
        running: game.running, 
        winner: game.winner,
        lobby: true
    });
  });

  socket.on('disconnect', () => {
    console.log('disconnect', socket.id);
    const color = socketsToColor[socket.id];
    if (color) {
      players[color] = null;
      delete socketsToColor[socket.id];
      // stop game if running
      game.running = false;
      // notify clients player left
      io.emit('playerLeft', color);
      io.emit('state', { bikes: game.bikes, pips: game.pips, running: game.running, winner: game.winner });
    }
  });
});

// run server-side tick at moveDelay
setInterval(performGameTick, moveDelay);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('listening on', PORT));
