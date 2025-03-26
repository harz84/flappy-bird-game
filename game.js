const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const gameContainer = document.getElementById("gameContainer");
const startButton = document.getElementById("startButton");
const restartButton = document.getElementById("restartButton");
const soundButton = document.getElementById("soundToggle");

// Deteksi perangkat mobile
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

// Fungsi untuk menyesuaikan canvas dengan ukuran layar
function resizeCanvas() {
    const container = canvas.parentElement || document.body;
    const controlsHeight = document.getElementById('controls')?.offsetHeight || 60;
    let containerWidth = container.clientWidth || window.innerWidth;
    let availableHeight = (container.clientHeight || window.innerHeight) - controlsHeight - 20;

    let canvasWidth = Math.min(containerWidth, 480);
    const targetAspectRatio = 3 / 4;
    let canvasHeight = canvasWidth / targetAspectRatio;

    if (canvasHeight > availableHeight) {
        canvasHeight = availableHeight;
        canvasWidth = canvasHeight * targetAspectRatio;
    }

    canvasWidth = Math.max(240, canvasWidth);
    // Ensure height is recalculated based on potentially clamped width
    canvasHeight = canvasWidth / targetAspectRatio;
    // Ensure height isn't negative or zero if calculations go wrong
    canvasHeight = Math.max(150, canvasHeight);

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    bird.width = Math.max(25, canvas.width * 0.09);
    bird.height = bird.width * (2/3);

    if (!gameStarted || gameOver) {
         bird.x = canvas.width * 0.2;
         bird.y = canvas.height / 2 - bird.height / 2;
    }

    pipeGap = Math.max(120, canvas.height * 0.22);

    if (!gameStarted) {
        drawInitialScreen();
    }
}

// Variabel permainan
let bird = {
    x: 50,
    y: 150,
    width: 50,
    height: 35,
    gravity: isMobile ? 0.11 : 0.14,
    // --- PERUBAHAN: Lift standar & kuat ---
    lift: isMobile ? -3.0 : -3.0,         // Lompatan standar
    strongLift: isMobile ? -4.2 : -3.8,   // Lompatan lebih kuat untuk tap cepat
    // --- AKHIR PERUBAHAN ---
    velocity: 0
};

let pipes = [];
let frameCount = 0;
let score = 0;
let gameStarted = false;
let gameOver = false;
let isPaused = false;
let audioInitialized = false;
let soundEnabled = true;
let lastJumpTime = 0;

const MIN_JUMP_INTERVAL = isMobile ? 200 : 150; // ms debounce dasar
// --- PERUBAHAN: Threshold untuk tap cepat ---
const RAPID_TAP_THRESHOLD = isMobile ? 350 : 300; // ms (Jika tap < threshold ini, gunakan strongLift)

// Variabel kesulitan
let pipeSpeed = isMobile ? 1.1 : 1.3;
// --- PERUBAHAN: Jarak spawn pipa lebih jauh di mobile ---
let pipeSpawnInterval = isMobile ? 180 : 120; // Lebih besar = lebih jauh
let pipeGap = 180;

// Audio effects (kode audio tetap sama)
let audioContext;
let jumpBuffer, scoreBuffer, gameOverBuffer, startBuffer, successBuffer;

async function setupAudio() {
    if (audioInitialized || !window.AudioContext && !window.webkitAudioContext) {
         console.log("Audio already initialized or Web Audio API not supported.");
         if (!window.AudioContext && !window.webkitAudioContext) soundEnabled = false;
         updateSoundButton();
         return;
     }
    try {
        if (!audioContext) {
             audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioContext.state === 'suspended') {
           await audioContext.resume();
        }

        const loadSound = async (url) => {
            try {
                 const response = await fetch(url);
                 if (!response.ok) throw new Error(`HTTP error! status: ${response.status} for ${url}`);
                 const arrayBuffer = await response.arrayBuffer();
                 return await audioContext.decodeAudioData(arrayBuffer);
            } catch (loadError) {
                 console.error(`Failed to load sound: ${url}`, loadError);
                 return null;
            }
        };

        const results = await Promise.allSettled([
            loadSound('jump.wav'), loadSound('score.wav'), loadSound('gameover.wav'),
            loadSound('start.wav'), loadSound('success.mp3')
        ]);

        jumpBuffer = results[0].status === 'fulfilled' ? results[0].value : null;
        scoreBuffer = results[1].status === 'fulfilled' ? results[1].value : null;
        gameOverBuffer = results[2].status === 'fulfilled' ? results[2].value : null;
        startBuffer = results[3].status === 'fulfilled' ? results[3].value : null;
        successBuffer = results[4].status === 'fulfilled' ? results[4].value : null;

        audioInitialized = true;
        console.log("Web Audio API initialized. Sound load status:", results);

    } catch (error) {
        console.error("Failed to initialize Web Audio API:", error);
        soundEnabled = false;
        audioInitialized = false;
    } finally {
         updateSoundButton();
    }
}

function playSound(buffer) {
    if (!soundEnabled || !audioInitialized || !buffer || !audioContext) return;
    if (audioContext.state === 'suspended') {
        audioContext.resume().then(() => {
             const source = audioContext.createBufferSource();
             source.buffer = buffer;
             source.connect(audioContext.destination);
             source.start(0);
        }).catch(e => console.error("Audio resume failed:", e));
    } else {
         const source = audioContext.createBufferSource();
         source.buffer = buffer;
         source.connect(audioContext.destination);
         source.start(0);
    }
}

function toggleSound() {
    soundEnabled = !soundEnabled;
    updateSoundButton();
    if (soundEnabled && !audioInitialized) {
        setupAudio();
    }
}

function updateSoundButton() {
    if (soundButton) {
         soundButton.textContent = soundEnabled ? "🔊" : "🔇";
    }
}

// --- PERUBAHAN: Logika handleJump untuk variable lift ---
function handleJump() {
    if (!gameStarted || gameOver || isPaused) return;
    const now = Date.now();
    const timeSinceLastJump = now - lastJumpTime;

    // 1. Debounce dasar: Jangan proses jika tap terlalu cepat (spam)
    if (timeSinceLastJump < MIN_JUMP_INTERVAL) {
        // console.log("Jump too soon, ignored."); // Optional debug
        return;
    }

    // 2. Tentukan kekuatan lompatan berdasarkan waktu sejak lompatan terakhir
    let currentLift = bird.lift; // Mulai dengan lift standar
    if (timeSinceLastJump < RAPID_TAP_THRESHOLD) {
        // Jika waktu sejak lompatan terakhir cukup singkat (menandakan tap cepat/intens)
        currentLift = bird.strongLift; // Gunakan lift yang lebih kuat
        // console.log(`Rapid tap! Using strong lift: ${currentLift}`); // Optional debug
    } else {
        // console.log(`Normal tap. Using standard lift: ${currentLift}`); // Optional debug
    }

    // 3. Terapkan lompatan
    lastJumpTime = now;          // Catat waktu lompatan ini
    bird.velocity = currentLift; // Terapkan kekuatan lompatan yang dipilih
    playSound(jumpBuffer);       // Mainkan suara lompat
}
// --- AKHIR PERUBAHAN ---

// --- Event Listeners --- (Tetap sama, kecuali pemanggil initGame di akhir)
document.addEventListener("keydown", function(event) {
    if (!gameStarted || gameOver) return;
    if ((event.key === " " || event.key === "ArrowUp" || event.key === "Shift") && !isPaused) {
        handleJump();
    }
    if (event.key.toLowerCase() === "p") {
        togglePause();
    }
});

canvas.addEventListener("touchstart", function(event) {
    event.preventDefault();
    if (!audioInitialized && soundEnabled) {
         setupAudio();
    }
    if (!gameStarted || gameOver) return;
    if (!isPaused) {
        handleJump();
    }
}, { passive: false });

startButton.addEventListener('click', () => {
    if (!audioInitialized && soundEnabled) {
         setupAudio().then(startGame);
    } else {
         startGame();
    }
});

restartButton.addEventListener('click', resetGame);
soundButton.addEventListener('click', toggleSound);
window.addEventListener('resize', resizeCanvas);

document.body.addEventListener('touchmove', function(event) {
   if (gameContainer.contains(event.target) && !document.getElementById('controls').contains(event.target)) {
        event.preventDefault();
   }
}, { passive: false });

// --- Game Functions --- (Fungsi lain tetap sama)

function startGame() {
    if (gameStarted) return;

    gameStarted = true;
    gameOver = false;
    isPaused = false;
    score = 0;
    frameCount = 0;
    pipes = [];

    resizeCanvas(); // Panggil resize untuk set ukuran & posisi awal yang benar
    bird.y = canvas.height / 2 - bird.height / 2;
    bird.velocity = 0;

    // Reset kesulitan (nilai sudah termasuk penyesuaian jarak pipa)
    pipeSpeed = isMobile ? 1.1 : 1.3;
    pipeSpawnInterval = isMobile ? 180 : 120; // Menggunakan nilai baru

    playSound(startBuffer);

    gameContainer.classList.remove('game-over');
    gameContainer.classList.add('game-active');
    if (pauseBtn) pauseBtn.style.display = 'block';

    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    update();
}

function togglePause() {
    if (gameOver || !gameStarted) return;
    isPaused = !isPaused;
    if (pauseBtn) {
        pauseBtn.textContent = isPaused ? "▶️" : "⏸️";
    }
    if (!isPaused) {
        lastJumpTime = Date.now(); // Reset jump timer on unpause
        update();
    }
}

let pauseBtn;
function addPauseButton() {
    if (document.getElementById('pauseBtn')) return;
    pauseBtn = document.createElement('button');
    // ... (styling pause button tetap sama) ...
    pauseBtn.id = 'pauseBtn';
    pauseBtn.textContent = "⏸️";
    pauseBtn.setAttribute('aria-label', 'Pause/Resume Game');
    pauseBtn.style.position = "absolute";
    pauseBtn.style.top = "15px";
    pauseBtn.style.right = "15px";
    pauseBtn.style.zIndex = "100";
    pauseBtn.style.fontSize = "24px";
    pauseBtn.style.backgroundColor = "rgba(255,255,255,0.7)";
    pauseBtn.style.border = "1px solid rgba(0,0,0,0.2)";
    pauseBtn.style.borderRadius = "50%";
    pauseBtn.style.width = "45px";
    pauseBtn.style.height = "45px";
    pauseBtn.style.padding = "0";
    pauseBtn.style.cursor = "pointer";
    pauseBtn.style.display = 'none';
    pauseBtn.style.lineHeight = '45px';
    pauseBtn.style.textAlign = 'center';
    pauseBtn.style.userSelect = 'none';
    pauseBtn.style.webkitTapHighlightColor = 'transparent';
    pauseBtn.addEventListener('click', togglePause);
    gameContainer.appendChild(pauseBtn);
}

const birdImage = new Image();
birdImage.src = 'burung.png';
birdImage.onload = () => {
    console.log("Gambar burung dimuat.");
    if (!gameStarted) drawInitialScreen();
};
birdImage.onerror = () => {
    console.error("Gagal memuat gambar burung! Menggunakan fallback.");
    if (!gameStarted) drawInitialScreen();
};

function drawBird() {
    if (birdImage.complete && birdImage.naturalWidth !== 0 && canvas.width > 0 && canvas.height > 0) {
        ctx.drawImage(birdImage, bird.x, bird.y, bird.width, bird.height);
    } else if (canvas.width > 0 && canvas.height > 0) {
        ctx.fillStyle = "#FFFF00";
        ctx.fillRect(bird.x, bird.y, bird.width, bird.height);
    }
}

function getPipeStyle() {
    let color1, color2;
    const level = getCurrentLevel();
    switch (level) {
        case 1: color1 = '#5DBE3F'; color2 = '#3E892E'; break;
        case 2: color1 = '#5BC0EB'; color2 = '#2E7DAF'; break;
        case 3: color1 = '#F26C4F'; color2 = '#C1272D'; break;
        case 4: color1 = '#A76FB9'; color2 = '#76438A'; break;
        default: color1 = '#FBB040'; color2 = '#F7941E'; break;
    }
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, color1);
    gradient.addColorStop(1, color2);
    return gradient;
}

function getCurrentLevel() {
    return Math.floor(score / 10) + 1;
}

function adjustDifficulty() {
    if (score > 0 && score % 10 === 0) {
         const level = getCurrentLevel();
         pipeSpeed *= 1.08;
         // Spawn interval juga dikurangi sedikit saat naik level, tapi tetap ada batas bawah
         pipeSpawnInterval = Math.max(isMobile ? 90 : 70, Math.round(pipeSpawnInterval * 0.96));

         console.log(`Level Up ${level}! Speed: ${pipeSpeed.toFixed(2)}, Spawn Interval: ${pipeSpawnInterval}`);
         playSound(successBuffer);
    }
}

function checkCollision(pipe) {
    const toleranceRatio = 0.15;
    const birdToleranceX = bird.width * toleranceRatio;
    const birdToleranceY = bird.height * toleranceRatio;
    const birdHitboxX = bird.x + birdToleranceX;
    const birdHitboxY = bird.y + birdToleranceY;
    const birdHitboxWidth = bird.width - 2 * birdToleranceX;
    const birdHitboxHeight = bird.height - 2 * birdToleranceY;

    const pipeBodyWidth = 50;
    const pipeEdgeWidth = 60;
    const pipeEdgeHeight = 15;
    const pipeX = pipe.x;
    const pipeTopOpeningY = pipes[i].top; // Ketinggian solid atas
    const pipeBottomOpeningY = canvas.height - pipes[i].bottom; // Y mulai solid bawah

    const pipeEdgeStartX = pipeX - (pipeEdgeWidth - pipeBodyWidth) / 2;
    const pipeEdgeEndX = pipeEdgeStartX + pipeEdgeWidth;

    const collisionX = birdHitboxX + birdHitboxWidth > pipeEdgeStartX && birdHitboxX < pipeEdgeEndX;
    if (!collisionX) return false;

    // Cek tabrakan Y dengan bagian SOLID pipa (termasuk tepi)
    const collisionTop = birdHitboxY < pipeTopOpeningY; // Menyentuh pipa atas
    const collisionBottom = birdHitboxY + birdHitboxHeight > pipeBottomOpeningY; // Menyentuh pipa bawah

    // Perlu diperhalus: Cek tabrakan dengan Tepi saja jika TIDAK kena badan utama
    // Tapi untuk simple, cek saja overlap Y dengan area solid
     if (collisionTop || collisionBottom) {
         // Periksa lagi lebih detail: Apakah kena tepi atau badan?
         // Untuk sementara, deteksi ini cukup
         return true;
     }

     return false;

    /* // Detail check (lebih kompleks, mungkin tidak perlu)
    const topPipeSolidEndY = pipeTopOpeningY;
    const bottomPipeSolidStartY = pipeBottomOpeningY;

    const collisionTopPipe = birdHitboxY < topPipeSolidEndY;
    const collisionBottomPipe = birdHitboxY + birdHitboxHeight > bottomPipeSolidStartY;

    return collisionTopPipe || collisionBottomPipe;
    */
}


function drawPipes() {
    if (frameCount % pipeSpawnInterval === 0) {
        const minTop = canvas.height * 0.1;
        const maxTop = canvas.height - pipeGap - (canvas.height * 0.1);
        let topPipeHeight = Math.floor(Math.random() * (maxTop - minTop + 1)) + minTop;
        topPipeHeight = Math.max(50, topPipeHeight);
        let bottomPipeHeight = canvas.height - topPipeHeight - pipeGap;
        bottomPipeHeight = Math.max(50, bottomPipeHeight);
        topPipeHeight = canvas.height - bottomPipeHeight - pipeGap;

        pipes.push({
            x: canvas.width,
            top: topPipeHeight,      // Ketinggian solid atas
            bottom: bottomPipeHeight,// Ketinggian solid bawah
            scored: false
        });
    }

    ctx.fillStyle = getPipeStyle();

    for (let i = pipes.length - 1; i >= 0; i--) {
        pipes[i].x -= pipeSpeed;

        const pipeWidth = 50;
        const pipeEdgeWidth = 60;
        const pipeEdgeHeight = 15;
        const pipeX = pipes[i].x;
        const topSolidHeight = pipes[i].top;
        const bottomSolidHeight = pipes[i].bottom;
        const bottomPipeY = canvas.height - bottomSolidHeight;
        const edgeX = pipeX - (pipeEdgeWidth - pipeWidth) / 2;

        // Atas
        ctx.fillRect(pipeX, 0, pipeWidth, topSolidHeight);
        ctx.fillRect(edgeX, topSolidHeight - pipeEdgeHeight, pipeEdgeWidth, pipeEdgeHeight);
        // Bawah
        ctx.fillRect(pipeX, bottomPipeY, pipeWidth, bottomSolidHeight);
        ctx.fillRect(edgeX, bottomPipeY, pipeEdgeWidth, pipeEdgeHeight); // Tepi bawah mulai di Y pipa bawah

        if (checkCollision(pipes[i])) { // Gunakan index 'i' saat memanggil checkCollision
            gameOver = true;
            gameStarted = false;
            playSound(gameOverBuffer);
            gameContainer.classList.remove('game-active');
            gameContainer.classList.add('game-over');
            if (pauseBtn) pauseBtn.style.display = 'none';
            break;
        }

        const pipeCenterX = pipes[i].x + pipeWidth / 2;
        if (pipeCenterX < bird.x && !pipes[i].scored) {
            score++;
            pipes[i].scored = true;
            playSound(scoreBuffer);
            adjustDifficulty();
        }

        if (pipes[i].x < -pipeEdgeWidth) {
            pipes.splice(i, 1);
        }
    }
}

function drawUI() {
    // ... (UI drawing tetap sama) ...
    const fontSizeScore = Math.max(18, Math.floor(canvas.width / 25));
    const fontSizeLevel = Math.max(14, Math.floor(canvas.width / 30));
    const uiPadding = 10;

    ctx.fillStyle = "#FFFFFF";
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 2;

    // Skor
    ctx.font = `bold ${fontSizeScore}px Arial`;
    ctx.textAlign = "left";
    const scoreText = "Skor: " + score;
    ctx.strokeText(scoreText, uiPadding, fontSizeScore + uiPadding);
    ctx.fillText(scoreText, uiPadding, fontSizeScore + uiPadding);

    // Level
    ctx.font = `bold ${fontSizeLevel}px Arial`;
    ctx.textAlign = "right";
    const levelText = `Level: ${getCurrentLevel()}`;
    ctx.strokeText(levelText, canvas.width - uiPadding, fontSizeLevel + uiPadding);
    ctx.fillText(levelText, canvas.width - uiPadding, fontSizeLevel + uiPadding);

    // Game Over
    if (gameOver) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#FFFFFF";
        ctx.strokeStyle = "#000000";
        ctx.lineWidth = 3;
        ctx.textAlign = "center";

        const gameOverFontSize = Math.max(28, Math.floor(canvas.width / 12));
        ctx.font = `bold ${gameOverFontSize}px Arial`;
        const gameOverText = "Game Over";
        const textY = canvas.height / 2 - gameOverFontSize / 2;
        ctx.strokeText(gameOverText, canvas.width / 2, textY);
        ctx.fillText(gameOverText, canvas.width / 2, textY);

        const restartFontSize = Math.max(16, Math.floor(canvas.width / 25));
        ctx.font = `normal ${restartFontSize}px Arial`;
        const restartText = "Tekan 'Main Lagi'";
        const restartTextY = textY + gameOverFontSize * 0.8 + restartFontSize;
        ctx.strokeText(restartText, canvas.width / 2, restartTextY);
        ctx.fillText(restartText, canvas.width / 2, restartTextY);
    }

    // Paused
    if (isPaused && !gameOver) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.textAlign = "center";
        const pausedFontSize = Math.max(24, Math.floor(canvas.width / 15));
        ctx.font = `bold ${pausedFontSize}px Arial`;
        ctx.fillStyle = "#FFFFFF";
        ctx.strokeStyle = "#000000";
        ctx.lineWidth = 2;
        ctx.strokeText("PAUSED", canvas.width / 2, canvas.height / 2);
        ctx.fillText("PAUSED", canvas.width / 2, canvas.height / 2);
    }
}

function resetGame() {
    startGame();
}

let animationFrameId;
function update() {
    if (gameOver) {
        drawUI();
        return;
    }
    if (isPaused) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawPipes();
        drawBird();
        drawUI();
        return;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Burung
    bird.velocity += bird.gravity;
    bird.y += bird.velocity;

    // Tabrakan Bawah
    if (bird.y + bird.height > canvas.height) {
        bird.y = canvas.height - bird.height;
        bird.velocity = 0;
        gameOver = true;
        gameStarted = false;
        playSound(gameOverBuffer);
        gameContainer.classList.remove('game-active');
        gameContainer.classList.add('game-over');
         if (pauseBtn) pauseBtn.style.display = 'none';
    }
    // Tabrakan Atas
    if (bird.y < 0) {
        bird.y = 0;
        bird.velocity = 0; // Hentikan momentum ke atas jika membentur langit-langit
    }

    // Pipa (menggambar juga mengupdate posisi & logika)
    drawPipes();

    // Gambar Burung
    drawBird();

    // Gambar UI
    drawUI();

    frameCount++;

    if (!gameOver && !isPaused) {
         animationFrameId = requestAnimationFrame(update);
    }
}

function drawInitialScreen() {
    if (canvas.width > 0 && canvas.height > 0) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawBird(); // Gambar burung di posisi awal
        ctx.fillStyle = "#FFFFFF";
        ctx.strokeStyle = "#000000";
        ctx.lineWidth = 2;
        ctx.textAlign = "center";
        const startFontSize = Math.max(18, Math.floor(canvas.width / 22));
        ctx.font = `bold ${startFontSize}px Arial`;
        const startText = "Tekan 'Mulai Permainan'";
        const textY = canvas.height / 2 + bird.height + 30;
        ctx.strokeText(startText, canvas.width / 2, textY);
        ctx.fillText(startText, canvas.width / 2, textY);
    }
}

function initGame() {
    addPauseButton();
    resizeCanvas();
    updateSoundButton();
    // Tampilan awal sudah digambar oleh resizeCanvas -> drawInitialScreen
}

// --- PERUBAHAN: Panggil initGame setelah DOM siap ---
window.addEventListener('DOMContentLoaded', initGame);
// --- AKHIR PERUBAHAN ---