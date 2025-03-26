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
    // Gunakan window.innerHeight sebagai fallback jika clientHeight 0 atau tidak tersedia
    let availableHeight = (container.clientHeight || window.innerHeight) - controlsHeight - 20;
    // Pastikan availableHeight tidak negatif
    availableHeight = Math.max(150, availableHeight); // Minimal tinggi area canvas

    let canvasWidth = Math.min(containerWidth, 480);
    const targetAspectRatio = 3 / 4;
    let canvasHeight = canvasWidth / targetAspectRatio;

    if (canvasHeight > availableHeight) {
        canvasHeight = availableHeight;
        canvasWidth = canvasHeight * targetAspectRatio;
    }

    canvasWidth = Math.max(240, canvasWidth);
    canvasHeight = canvasWidth / targetAspectRatio;
    canvasHeight = Math.max(150, canvasHeight); // Pastikan tinggi minimal

    // Terapkan dimensi HANYA jika valid
    if (canvasWidth > 0 && canvasHeight > 0) {
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;

        bird.width = Math.max(25, canvas.width * 0.09);
        bird.height = bird.width * (2/3);

        // Reset posisi hanya jika game belum mulai atau sudah selesai
        // DAN jika canvas punya dimensi > 0
        if ((!gameStarted || gameOver) && canvas.height > 0) {
             bird.x = canvas.width * 0.2;
             bird.y = canvas.height / 2 - bird.height / 2;
        }

        // Hitung pipeGap hanya jika canvas punya tinggi > 0
        if(canvas.height > 0) {
             pipeGap = Math.max(120, canvas.height * 0.22);
        }

        // Gambar ulang layar awal jika game belum dimulai
        if (!gameStarted) {
            drawInitialScreen();
        }
    } else {
        console.warn("Invalid canvas dimensions calculated:", canvasWidth, canvasHeight);
    }
}

// Variabel permainan (termasuk lift kuat & standar)
let bird = {
    x: 50,
    y: 150,
    width: 50,
    height: 35,
    gravity: isMobile ? 0.11 : 0.14,
    lift: isMobile ? -3.0 : -3.0,
    strongLift: isMobile ? -4.2 : -3.8,
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

const MIN_JUMP_INTERVAL = isMobile ? 200 : 150;
const RAPID_TAP_THRESHOLD = isMobile ? 350 : 300;

// Variabel kesulitan (termasuk interval pipa lebih jauh)
let pipeSpeed = isMobile ? 1.1 : 1.3;
let pipeSpawnInterval = isMobile ? 180 : 120; // Jarak pipa lebih jauh di mobile
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

// Logika handleJump dengan variable lift (tetap dipertahankan)
function handleJump() {
    if (!gameStarted || gameOver || isPaused) return;
    const now = Date.now();
    const timeSinceLastJump = now - lastJumpTime;

    if (timeSinceLastJump < MIN_JUMP_INTERVAL) {
        return;
    }

    let currentLift = bird.lift;
    if (timeSinceLastJump < RAPID_TAP_THRESHOLD) {
        currentLift = bird.strongLift;
    }

    lastJumpTime = now;
    bird.velocity = currentLift;
    playSound(jumpBuffer);
}

// --- Event Listeners --- (Pemanggil initGame di akhir dikembalikan)
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
    // Pastikan posisi di reset setelah resize jika canvas valid
    if (canvas.height > 0) {
        bird.y = canvas.height / 2 - bird.height / 2;
        bird.velocity = 0;
    }

    // Reset kesulitan (nilai sudah termasuk penyesuaian jarak pipa)
    pipeSpeed = isMobile ? 1.1 : 1.3;
    pipeSpawnInterval = isMobile ? 180 : 120;

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
        lastJumpTime = Date.now();
        update();
    }
}

let pauseBtn;
function addPauseButton() {
    if (document.getElementById('pauseBtn')) return;
    pauseBtn = document.createElement('button');
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
    // Pastikan gradient dibuat hanya jika canvas punya tinggi
    if (canvas.height > 0) {
        const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
        gradient.addColorStop(0, color1);
        gradient.addColorStop(1, color2);
        return gradient;
    }
    // Fallback jika tinggi canvas 0 atau tidak valid
    return color1; // Gunakan warna solid sebagai fallback
}


function getCurrentLevel() {
    return Math.floor(score / 10) + 1;
}

function adjustDifficulty() {
    if (score > 0 && score % 10 === 0) {
         const level = getCurrentLevel();
         pipeSpeed *= 1.08;
         pipeSpawnInterval = Math.max(isMobile ? 90 : 70, Math.round(pipeSpawnInterval * 0.96));
         console.log(`Level Up ${level}! Speed: ${pipeSpeed.toFixed(2)}, Spawn Interval: ${pipeSpawnInterval}`);
         playSound(successBuffer);
    }
}

function checkCollision(currentPipe) { // Terima pipa yang dicek sebagai argumen
    // Pastikan currentPipe valid
    if (!currentPipe || typeof currentPipe.x === 'undefined' || typeof currentPipe.top === 'undefined' || typeof currentPipe.bottom === 'undefined') {
        // console.warn("Invalid pipe data in checkCollision");
        return false; // Tidak bisa cek jika data pipa tidak lengkap
    }

    const toleranceRatio = 0.15;
    const birdToleranceX = bird.width * toleranceRatio;
    const birdToleranceY = bird.height * toleranceRatio;
    const birdHitboxX = bird.x + birdToleranceX;
    const birdHitboxY = bird.y + birdToleranceY;
    const birdHitboxWidth = bird.width - 2 * birdToleranceX;
    const birdHitboxHeight = bird.height - 2 * birdToleranceY;

    const pipeBodyWidth = 50;
    const pipeEdgeWidth = 60;
    // const pipeEdgeHeight = 15; // Tidak digunakan secara langsung di logika ini
    const pipeX = currentPipe.x;
    const topSolidHeight = currentPipe.top; // Ketinggian solid atas
    const bottomSolidHeight = currentPipe.bottom; // Ketinggian solid bawah
    const bottomPipeSolidStartY = canvas.height - bottomSolidHeight; // Y mulai solid bawah

    const pipeEdgeStartX = pipeX - (pipeEdgeWidth - pipeBodyWidth) / 2;
    const pipeEdgeEndX = pipeEdgeStartX + pipeEdgeWidth;

    // 1. Cek overlap X (lebih efisien)
    const collisionX = birdHitboxX + birdHitboxWidth > pipeEdgeStartX && birdHitboxX < pipeEdgeEndX;
    if (!collisionX) return false; // Jika tidak overlap X, pasti tidak tabrakan

    // 2. Cek overlap Y dengan bagian solid
    const collisionTopPipe = birdHitboxY < topSolidHeight; // Bagian atas burung lebih tinggi dari batas bawah pipa atas
    const collisionBottomPipe = birdHitboxY + birdHitboxHeight > bottomPipeSolidStartY; // Bagian bawah burung lebih rendah dari batas atas pipa bawah

    // Jika overlap X DAN overlap Y dengan salah satu pipa solid, maka tabrakan
    return collisionTopPipe || collisionBottomPipe;
}


function drawPipes() {
    if (frameCount % pipeSpawnInterval === 0 && canvas.height > 100 && pipeGap > 0) { // Tambahkan check canvas.height & pipeGap
        const minTop = canvas.height * 0.1;
        const maxTop = canvas.height - pipeGap - (canvas.height * 0.1);
        // Pastikan maxTop > minTop sebelum random
        if (maxTop > minTop) {
            let topPipeHeight = Math.floor(Math.random() * (maxTop - minTop + 1)) + minTop;
            topPipeHeight = Math.max(50, topPipeHeight); // Min height
            let bottomPipeHeight = canvas.height - topPipeHeight - pipeGap;
            bottomPipeHeight = Math.max(50, bottomPipeHeight); // Min height
            topPipeHeight = canvas.height - bottomPipeHeight - pipeGap; // Recalculate top if bottom was clamped

            // Hanya push jika hasil perhitungan valid
            if (topPipeHeight > 0 && bottomPipeHeight > 0) {
                 pipes.push({
                     x: canvas.width,
                     top: topPipeHeight,
                     bottom: bottomPipeHeight,
                     scored: false
                 });
            } else {
                 console.warn("Failed to create valid pipe dimensions.");
            }
        } else {
            console.warn("Cannot generate random pipe height, maxTop <= minTop.");
        }
    }

    const pipeStyle = getPipeStyle(); // Ambil style sekali
    if (!pipeStyle) return; // Jangan gambar jika style tidak valid
    ctx.fillStyle = pipeStyle;


    for (let i = pipes.length - 1; i >= 0; i--) {
        pipes[i].x -= pipeSpeed;

        const pipe = pipes[i]; // Referensi ke pipa saat ini
        const pipeWidth = 50;
        const pipeEdgeWidth = 60;
        const pipeEdgeHeight = 15;
        const pipeX = pipe.x;
        const topSolidHeight = pipe.top;
        const bottomSolidHeight = pipe.bottom;
        const bottomPipeY = canvas.height - bottomSolidHeight;
        const edgeX = pipeX - (pipeEdgeWidth - pipeWidth) / 2;

        // Gambar hanya jika dimensi valid
        if (topSolidHeight > 0 && bottomSolidHeight > 0 && canvas.height > 0) {
            // Atas
            ctx.fillRect(pipeX, 0, pipeWidth, topSolidHeight);
            if (topSolidHeight >= pipeEdgeHeight) { // Hindari tepi negatif
                 ctx.fillRect(edgeX, topSolidHeight - pipeEdgeHeight, pipeEdgeWidth, pipeEdgeHeight);
            }
            // Bawah
            ctx.fillRect(pipeX, bottomPipeY, pipeWidth, bottomSolidHeight);
            ctx.fillRect(edgeX, bottomPipeY, pipeEdgeWidth, pipeEdgeHeight);
        }


        // Gunakan 'pipe' (objek pipa saat ini) untuk checkCollision
        if (checkCollision(pipe)) {
            gameOver = true;
            gameStarted = false;
            playSound(gameOverBuffer);
            gameContainer.classList.remove('game-active');
            gameContainer.classList.add('game-over');
            if (pauseBtn) pauseBtn.style.display = 'none';
            // Tidak perlu break jika game over, update loop akan berhenti
            // break; // Opsional: bisa hentikan loop pipa lebih awal
        }

        // Skor (jika game belum over)
        if (!gameOver) {
            const pipeCenterX = pipe.x + pipeWidth / 2;
            if (pipeCenterX < bird.x && !pipe.scored) {
                score++;
                pipe.scored = true;
                playSound(scoreBuffer);
                adjustDifficulty();
            }
        }


        // Hapus pipa
        if (pipe.x < -pipeEdgeWidth) {
            pipes.splice(i, 1);
        }
    }
}

function drawUI() {
    // Pastikan canvas punya dimensi sebelum menggambar UI
    if (canvas.width <= 0 || canvas.height <= 0) return;

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
    // Hentikan jika game over (gambar UI game over terakhir kali)
    if (gameOver) {
        // Pastikan UI terakhir digambar sebelum benar-benar berhenti
        // Coba gambar sekali lagi di sini
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawPipes(); // Gambar pipa terakhir
        drawBird(); // Gambar burung terakhir
        drawUI(); // Gambar UI game over
        return;
    }

    // Handle pause
    if (isPaused) {
        // Gambar state terakhir + UI pause, tapi jangan update state & jangan request frame baru
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawPipes();
        drawBird();
        drawUI();
        return;
    }

    // --- Game Aktif ---
    // Pastikan canvas valid sebelum update & gambar
    if (canvas.width <= 0 || canvas.height <= 0) {
         console.warn("Canvas size invalid during update loop. Requesting next frame and retrying.");
         animationFrameId = requestAnimationFrame(update); // Coba lagi di frame berikutnya
         return;
     }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Burung Update
    bird.velocity += bird.gravity;
    bird.y += bird.velocity;

    // Tabrakan Bawah -> Game Over
    if (bird.y + bird.height > canvas.height) {
        bird.y = canvas.height - bird.height;
        bird.velocity = 0;
        gameOver = true;
        gameStarted = false;
        playSound(gameOverBuffer);
        gameContainer.classList.remove('game-active');
        gameContainer.classList.add('game-over');
        if (pauseBtn) pauseBtn.style.display = 'none';
        // Jangan langsung return, biarkan UI game over digambar di akhir loop ini
    }
    // Tabrakan Atas
    if (bird.y < 0) {
        bird.y = 0;
        bird.velocity = 0;
    }

    // Pipa Update & Gambar (juga cek tabrakan & skor)
    // Memastikan drawPipes dipanggil meski game over di frame ini,
    // agar posisi pipa terakhir tergambar sebelum UI game over
    drawPipes();

    // Gambar Burung (setelah pipa, sebelum UI)
    drawBird();

    // Gambar UI (skor, level, pesan game over/pause jika relevan)
    drawUI();

    // Tingkatkan frame count jika game belum over
    if (!gameOver) {
        frameCount++;
    }

    // Request frame berikutnya HANYA jika game belum over DAN tidak pause
    if (!gameOver && !isPaused) {
         animationFrameId = requestAnimationFrame(update);
    } else if (gameOver) {
         // Jika game over, pastikan loop berhenti
         if (animationFrameId) cancelAnimationFrame(animationFrameId);
         // Gambar UI Game Over sekali lagi untuk memastikan
         drawUI();
    }
}

function drawInitialScreen() {
    // Pastikan canvas valid sebelum menggambar
    if (canvas.width > 0 && canvas.height > 0) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawBird();
        ctx.fillStyle = "#FFFFFF";
        ctx.strokeStyle = "#000000";
        ctx.lineWidth = 2;
        ctx.textAlign = "center";
        const startFontSize = Math.max(18, Math.floor(canvas.width / 22));
        ctx.font = `bold ${startFontSize}px Arial`;
        const startText = "Tekan 'Mulai Permainan'";
        const textY = canvas.height / 2 + bird.height + 30;
        // Pastikan textY tidak di luar canvas
        if (textY < canvas.height - startFontSize) {
            ctx.strokeText(startText, canvas.width / 2, textY);
            ctx.fillText(startText, canvas.width / 2, textY);
        }
    } else {
        // console.warn("Attempted to draw initial screen on invalid canvas.");
    }
}

function initGame() {
    addPauseButton();
    updateSoundButton();
    // Panggil resizeCanvas SEKARANG untuk set ukuran awal
    // resizeCanvas akan memanggil drawInitialScreen jika game belum mulai
    resizeCanvas();
    // Listener resize tetap ada untuk menangani perubahan orientasi/ukuran nanti
    // window.addEventListener('resize', resizeCanvas); // Ini sudah ada di atas
}

// --- PEMANGGILAN INIT DIKEMBALIKAN ---
// Panggil initGame langsung saat script selesai dimuat
initGame();
// --- AKHIR PEMANGGILAN INIT ---