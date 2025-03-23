const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// Mobile scaling
function resizeCanvas() {
    const maxWidth = Math.min(480, window.innerWidth);
    const maxHeight = Math.min(640, window.innerHeight);
    
    const scale = Math.min(maxWidth / 480, maxHeight / 640);
    
    canvas.width = 480 * scale;
    canvas.height = 640 * scale;
    canvas.style.width = `${480 * scale}px`;
    canvas.style.height = `${640 * scale}px`;
    
    ctx.scale(scale, scale);
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Game variables
let bird = {
    x: 50,
    y: 150,
    width: 40,   // Diperkecil untuk mobile
    height: 30,  // Diperkecil untuk mobile
    gravity: 0.4, // Dipercepat untuk responsifitas mobile
    lift: -7,    // Lompat lebih kuat
    velocity: 0
};

let pipes = [];
let frameCount = 0;
let score = 0;
let gameOver = false;
let audioInitialized = false;

// Difficulty variables
let pipeSpeed = 1.5;
let pipeSpawnInterval = 150;
let pipeGap = 200;

// Audio effects (tetap sama)
const audioStart = new Audio('start.wav');
const audioJump = new Audio('jump.wav');
const audioScore = new Audio('score.wav');
const audioGameOver = new Audio('gameover.wav');
const audioSuccess = new Audio('success.mp3');

// Audio preload (tetap sama)
[audioStart, audioJump, audioScore, audioGameOver, audioSuccess].forEach(audio => {
    audio.preload = 'auto';
    audio.load();
});

// Mobile controls
document.getElementById('jumpBtn').addEventListener('touchstart', function(e) {
    e.preventDefault();
    if(!gameOver) handleJump();
});

document.getElementById('restartBtn').addEventListener('touchstart', function(e) {
    e.preventDefault();
    if(gameOver) resetGame();
});

// Fungsi-fungsi yang sama sampai drawBird()
const birdImage = new Image();
birdImage.src = 'burung.png'; // Tetap menggunakan burung.png

function drawBird() {
    if (birdImage.complete && birdImage.naturalWidth !== 0) {
        // Scaling posisi burung sesuai canvas mobile
        const scale = Math.min(
            Math.min(480, window.innerWidth) / 480,
            Math.min(640, window.innerHeight) / 640
        );
        ctx.drawImage(
            birdImage, 
            bird.x * scale, 
            bird.y * scale, 
            bird.width * scale, 
            bird.height * scale
        );
    } else {
        ctx.fillStyle = "#FFFF00";
        ctx.fillRect(bird.x, bird.y, bird.width, bird.height);
    }
}

// Fungsi drawBrickPattern sampai getPipeColors() tetap sama

// Modifikasi adjustDifficulty untuk mobile
function adjustDifficulty() {
    const baseSpeed = 1.5;
    const baseInterval = 150;
    const baseGap = 200;
    
    if(score < 10) {
        pipeSpeed = baseSpeed * (1 + score/20);
        pipeSpawnInterval = baseInterval * (1 - score/30);
        pipeGap = baseGap * (1 - score/40);
    } else {
        pipeSpeed = baseSpeed * 1.5;
        pipeSpawnInterval = baseInterval * 0.7;
        pipeGap = baseGap * 0.7;
    }
}

// Optimasi fungsi pipes
function drawPipes() {
    // Mobile performance optimization
    if(pipes.length > 4) pipes = pipes.slice(-4);
    
    if (frameCount % pipeSpawnInterval === 0) {
        let pipeHeight = Math.floor(Math.random() * (canvas.height - pipeGap)) + 50;
        pipes.push({
            x: canvas.width,
            top: pipeHeight,
            bottom: canvas.height - pipeHeight - pipeGap,
            scored: false
        });
    }
    
    // Sisanya sama tapi dengan skala mobile
    pipes.forEach((pipe, i) => {
        pipe.x -= pipeSpeed;
        //... (drawing logic tetap sama)
    });
}

// Mobile-optimized game loop
let lastTime = 0;
const fps = 60;
const interval = 1000/fps;

function update(timestamp) {
    if (!lastTime) lastTime = timestamp;
    const deltaTime = timestamp - lastTime;
    
    if (deltaTime > interval) {
        // Update game state
        if (!gameOver) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            bird.velocity += bird.gravity;
            bird.y += bird.velocity;
            
            // Collision detection
            if(bird.y + bird.height > canvas.height || bird.y < 0) {
                gameOver = true;
                playSound(audioGameOver);
            }
            
            drawBird();
            drawPipes();
            drawScore();
            
            frameCount++;
        }
        
        lastTime = timestamp - (deltaTime % interval);
    }
    
    requestAnimationFrame(update);
}

// Fungsi resetGame tetap sama
function resetGame() {
    bird.y = 150;
    bird.velocity = 0;
    pipes = [];
    score = 0;
    gameOver = false;
    pipeSpeed = 1.5;
    pipeSpawnInterval = 150;
    pipeGap = 200;
    resizeCanvas();
    playSound(audioStart);
}

// Sisanya tetap sama sampai akhir file

// Pastikan gambar tetap digunakan
birdImage.onload = function() {
    console.log("Gambar burung dimuat!");
    update();
};

birdImage.onerror = function() {
    console.error("Gagal memuat burung.png!");
    update();
};
