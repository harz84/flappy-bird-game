const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// Variabel permainan
let bird = {
    x: 50,
    y: 150,
    width: 60,
    height: 40,
    gravity: 0.15, // Mengurangi gravitasi agar burung tidak terlalu cepat jatuh
    lift: -5,      // Menyesuaikan lompatan agar lebih terkendali
    velocity: 0
};

let pipes = [];
let frameCount = 0;
let score = 0;
let gameOver = false;
let audioInitialized = false;
let gameStarted = false; // Tambahkan flag untuk memulai game

// Variabel untuk kesulitan
let pipeSpeed = 1.5;
let pipeSpawnInterval = 150;
let pipeGap = 200;

// Audio effects
const audioStart = new Audio('start.wav');
const audioJump = new Audio('jump.wav');
const audioScore = new Audio('score.wav');
const audioGameOver = new Audio('gameover.wav');
const audioSuccess = new Audio('success.mp3');

// Pramuat audio
[audioStart, audioJump, audioScore, audioGameOver, audioSuccess].forEach(audio => {
    audio.preload = 'auto';
    audio.load();
});

// Variabel kontrol untuk status audio dan antrian lompat
let isStartPlaying = false;
let jumpQueue = false;

// Fungsi untuk memainkan suara dengan penanganan error
function playSound(audio) {
    if (!audioInitialized) {
        audioInitialized = true;
        console.log("Audio initialized by user interaction");
    }
    audio.play().catch(error => {
        console.log("Error playing audio: ", error);
    });
}

// Event listener untuk mendeteksi akhir suara start
audioStart.onended = () => {
    isStartPlaying = false;
    if (jumpQueue) {
        playSound(audioJump);
        jumpQueue = false;
    }
};

// Fungsi untuk menangani lompatan
function handleJump() {
    if (!gameStarted || gameOver) {
        gameStarted = true;
        gameOver = false;
        resetGameState(); // Reset posisi dan variabel saat start/restart
        playSound(audioStart);
    } else if (!gameOver) {
        bird.velocity = bird.lift;
        if (isStartPlaying) {
            jumpQueue = true;
        } else {
            playSound(audioJump);
        }
    }
}

// Kontrol keyboard (opsional untuk desktop)
document.addEventListener("keydown", function(event) {
    if ((event.key === " " || event.shiftKey) && !gameOver && gameStarted) {
        handleJump();
    }
});

// Kontrol sentuh untuk HP
canvas.addEventListener("touchstart", function(event) {
    event.preventDefault();
    handleJump();
}, { passive: false });

// Muat gambar burung
const birdImage = new Image();
birdImage.src = 'burung.png';

// Fungsi untuk menggambar burung
function drawBird() {
    if (birdImage.complete && birdImage.naturalWidth !== 0) {
        ctx.drawImage(birdImage, bird.x, bird.y, bird.width, bird.height);
    } else {
        ctx.fillStyle = "#FFFF00";
        ctx.fillRect(bird.x, bird.y, bird.width, bird.height);
    }
}

// Fungsi untuk menggambar pola bata
function drawBrickPattern(x, y, width, height) {
    const brickWidth = 25;
    const brickHeight = 15;
    const brickColor = ctx.createLinearGradient(x, y, x + width, y);
    brickColor.addColorStop(0, '#FF6347');
    brickColor.addColorStop(1, '#FA8072');
    ctx.fillStyle = brickColor;
    for (let row = 0; row < Math.ceil(height / brickHeight); row++) {
        for (let col = 0; col < Math.ceil(width / brickWidth); col++) {
            const brickX = x + col * brickWidth + (row % 2 === 0 ? 0 : brickWidth / 2);
            const brickY = y + row * brickHeight;
            ctx.fillRect(brickX, brickY, brickWidth - 2, brickHeight - 2);
            ctx.strokeStyle = '#808080';
            ctx.lineWidth = 2;
            ctx.strokeRect(brickX, brickY, brickWidth - 2, brickHeight - 2);
        }
    }
}

// Fungsi untuk menggambar pola bambu
function drawBambooPattern(x, y, width, height) {
    const bambooColor = ctx.createLinearGradient(x, y, x + width, y);
    bambooColor.addColorStop(0, '#228B22');
    bambooColor.addColorStop(1, '#2E8B57');
    ctx.fillStyle = bambooColor;
    ctx.fillRect(x, y, width, height);
    const segmentHeight = 100;
    ctx.strokeStyle = '#8B4513';
    ctx.lineWidth = 3;
    for (let i = 0; i < Math.ceil(height / segmentHeight); i++) {
        const segmentY = y + i * segmentHeight;
        if (segmentY < y + height) {
            ctx.beginPath();
            ctx.moveTo(x, segmentY);
            ctx.lineTo(x + width, segmentY);
            ctx.stroke();
            const side = i % 2 === 0 ? 'left' : 'right';
            const stemX = side === 'left' ? x : x + width;
            const stemEndX = side === 'left' ? x - 20 : x + width + 20;
            const stemY = segmentY + 10;
            ctx.beginPath();
            ctx.strokeStyle = '#8B4513';
            ctx.lineWidth = 1;
            ctx.moveTo(stemX, stemY);
            ctx.lineTo(stemEndX, stemY - 10);
            ctx.stroke();
            ctx.fillStyle = '#32CD32';
            ctx.beginPath();
            ctx.ellipse(stemEndX, stemY - 10, 8, 3, side === 'left' ? Math.PI / 4 : -Math.PI / 4, 0, 2 * Math.PI);
            ctx.fill();
        }
    }
}

// Fungsi untuk menggambar pola kayu
function drawWoodPattern(x, y, width, height) {
    const woodColor = ctx.createLinearGradient(x, y, x + width, y);
    woodColor.addColorStop(0, '#8B4513');
    woodColor.addColorStop(1, '#D2B48C');
    ctx.fillStyle = woodColor;
    ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = '#A0522D';
    ctx.lineWidth = 1;
    for (let i = 0; i < height; i += 10) {
        ctx.beginPath();
        ctx.moveTo(x, y + i);
        ctx.lineTo(x + width, y + i);
        ctx.stroke();
    }
    for (let i = 0; i < width; i += 15) {
        ctx.beginPath();
        ctx.moveTo(x + i, y);
        ctx.lineTo(x + i, y + height);
        ctx.stroke();
    }
}

// Fungsi untuk menggambar pola batu
function drawStonePattern(x, y, width, height) {
    const stoneColors = ['#D2B48C', '#F5F5DC', '#A9A9A9'];
    ctx.fillStyle = stoneColors[Math.floor(Math.random() * stoneColors.length)];
    ctx.fillRect(x, y, width, height);
    const stoneCount = 5; // Mengurangi jumlah batu untuk performa HP
    for (let i = 0; i < stoneCount; i++) {
        const stoneX = x + Math.random() * width;
        const stoneY = y + Math.random() * height;
        const stoneWidth = 20 + Math.random() * 20;
        const stoneHeight = 15 + Math.random() * 15;
        ctx.fillStyle = stoneColors[Math.floor(Math.random() * stoneColors.length)];
        ctx.beginPath();
        ctx.ellipse(stoneX, stoneY, stoneWidth / 2, stoneHeight / 2, 0, 0, 2 * Math.PI);
        ctx.fill();
        ctx.strokeStyle = '#696969';
        ctx.lineWidth = 1;
        ctx.stroke();
    }
}

// Fungsi untuk menentukan warna dan pola pipa
function getPipeColors() {
    if (score < 10) return { body: ['#FF6347', '#FA8072'], edge: ['#FF6347', '#FA8072'], pattern: 'brick' };
    else if (score < 20) return { body: ['#228B22', '#2E8B57'], edge: ['#228B22', '#2E8B57'], pattern: 'bamboo' };
    else if (score < 30) return { body: ['#8B4513', '#D2B48C'], edge: ['#8B4513', '#D2B48C'], pattern: 'wood' };
    else return { body: ['#D2B48C', '#F5F5DC'], edge: ['#A9A9A9', '#696969'], pattern: 'stone' };
}

// Fungsi untuk menyesuaikan kesulitan
function adjustDifficulty() {
    if (score === 10) {
        pipeSpeed *= 1.15;
        pipeSpawnInterval = Math.round(pipeSpawnInterval * 0.85);
        pipeGap = Math.round(pipeGap * 0.85);
        playSound(audioSuccess);
    } else if (score === 20) {
        pipeSpeed *= 1.15;
        pipeSpawnInterval = Math.round(pipeSpawnInterval * 0.85);
        pipeGap = Math.round(pipeGap * 0.85);
        playSound(audioSuccess);
    } else if (score === 30) {
        pipeSpeed *= 1.15;
        pipeSpawnInterval = Math.round(pipeSpawnInterval * 0.85);
        pipeGap = Math.round(pipeGap * 0.85);
        playSound(audioSuccess);
    }
}

// Fungsi untuk menggambar pipa
function drawPipes() {
    if (frameCount % pipeSpawnInterval === 0) {
        let pipeHeight = Math.floor(Math.random() * (canvas.height - pipeGap)) + 50;
        pipes.push({ x: canvas.width, top: pipeHeight, bottom: canvas.height - pipeHeight - pipeGap, scored: false });
    }
    for (let i = pipes.length - 1; i >= 0; i--) {
        pipes[i].x -= pipeSpeed;
        const colors = getPipeColors();
        if (colors.pattern === 'brick') {
            drawBrickPattern(pipes[i].x, 0, 50, pipes[i].top - 15);
            drawBrickPattern(pipes[i].x, pipes[i].top - 15, 50, 15);
        } else if (colors.pattern === 'bamboo') {
            drawBambooPattern(pipes[i].x, 0, 50, pipes[i].top - 15);
            drawBambooPattern(pipes[i].x, pipes[i].top - 15, 50, 15);
        } else if (colors.pattern === 'wood') {
            drawWoodPattern(pipes[i].x, 0, 50, pipes[i].top - 15);
            drawWoodPattern(pipes[i].x, pipes[i].top - 15, 50, 15);
        } else if (colors.pattern === 'stone') {
            drawStonePattern(pipes[i].x, 0, 50, pipes[i].top - 15);
            drawStonePattern(pipes[i].x, pipes[i].top - 15, 50, 15);
        }
        if (colors.pattern === 'brick') {
            drawBrickPattern(pipes[i].x, canvas.height - pipes[i].bottom + 15, 50, pipes[i].bottom - 15);
            drawBrickPattern(pipes[i].x, canvas.height - pipes[i].bottom, 50, 15);
        } else if (colors.pattern === 'bamboo') {
            drawBambooPattern(pipes[i].x, canvas.height - pipes[i].bottom + 15, 50, pipes[i].bottom - 15);
            drawBambooPattern(pipes[i].x, canvas.height - pipes[i].bottom, 50, 15);
        } else if (colors.pattern === 'wood') {
            drawWoodPattern(pipes[i].x, canvas.height - pipes[i].bottom + 15, 50, pipes[i].bottom - 15);
            drawWoodPattern(pipes[i].x, canvas.height - pipes[i].bottom, 50, 15);
        } else if (colors.pattern === 'stone') {
            drawStonePattern(pipes[i].x, canvas.height - pipes[i].bottom + 15, 50, pipes[i].bottom - 15);
            drawStonePattern(pipes[i].x, canvas.height - pipes[i].bottom, 50, 15);
        }
        if (bird.x + bird.width > pipes[i].x && bird.x < pipes[i].x + 50 &&
            ((bird.y + bird.height > pipes[i].top && bird.y < pipes[i].top) ||
             (bird.y < canvas.height - pipes[i].bottom && bird.y + bird.height > canvas.height - pipes[i].bottom))) {
            gameOver = true;
            playSound(audioGameOver);
        }
        if (pipes[i].x + 50 < bird.x && !pipes[i].scored) {
            score++;
            pipes[i].scored = true;
            playSound(audioScore);
            adjustDifficulty();
        }
        if (pipes[i].x < -50) pipes.splice(i, 1);
    }
}

// Fungsi untuk menggambar skor
function drawScore() {
    ctx.fillStyle = "#000000";
    ctx.font = "30px Arial";
    ctx.fillText("Score: " + score, 10, 50);
}

// Fungsi untuk reset posisi dan variabel
function resetGameState() {
    bird.y = canvas.height / 2 - bird.height / 2;
    bird.velocity = 0;
    pipes = [];
    score = 0;
    pipeSpeed = 1.5;
    pipeSpawnInterval = 150;
    pipeGap = 200;
}

// Fungsi utama permainan
function update() {
    if (!gameStarted) {
        ctx.fillStyle = "#000000";
        ctx.font = "40px Arial";
        ctx.fillText("Tap to Start", canvas.width / 2 - 100, canvas.height / 2);
        return;
    }
    if (gameOver) {
        ctx.fillStyle = "#000000";
        ctx.font = "40px Arial";
        ctx.fillText("Game Over", canvas.width / 2 - 100, canvas.height / 2);
        ctx.font = "20px Arial";
        ctx.fillText("Tap to Restart", canvas.width / 2 - 80, canvas.height / 2 + 40);
        return;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    bird.velocity += bird.gravity;
    bird.y += bird.velocity;
    if (bird.y + bird.height > canvas.height) {
        bird.y = canvas.height - bird.height;
        bird.velocity = 0;
        gameOver = true;
        playSound(audioGameOver);
    }
    if (bird.y < 0) {
        bird.y = 0;
        bird.velocity = 0;
    }
    drawBird();
    drawPipes();
    drawScore();
    frameCount++;
    requestAnimationFrame(update);
}

// Mulai game setelah gambar dimuat
birdImage.onload = function() {
    console.log("Gambar burung dimuat dengan sukses!");
    canvas.width = window.innerWidth; // Sesuaikan dengan lebar layar
    canvas.height = window.innerHeight; // Sesuaikan dengan tinggi layar
    update();
};

birdImage.onerror = function() {
    console.error("Gagal memuat gambar burung! Periksa path file 'burung.png'.");
    birdImage.src = '';
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    update();
};