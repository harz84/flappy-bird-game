const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// Deteksi perangkat mobile
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

// Variabel untuk offscreen rendering
const offscreenCanvas = document.createElement('canvas');
const offscreenCtx = offscreenCanvas.getContext('2d');
const pipePatterns = {
    brick: null,
    bamboo: null,
    wood: null,
    stone: null
};

// Fungsi untuk menyesuaikan canvas dengan ukuran layar
function resizeCanvas() {
    const container = canvas.parentElement || document.body;
    const containerWidth = container.clientWidth || window.innerWidth;
    canvas.width = containerWidth;
    canvas.height = Math.min(window.innerHeight * 0.8, containerWidth * 1.5);
    
    // Resize offscreen canvas juga
    offscreenCanvas.width = 50; // Lebar pipa
    offscreenCanvas.height = canvas.height;
    
    // Perbarui ukuran burung berdasarkan ukuran canvas
    bird.width = Math.max(30, canvas.width * 0.1);
    bird.height = Math.max(20, canvas.width * 0.07);
    
    // Reset posisi burung
    bird.x = canvas.width * 0.2;
    bird.y = canvas.height / 2;
    
    // Perbarui pola pipa
    createPipePatterns();
}

// Variabel permainan
let bird = {
    x: 50,
    y: 150,
    width: 60,
    height: 40,
    gravity: isMobile ? 0.25 : 0.3,
    lift: isMobile ? -5 : -6,
    velocity: 0
};

let pipes = [];
let frameCount = 0;
let score = 0;
let gameOver = false;
let isPaused = false;
let audioInitialized = false;
let lastJumpTime = 0;
const MIN_JUMP_INTERVAL = isMobile ? 300 : 200; // ms

// Variabel untuk kesulitan
let pipeSpeed = 1.5; // Kecepatan awal pipa (Level 1)
let pipeSpawnInterval = isMobile ? 180 : 150; // Jarak antar pipa (Level 1)
let pipeGap = isMobile ? 220 : 200; // Celah antar pipa (Level 1)

// Audio effects
const audioStart = new Audio('start.wav');
const audioJump = new Audio('jump.wav');
const audioScore = new Audio('score.wav');
const audioGameOver = new Audio('gameover.wav');
const audioSuccess = new Audio('success.mp3');

// Variabel kontrol untuk status audio dan antrian lompat
let isStartPlaying = false;
let jumpQueue = false;

// Fungsi untuk memuat audio secara lazy
function initAudio() {
    if (!audioInitialized) {
        const audioFiles = [
            { element: audioStart, src: 'start.wav' },
            { element: audioJump, src: 'jump.wav' },
            { element: audioScore, src: 'score.wav' },
            { element: audioGameOver, src: 'gameover.wav' },
            { element: audioSuccess, src: 'success.mp3' }
        ];
        
        let loadedCount = 0;
        audioFiles.forEach(audio => {
            audio.element.preload = 'auto';
            audio.element.src = audio.src;
            audio.element.onloadeddata = () => {
                loadedCount++;
                if (loadedCount === audioFiles.length) {
                    audioInitialized = true;
                    console.log("All audio loaded successfully");
                }
            };
            audio.element.load();
        });
    }
}

// Fungsi untuk memainkan suara dengan penanganan error
function playSound(audio) {
    if (!audioInitialized) {
        audioInitialized = true;
        initAudio();
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
        playSound(audioJump); // Putar jump yang tertunda
        jumpQueue = false;    // Kosongkan antrian
    }
};

// Fungsi untuk menangani lompatan
function handleJump() {
    const now = Date.now();
    // Cegah spam tap
    if (now - lastJumpTime < MIN_JUMP_INTERVAL) return;
    
    lastJumpTime = now;
    bird.velocity = bird.lift;
    
    if (isStartPlaying) {
        jumpQueue = true;
    } else {
        playSound(audioJump);
    }
}

// Kontrol keyboard
document.addEventListener("keydown", function(event) {
    if ((event.key === " " || event.shiftKey) && !gameOver && !isPaused) {
        handleJump();
        if (!audioInitialized) {
            initAudio();
            playSound(audioStart);
        }
    }
    if (event.key.toLowerCase() === "r" && gameOver) {
        resetGame();
    }
    if (event.key.toLowerCase() === "p") {
        togglePause();
    }
});

// Kontrol sentuh untuk perangkat mobile
canvas.addEventListener("touchstart", function(event) {
    event.preventDefault(); // Mencegah scroll atau zoom saat disentuh
    if (!gameOver && !isPaused) {
        handleJump();
        if (!audioInitialized) {
            initAudio();
            playSound(audioStart);
        }
    } else if (gameOver) {
        resetGame();
    }
}, { passive: false });

// Mencegah scroll saat bermain di mobile
document.body.addEventListener('touchmove', function(event) {
    if (!gameOver && !isPaused) event.preventDefault();
}, { passive: false });

// Toggle pause
function togglePause() {
    isPaused = !isPaused;
    if (pauseBtn) {
        pauseBtn.textContent = isPaused ? "▶️" : "⏸️";
    }
}

// Tambah tombol pause
let pauseBtn;
function addPauseButton() {
    pauseBtn = document.createElement('button');
    pauseBtn.textContent = "⏸️";
    pauseBtn.style.position = "absolute";
    pauseBtn.style.top = "10px";
    pauseBtn.style.right = "10px";
    pauseBtn.style.zIndex = "100";
    pauseBtn.style.fontSize = "24px";
    pauseBtn.style.backgroundColor = "rgba(255,255,255,0.7)";
    pauseBtn.style.border = "none";
    pauseBtn.style.borderRadius = "50%";
    pauseBtn.style.width = "40px";
    pauseBtn.style.height = "40px";
    pauseBtn.style.padding = "0";
    pauseBtn.style.cursor = "pointer";
    
    pauseBtn.addEventListener('click', togglePause);
    
    const container = canvas.parentElement || document.body;
    container.style.position = "relative";
    container.appendChild(pauseBtn);
}

// Muat gambar burung
const birdImage = new Image();
birdImage.src = 'burung.png';

// Fungsi untuk menggambar burung dari gambar
function drawBird() {
    if (birdImage.complete && birdImage.naturalWidth !== 0) {
        ctx.drawImage(birdImage, bird.x, bird.y, bird.width, bird.height);
    } else {
        ctx.fillStyle = "#FFFF00"; // Warna kuning sebagai placeholder jika gambar gagal
        ctx.fillRect(bird.x, bird.y, bird.width, bird.height);
    }
}

// Fungsi untuk pre-render pola pipa
function createPipePatterns() {
    for (let pattern in pipePatterns) {
        const patternCanvas = document.createElement('canvas');
        patternCanvas.width = 50;
        patternCanvas.height = canvas.height;
        const patternCtx = patternCanvas.getContext('2d');
        
        if (pattern === 'brick') {
            drawBrickPattern(0, 0, 50, canvas.height, patternCtx);
        } else if (pattern === 'bamboo') {
            drawBambooPattern(0, 0, 50, canvas.height, patternCtx);
        } else if (pattern === 'wood') {
            drawWoodPattern(0, 0, 50, canvas.height, patternCtx);
        } else if (pattern === 'stone') {
            drawStonePattern(0, 0, 50, canvas.height, patternCtx);
        }
        
        pipePatterns[pattern] = patternCanvas;
    }
}

// Fungsi untuk menggambar pola bata
function drawBrickPattern(x, y, width, height, context = ctx) {
    const brickWidth = 25;
    const brickHeight = 15;
    const brickColor = context.createLinearGradient(x, y, x + width, y);
    brickColor.addColorStop(0, '#FF6347');
    brickColor.addColorStop(1, '#FA8072');
    context.fillStyle = brickColor;

    for (let row = 0; row < Math.ceil(height / brickHeight); row++) {
        for (let col = 0; col < Math.ceil(width / brickWidth); col++) {
            const brickX = x + col * brickWidth + (row % 2 === 0 ? 0 : brickWidth / 2);
            const brickY = y + row * brickHeight;
            context.fillRect(brickX, brickY, brickWidth - 2, brickHeight - 2);
            context.strokeStyle = '#808080';
            context.lineWidth = 2;
            context.strokeRect(brickX, brickY, brickWidth - 2, brickHeight - 2);
        }
    }
}

// Fungsi untuk menggambar pola bambu
function drawBambooPattern(x, y, width, height, context = ctx) {
    const bambooColor = context.createLinearGradient(x, y, x + width, y);
    bambooColor.addColorStop(0, '#228B22');
    bambooColor.addColorStop(1, '#2E8B57');
    context.fillStyle = bambooColor;
    context.fillRect(x, y, width, height);

    const segmentHeight = 100;
    context.strokeStyle = '#8B4513';
    context.lineWidth = 3;

    for (let i = 0; i < Math.ceil(height / segmentHeight); i++) {
        const segmentY = y + i * segmentHeight;
        if (segmentY < y + height) {
            context.beginPath();
            context.moveTo(x, segmentY);
            context.lineTo(x + width, segmentY);
            context.stroke();

            const side = i % 2 === 0 ? 'left' : 'right';
            const stemX = side === 'left' ? x : x + width;
            const stemEndX = side === 'left' ? x - 20 : x + width + 20;
            const stemY = segmentY + 10;

            context.beginPath();
            context.strokeStyle = '#8B4513';
            context.lineWidth = 1;
            context.moveTo(stemX, stemY);
            context.lineTo(stemEndX, stemY - 10);
            context.stroke();

            context.fillStyle = '#32CD32';
            context.beginPath();
            context.ellipse(stemEndX, stemY - 10, 8, 3, side === 'left' ? Math.PI / 4 : -Math.PI / 4, 0, 2 * Math.PI);
            context.fill();
        }
    }
}

// Fungsi untuk menggambar pola kayu
function drawWoodPattern(x, y, width, height, context = ctx) {
    const woodColor = context.createLinearGradient(x, y, x + width, y);
    woodColor.addColorStop(0, '#8B4513');
    woodColor.addColorStop(1, '#D2B48C');
    context.fillStyle = woodColor;
    context.fillRect(x, y, width, height);

    context.strokeStyle = '#A0522D';
    context.lineWidth = 1;

    for (let i = 0; i < height; i += 10) {
        context.beginPath();
        context.moveTo(x, y + i);
        context.lineTo(x + width, y + i);
        context.stroke();
    }

    for (let i = 0; i < width; i += 15) {
        context.beginPath();
        context.moveTo(x + i, y);
        context.lineTo(x + i, y + height);
        context.stroke();
    }
}

// Fungsi untuk menggambar pola batu
function drawStonePattern(x, y, width, height, context = ctx) {
    const stoneColors = ['#D2B48C', '#F5F5DC', '#A9A9A9'];
    context.fillStyle = stoneColors[Math.floor(Math.random() * stoneColors.length)];
    context.fillRect(x, y, width, height);

    const stoneCount = 10;
    for (let i = 0; i < stoneCount; i++) {
        const stoneX = x + Math.random() * width;
        const stoneY = y + Math.random() * height;
        const stoneWidth = 20 + Math.random() * 30;
        const stoneHeight = 15 + Math.random() * 20;
        context.fillStyle = stoneColors[Math.floor(Math.random() * stoneColors.length)];
        context.beginPath();
        context.ellipse(stoneX, stoneY, stoneWidth / 2, stoneHeight / 2, 0, 0, 2 * Math.PI);
        context.fill();
        context.strokeStyle = '#696969';
        context.lineWidth = 1;
        context.stroke();
    }
}

// Fungsi untuk menentukan warna dan pola pipa berdasarkan skor
function getPipeColors() {
    if (score < 10) {
        return { body: ['#FF6347', '#FA8072'], edge: ['#FF6347', '#FA8072'], pattern: 'brick' };
    } else if (score < 20) {
        return { body: ['#228B22', '#2E8B57'], edge: ['#228B22', '#2E8B57'], pattern: 'bamboo' };
    } else if (score < 30) {
        return { body: ['#8B4513', '#D2B48C'], edge: ['#8B4513', '#D2B48C'], pattern: 'wood' };
    } else {
        return { body: ['#D2B48C', '#F5F5DC'], edge: ['#A9A9A9', '#696969'], pattern: 'stone' };
    }
}

// Fungsi untuk mendapatkan level saat ini
function getCurrentLevel() {
    if (score < 10) return 1;
    if (score < 20) return 2;
    if (score < 30) return 3;
    return 4;
}

// Fungsi untuk menyesuaikan kesulitan berdasarkan skor
function adjustDifficulty() {
    const difficultyFactor = isMobile ? 0.10 : 0.15; // Lebih toleran untuk mobile
    
    if (score === 10) {
        pipeSpeed = 1.5 * (1 + difficultyFactor);
        pipeSpawnInterval = Math.round(pipeSpawnInterval * (1 - difficultyFactor/2));
        pipeGap = Math.round(pipeGap * (1 - difficultyFactor/2));
        playSound(audioSuccess);
    } else if (score === 20) {
        pipeSpeed = 1.5 * (1 + difficultyFactor) * (1 + difficultyFactor);
        pipeSpawnInterval = Math.round(pipeSpawnInterval * (1 - difficultyFactor/2) * (1 - difficultyFactor/2));
        pipeGap = Math.round(pipeGap * (1 - difficultyFactor/2) * (1 - difficultyFactor/2));
        playSound(audioSuccess);
    } else if (score === 30) {
        pipeSpeed = 1.5 * (1 + difficultyFactor) * (1 + difficultyFactor) * (1 + difficultyFactor);
        pipeSpawnInterval = Math.round(pipeSpawnInterval * (1 - difficultyFactor/2) * (1 - difficultyFactor/2) * (1 - difficultyFactor/2));
        pipeGap = Math.round(pipeGap * (1 - difficultyFactor/2) * (1 - difficultyFactor/2) * (1 - difficultyFactor/2));
        playSound(audioSuccess);
    }
}

// Deteksi tabrakan dengan toleransi untuk mobile
function checkCollision(pipe) {
    const tolerance = isMobile ? 0.10 : 0.05;
    const birdHitboxX = bird.x + bird.width * tolerance;
    const birdHitboxY = bird.y + bird.height * tolerance;
    const birdHitboxWidth = bird.width * (1 - 2 * tolerance);
    const birdHitboxHeight = bird.height * (1 - 2 * tolerance);
    
    return (
        birdHitboxX + birdHitboxWidth > pipe.x &&
        birdHitboxX < pipe.x + 50 &&
        (
            (birdHitboxY + birdHitboxHeight > pipe.top && birdHitboxY < pipe.top) ||
            (birdHitboxY < canvas.height - pipe.bottom && birdHitboxY + birdHitboxHeight > canvas.height - pipe.bottom)
        )
    );
}

// Fungsi untuk membuat dan menggambar pipa
function drawPipes() {
    if (frameCount % pipeSpawnInterval === 0) {
        let pipeHeight = Math.floor(Math.random() * (canvas.height - pipeGap)) + 50;
        pipes.push({
            x: canvas.width,
            top: pipeHeight,
            bottom: canvas.height - pipeHeight - pipeGap,
            scored: false
        });
    }

    for (let i = pipes.length - 1; i >= 0; i--) {
        pipes[i].x -= pipeSpeed;

        // Ambil warna dan pola pipa berdasarkan skor
        const colors = getPipeColors();
        const pattern = pipePatterns[colors.pattern];
        
        // Pipa atas
        if (pattern) {
            // Gunakan pola yang sudah di-cache
            ctx.drawImage(pattern, 0, 0, 50, pipes[i].top, pipes[i].x, 0, 50, pipes[i].top);
            // Tepi pipa atas
            ctx.drawImage(pattern, 0, 0, 50, 15, pipes[i].x - 5, pipes[i].top - 15, 60, 15);
            
            // Pipa bawah
            ctx.drawImage(pattern, 0, 0, 50, pipes[i].bottom, pipes[i].x, canvas.height - pipes[i].bottom, 50, pipes[i].bottom);
            // Tepi pipa bawah
            ctx.drawImage(pattern, 0, 0, 50, 15, pipes[i].x - 5, canvas.height - pipes[i].bottom, 60, 15);
        } else {
            // Fallback ke rendering langsung
            if (colors.pattern === 'brick') {
                drawBrickPattern(pipes[i].x, 0, 50, pipes[i].top - 15);
                drawBrickPattern(pipes[i].x, pipes[i].top - 15, 50, 15);
                drawBrickPattern(pipes[i].x, canvas.height - pipes[i].bottom + 15, 50, pipes[i].bottom - 15);
                drawBrickPattern(pipes[i].x, canvas.height - pipes[i].bottom, 50, 15);
            } else if (colors.pattern === 'bamboo') {
                drawBambooPattern(pipes[i].x, 0, 50, pipes[i].top - 15);
                drawBambooPattern(pipes[i].x, pipes[i].top - 15, 50, 15);
                drawBambooPattern(pipes[i].x, canvas.height - pipes[i].bottom + 15, 50, pipes[i].bottom - 15);
                drawBambooPattern(pipes[i].x, canvas.height - pipes[i].bottom, 50, 15);
            } else if (colors.pattern === 'wood') {
                drawWoodPattern(pipes[i].x, 0, 50, pipes[i].top - 15);
                drawWoodPattern(pipes[i].x, pipes[i].top - 15, 50, 15);
                drawWoodPattern(pipes[i].x, canvas.height - pipes[i].bottom + 15, 50, pipes[i].bottom - 15);
                drawWoodPattern(pipes[i].x, canvas.height - pipes[i].bottom, 50, 15);
            } else if (colors.pattern === 'stone') {
                drawStonePattern(pipes[i].x, 0, 50, pipes[i].top - 15);
                drawStonePattern(pipes[i].x, pipes[i].top - 15, 50, 15);
                drawStonePattern(pipes[i].x, canvas.height - pipes[i].bottom + 15, 50, pipes[i].bottom - 15);
                drawStonePattern(pipes[i].x, canvas.height - pipes[i].bottom, 50, 15);
            }
        }

        // Deteksi tabrakan dengan toleransi
        if (checkCollision(pipes[i])) {
            gameOver = true;
            playSound(audioGameOver);
        }

        // Tambah skor
        if (pipes[i].x + 50 < bird.x && !pipes[i].scored) {
            score++;
            pipes[i].scored = true;
            playSound(audioScore);
            adjustDifficulty();
        }

        // Hapus pipa yang sudah lelet
        if (pipes[i].x < -50) {
            pipes.splice(i, 1);
        }
    }
}

// Fungsi untuk menggambar UI
function drawUI() {
    const fontSize = Math.max(16, Math.floor(canvas.width / 15));
    
    // Gambar skor
    ctx.fillStyle = "#000000";
    ctx.font = `${fontSize}px Arial`;
    ctx.fillText("Score: " + score, 10, fontSize + 5);
    
    // Gambar level
    const level = getCurrentLevel();
    ctx.fillStyle = "#000000";
    ctx.font = `${fontSize}px Arial`;
    ctx.fillText(`Level: ${level}`, canvas.width - 100, fontSize + 5);
    
    // Progress bar ke level berikutnya
    const progress = (score % 10) / 10;
    
    const barWidth = 80;
    const barHeight = fontSize / 2;
    const barX = canvas.width - barWidth - 10;
    const barY = fontSize + 10;
    
    // Background
    ctx.fillStyle = "#CCCCCC";
    ctx.fillRect(barX, barY, barWidth, barHeight);
    
    // Progress
    ctx.fillStyle = "#00AA00";
    ctx.fillRect(barX, barY, barWidth * progress, barHeight);
    
    // Border
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY, barWidth, barHeight);
    
    // Gambar UI game over 
    if (gameOver) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.fillStyle = "#FFFFFF";
        ctx.font = `${fontSize * 1.5}px Arial`;
        ctx.textAlign = "center";
        ctx.fillText("Game Over", canvas.width / 2, canvas.height / 2);
        
        ctx.font = `${fontSize * 0.8}px Arial`;
        if (isMobile) {
            ctx.fillText("Tap to Restart", canvas.width / 2, canvas.height / 2 + fontSize * 2);
        } else {
            ctx.fillText("Press R to Restart", canvas.width / 2, canvas.height / 2 + fontSize * 2);
        }
        ctx.textAlign = "left";
    }
    
    // Gambar UI paused
    if (isPaused && !gameOver) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
        ctx.font = `${fontSize * 1.2}px Arial`;
        ctx.textAlign = "center";
        ctx.fillText("PAUSED", canvas.width / 2, canvas.height / 2);
        ctx.textAlign = "left";
    }
}

// Fungsi untuk reset permainan
function resetGame() {
    bird.y = canvas.height / 3;
    bird.velocity = 0;
    pipes = [];
    score = 0;
    gameOver = false;
    isPaused = false;
    isStartPlaying = true;
    jumpQueue = false;
    pipeSpeed = 1.5;
    pipeSpawnInterval = isMobile ? 180 : 150;
    pipeGap = isMobile ? 220 : 200;
    playSound(audioStart);
    if (pauseBtn) {
        pauseBtn.textContent = "⏸️";
    }
}

// Fungsi utama permainan
function update() {
    // Skip logic jika paused
    if (isPaused && !gameOver) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawBird();
        drawPipes();
        drawUI();
        requestAnimationFrame(update);
        return;
    }
    
    if (gameOver) {
        drawUI();
        requestAnimationFrame(update);
        return;
    }

    if (frameCount === 1) {
        isStartPlaying = true;
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
    drawUI();

    frameCount++;
    requestAnimationFrame(update);
}

// Fungsi inisialisasi game
function initGame() {
    resizeCanvas();
    createPipePatterns();
    addPauseButton();
    
    // Listeners untuk resize window
    window.addEventListener('resize', () => {
        resizeCanvas();
    });
    
    // Memastikan audio bisa diputar
    document.addEventListener('click', initAudio, { once: true });
    document.addEventListener('keydown', initAudio, { once: true });
    document.addEventListener('touchstart', initAudio, { once: true });
    
    // Memastikan gambar burung dimuat
    if (birdImage.complete) {
        update();
    } else {
        birdImage.onload = function() {
            console.log("Gambar burung dimuat dengan sukses!");
            update();
        };
        
        birdImage.onerror = function() {
            console.error("Gagal memuat gambar burung! Periksa path file 'burung.png'.");
            update();
        };
    }
}

// Jalankan game
initGame();
