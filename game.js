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
    const controlsHeight = document.getElementById('controls')?.offsetHeight || 60; // Approximate height of controls area
    let containerWidth = container.clientWidth || window.innerWidth;
    // Subtract a little margin for better fit
    let availableHeight = (container.clientHeight || window.innerHeight) - controlsHeight - 20; // 10px top margin, 10px bottom space

    // Clamp width to max width
    let canvasWidth = Math.min(containerWidth, 480);

    // Calculate target aspect ratio (3:4 like original 480x640)
    const targetAspectRatio = 3 / 4;
    let canvasHeight = canvasWidth / targetAspectRatio;

    // Ensure canvas fits within the available vertical space
    if (canvasHeight > availableHeight) {
        canvasHeight = availableHeight;
        // Adjust width based on new height to maintain aspect ratio
        canvasWidth = canvasHeight * targetAspectRatio;
    }

    // Make sure width is not less than a minimum (e.g., 240px)
    canvasWidth = Math.max(240, canvasWidth);
    canvasHeight = canvasWidth / targetAspectRatio; // Recalculate height based on clamped width

    // Apply dimensions
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    // Perbarui ukuran burung berdasarkan ukuran canvas
    bird.width = Math.max(25, canvas.width * 0.09); // Slightly smaller relative size, min 25px
    bird.height = bird.width * (2/3); // Maintain bird aspect ratio

    // Reset posisi burung ke tengah (vertikal) dan sisi kiri (horizontal)
    // Only reset position if game hasn't started or is not over (avoids jump on resize during play/end)
    if (!gameStarted || gameOver) {
         bird.x = canvas.width * 0.2;
         bird.y = canvas.height / 2 - bird.height / 2;
    }

    // Perbarui celah pipa berdasarkan tinggi canvas
    pipeGap = Math.max(120, canvas.height * 0.22); // Celah relatif, min 120px

    // Redraw initial screen if game not started
    if (!gameStarted) {
        drawInitialScreen();
    }
}


// Variabel permainan
let bird = {
    x: 50,
    y: 150,
    width: 50, // Akan di-override oleh resizeCanvas
    height: 35, // Akan di-override oleh resizeCanvas
    // --- FISIKA MOBILE-OPTIMIZED ---
    // Gravitasi dikurangi di mobile (lebih ringan)
    gravity: isMobile ? 0.11 : 0.14,
    // Lift (kekuatan lompatan) - sama, tapi efektif lebih kuat karena gravitasi lebih rendah
    lift: isMobile ? -3.0 : -3.0, // Coba -3.2 atau -3.4 jika ingin lebih kuat
    // --- AKHIR FISIKA ---
    velocity: 0
};


let pipes = [];
let frameCount = 0;
let score = 0;
let gameStarted = false; // Track if the game has started
let gameOver = false;
let isPaused = false;
let audioInitialized = false;
let soundEnabled = true; // Status suara
let lastJumpTime = 0;
// --- RESPON SENTUHAN MOBILE-OPTIMIZED ---
// Interval minimum antar lompatan (tap), sedikit lebih cepat di mobile
const MIN_JUMP_INTERVAL = isMobile ? 200 : 150; // ms

// Variabel untuk kesulitan
// Kecepatan awal pipa (sedikit lebih lambat di mobile)
let pipeSpeed = isMobile ? 1.1 : 1.3;
// Jarak spawn antar pipa (sedikit lebih jauh di mobile)
let pipeSpawnInterval = isMobile ? 140 : 110;
let pipeGap = 180; // Celah antar pipa (Akan di-override oleh resizeCanvas)

// Audio effects
let audioContext;
let jumpBuffer, scoreBuffer, gameOverBuffer, startBuffer, successBuffer;

// Fungsi untuk memuat audio menggunakan Web Audio API
async function setupAudio() {
    if (audioInitialized || !window.AudioContext && !window.webkitAudioContext) {
         console.log("Audio already initialized or Web Audio API not supported.");
         if (!window.AudioContext && !window.webkitAudioContext) soundEnabled = false; // Disable sound if not supported
         updateSoundButton();
         return;
     }
    try {
        // Resume context on user gesture (important for mobile)
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
                 return null; // Return null if a specific sound fails
            }
        };

        // Use Promise.allSettled to load all sounds even if some fail
        const results = await Promise.allSettled([
            loadSound('jump.wav'),
            loadSound('score.wav'),
            loadSound('gameover.wav'),
            loadSound('start.wav'),
            loadSound('success.mp3')
        ]);

        // Assign buffers only if loaded successfully
        jumpBuffer = results[0].status === 'fulfilled' ? results[0].value : null;
        scoreBuffer = results[1].status === 'fulfilled' ? results[1].value : null;
        gameOverBuffer = results[2].status === 'fulfilled' ? results[2].value : null;
        startBuffer = results[3].status === 'fulfilled' ? results[3].value : null;
        successBuffer = results[4].status === 'fulfilled' ? results[4].value : null;

        audioInitialized = true;
        console.log("Web Audio API initialized. Sound load status:", results);
        // Keep soundEnabled = true unless ALL sounds failed or API unsupported
        // soundEnabled = results.some(r => r.status === 'fulfilled' && r.value !== null);

    } catch (error) {
        console.error("Failed to initialize Web Audio API:", error);
        soundEnabled = false;
        audioInitialized = false;
    } finally {
         updateSoundButton(); // Update button regardless of outcome
    }
}

// Fungsi untuk memainkan suara (Web Audio API)
function playSound(buffer) {
    if (!soundEnabled || !audioInitialized || !buffer || !audioContext) return;
     // Resume context just in case it got suspended again
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

// Fungsi toggle suara
function toggleSound() {
    soundEnabled = !soundEnabled;
    updateSoundButton();
    // Initialize audio if toggled on for the first time by user interaction
    if (soundEnabled && !audioInitialized) {
        setupAudio(); // Attempt to set up audio now
    }
}

// Update tampilan tombol suara
function updateSoundButton() {
    if (soundButton) {
         soundButton.textContent = soundEnabled ? "🔊" : "🔇";
         // Optional: visually disable if audio setup failed completely
         // soundButton.disabled = !audioInitialized && !soundEnabled;
         // soundButton.style.opacity = soundButton.disabled ? 0.5 : 1;
    }
}


// Fungsi untuk menangani lompatan
function handleJump() {
    // Jangan lompat jika game belum dimulai atau sudah selesai atau dijeda
    if (!gameStarted || gameOver || isPaused) return;

    const now = Date.now();
    // Cegah spam tap/klik (menggunakan MIN_JUMP_INTERVAL yang sudah disesuaikan)
    if (now - lastJumpTime < MIN_JUMP_INTERVAL) return;

    lastJumpTime = now;
    bird.velocity = bird.lift; // Terapkan kekuatan lompatan
    playSound(jumpBuffer);
}

// --- Event Listeners ---

// Kontrol keyboard
document.addEventListener("keydown", function(event) {
    if (!gameStarted || gameOver) return; // Hanya berlaku saat game berjalan

    // Lompat
    if ((event.key === " " || event.key === "ArrowUp" || event.key === "Shift") && !isPaused) {
        handleJump();
    }
    // Pause/Resume
    if (event.key.toLowerCase() === "p") {
        togglePause();
    }
});

// Kontrol sentuh untuk perangkat mobile (Hanya pada Canvas)
canvas.addEventListener("touchstart", function(event) {
    event.preventDefault(); // Mencegah scroll/zoom saat menyentuh canvas
    // Coba inisialisasi audio pada sentuhan pertama jika belum
    if (!audioInitialized && soundEnabled) {
         setupAudio();
    }
    if (!gameStarted || gameOver) return; // Jangan lakukan apa-apa jika game belum/tidak aktif

    if (!isPaused) {
        handleJump();
    }
}, { passive: false }); // passive: false is necessary for preventDefault()

// Tombol Mulai
startButton.addEventListener('click', () => {
    // Inisialisasi audio pada klik pertama jika belum dan sound aktif
    if (!audioInitialized && soundEnabled) {
         setupAudio().then(startGame); // Mulai game setelah audio coba di-setup
    } else {
         startGame(); // Langsung mulai jika audio sudah siap atau tidak aktif
    }
});

// Tombol Restart
restartButton.addEventListener('click', resetGame); // Cukup panggil reset

// Tombol Suara
soundButton.addEventListener('click', toggleSound); // Hanya toggle, setup akan dicoba jika diaktifkan

// Resize listener
window.addEventListener('resize', resizeCanvas);

// Prevent scrolling on body (more robust)
document.body.addEventListener('touchmove', function(event) {
   // Allow scrolling ONLY if the target is not the canvas or controls inside game container
   if (gameContainer.contains(event.target) && !document.getElementById('controls').contains(event.target)) {
        event.preventDefault();
   }
}, { passive: false });

// --- Game Functions ---

function startGame() {
    if (gameStarted) return; // Cegah mulai ganda

    gameStarted = true;
    gameOver = false;
    isPaused = false;
    score = 0;
    frameCount = 0;
    pipes = [];

    // Panggil resizeCanvas untuk set ukuran & posisi awal yang benar
    resizeCanvas();
    // Reset posisi & kecepatan burung (setelah resize)
    bird.y = canvas.height / 2 - bird.height / 2;
    bird.velocity = 0;


    // Reset kesulitan ke nilai awal (sudah mobile-adjusted)
    pipeSpeed = isMobile ? 1.1 : 1.3;
    pipeSpawnInterval = isMobile ? 140 : 110;
    // pipeGap direset di resizeCanvas

    playSound(startBuffer);

    // Update UI state
    gameContainer.classList.remove('game-over');
    gameContainer.classList.add('game-active');
    if (pauseBtn) pauseBtn.style.display = 'block'; // Tampilkan tombol pause

    // Mulai game loop
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    update();
}


// Toggle pause
function togglePause() {
    if (gameOver || !gameStarted) return;
    isPaused = !isPaused;
    if (pauseBtn) {
        pauseBtn.textContent = isPaused ? "▶️" : "⏸️";
    }
    // Jika melanjutkan (unpause), restart game loop
    if (!isPaused) {
        // Reset lastJumpTime to prevent immediate jump after unpausing if tapped during pause
        lastJumpTime = Date.now();
        update();
    }
}

// Tambah tombol pause
let pauseBtn;
function addPauseButton() {
    if (document.getElementById('pauseBtn')) return;

    pauseBtn = document.createElement('button');
    pauseBtn.id = 'pauseBtn';
    pauseBtn.textContent = "⏸️";
    pauseBtn.setAttribute('aria-label', 'Pause/Resume Game'); // Accessibility
    pauseBtn.style.position = "absolute";
    pauseBtn.style.top = "15px";
    pauseBtn.style.right = "15px";
    pauseBtn.style.zIndex = "100";
    pauseBtn.style.fontSize = "24px"; // Icon size
    pauseBtn.style.backgroundColor = "rgba(255,255,255,0.7)";
    pauseBtn.style.border = "1px solid rgba(0,0,0,0.2)";
    pauseBtn.style.borderRadius = "50%"; // Circle
    pauseBtn.style.width = "45px"; // Touch target size
    pauseBtn.style.height = "45px";
    pauseBtn.style.padding = "0";
    pauseBtn.style.cursor = "pointer";
    pauseBtn.style.display = 'none'; // Sembunyikan awalnya
    pauseBtn.style.lineHeight = '45px'; // Center icon vertically
    pauseBtn.style.textAlign = 'center'; // Center icon horizontally
    pauseBtn.style.userSelect = 'none';
    pauseBtn.style.webkitTapHighlightColor = 'transparent';

    pauseBtn.addEventListener('click', togglePause);
    // Add touchstart for potentially faster response on mobile? (Optional)
    // pauseBtn.addEventListener('touchstart', (e) => { e.preventDefault(); togglePause(); });

    gameContainer.appendChild(pauseBtn);
}

// Muat gambar burung
const birdImage = new Image();
birdImage.src = 'burung.png'; // Pastikan path ini benar
birdImage.onload = () => {
    console.log("Gambar burung dimuat.");
    // Gambar ulang tampilan awal jika game belum dimulai, sekarang dg gambar
    if (!gameStarted) {
        drawInitialScreen();
    }
};
birdImage.onerror = () => {
    console.error("Gagal memuat gambar burung! Menggunakan fallback.");
    // Gambar ulang tampilan awal dg fallback jika game belum dimulai
    if (!gameStarted) {
        drawInitialScreen();
    }
};


// Fungsi untuk menggambar burung (dari gambar atau fallback)
function drawBird() {
    // Gambar burung jika gambar sudah dimuat, valid, dan canvas punya dimensi
    if (birdImage.complete && birdImage.naturalWidth !== 0 && canvas.width > 0 && canvas.height > 0) {
        ctx.drawImage(birdImage, bird.x, bird.y, bird.width, bird.height);
    } else if (canvas.width > 0 && canvas.height > 0) {
        // Fallback jika gambar gagal dimuat atau canvas belum siap
        ctx.fillStyle = "#FFFF00"; // Warna kuning placeholder
        ctx.fillRect(bird.x, bird.y, bird.width, bird.height);
    }
}

// --- Gambar Pipa (Simplified Gradient Style) ---

function getPipeStyle() {
    let color1, color2;
    const level = getCurrentLevel();

    switch (level) {
        case 1: color1 = '#5DBE3F'; color2 = '#3E892E'; break; // Hijau
        case 2: color1 = '#5BC0EB'; color2 = '#2E7DAF'; break; // Biru
        case 3: color1 = '#F26C4F'; color2 = '#C1272D'; break; // Merah
        case 4: color1 = '#A76FB9'; color2 = '#76438A'; break; // Ungu
        default: color1 = '#FBB040'; color2 = '#F7941E'; break; // Oranye (Level 5+)
    }

    // Create gradient relative to pipe orientation (vertical)
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height); // Gradient top to bottom
    gradient.addColorStop(0, color1);    // Lighter color usually at one end
    gradient.addColorStop(1, color2); // Darker color at the other

    return gradient;
}


function getCurrentLevel() {
    return Math.floor(score / 10) + 1;
}

function adjustDifficulty() {
    // Hanya adjust jika naik level (skor kelipatan 10 dan bukan 0)
    if (score > 0 && score % 10 === 0) {
         const level = getCurrentLevel();
         // Peningkatan: kecepatan +8%, interval spawn -4% per 10 skor
         pipeSpeed *= 1.08;
         // Batas bawah interval spawn (misal 60 frame)
         pipeSpawnInterval = Math.max(isMobile ? 80 : 60, Math.round(pipeSpawnInterval * 0.96));
         // pipeGap sudah diatur relatif, mungkin tidak perlu diubah drastis
         // pipeGap = Math.max(100, pipeGap * 0.98); // Optional: reduce gap slightly

         console.log(`Level Up ${level}! Speed: ${pipeSpeed.toFixed(2)}, Spawn Interval: ${pipeSpawnInterval}`);
         playSound(successBuffer); // Mainkan suara naik level
    }
}

// Deteksi tabrakan (dengan toleransi kecil)
function checkCollision(pipe) {
    // Toleransi tabrakan (persentase dari ukuran burung)
    // Sedikit lebih besar bisa membuat game terasa lebih 'adil'
    const toleranceRatio = 0.15; // 15%
    const birdToleranceX = bird.width * toleranceRatio;
    const birdToleranceY = bird.height * toleranceRatio;

    // Hitbox burung yang sedikit lebih kecil
    const birdHitboxX = bird.x + birdToleranceX;
    const birdHitboxY = bird.y + birdToleranceY;
    const birdHitboxWidth = bird.width - 2 * birdToleranceX;
    const birdHitboxHeight = bird.height - 2 * birdToleranceY;

    // Dimensi pipa (konsisten dengan drawPipes)
    const pipeBodyWidth = 50; // Lebar utama
    const pipeEdgeWidth = 60; // Lebar termasuk tepi
    const pipeEdgeHeight = 15; // Tinggi tepi
    const pipeX = pipe.x;
    const pipeTopOpeningY = pipe.top; // Posisi Y bawah pipa atas
    const pipeBottomOpeningY = canvas.height - pipe.bottom; // Posisi Y atas pipa bawah

    // Koordinat X tepi pipa
    const pipeEdgeStartX = pipeX - (pipeEdgeWidth - pipeBodyWidth) / 2;
    const pipeEdgeEndX = pipeEdgeStartX + pipeEdgeWidth;
    // Koordinat X badan pipa
    const pipeBodyStartX = pipeX;
    const pipeBodyEndX = pipeBodyStartX + pipeBodyWidth;

    // 1. Cek tabrakan X (apakah burung berada di area horizontal pipa?)
    const collisionX = birdHitboxX + birdHitboxWidth > pipeEdgeStartX && birdHitboxX < pipeEdgeEndX;

    if (!collisionX) return false; // Jika tidak di area X, tidak mungkin tabrakan

    // 2. Cek tabrakan Y (jika di area X, apakah menyentuh bagian solid pipa?)

    // Tabrakan dengan pipa ATAS (termasuk tepi)
    const collisionTop = birdHitboxY < pipeTopOpeningY + pipeEdgeHeight; // Cek terhadap bagian bawah tepi pipa atas

    // Tabrakan dengan pipa BAWAH (termasuk tepi)
    const collisionBottom = birdHitboxY + birdHitboxHeight > pipeBottomOpeningY - pipeEdgeHeight; // Cek terhadap bagian atas tepi pipa bawah

    return collisionTop || collisionBottom; // Jika menyentuh salah satu, terjadi tabrakan
}

// Fungsi untuk membuat dan menggambar pipa
function drawPipes() {
    // Tambah pipa baru secara berkala
    if (frameCount % pipeSpawnInterval === 0) {
        // Pastikan pipeGap sudah dihitung oleh resizeCanvas
        const minTop = canvas.height * 0.1; // Min 10% dari atas
        const maxTop = canvas.height - pipeGap - (canvas.height * 0.1); // Max 10% dari bawah
        let topPipeHeight = Math.floor(Math.random() * (maxTop - minTop + 1)) + minTop;
        // Pastikan height tidak negatif jika gap terlalu besar/random aneh
        topPipeHeight = Math.max(50, topPipeHeight); // Min height pipa atas
        let bottomPipeHeight = canvas.height - topPipeHeight - pipeGap;
        bottomPipeHeight = Math.max(50, bottomPipeHeight); // Min height pipa bawah
        // Adjust top if bottom needed adjustment
        topPipeHeight = canvas.height - bottomPipeHeight - pipeGap;


        pipes.push({
            x: canvas.width,
            top: topPipeHeight,      // Ketinggian bagian solid pipa atas
            bottom: bottomPipeHeight,// Ketinggian bagian solid pipa bawah
            scored: false
        });
    }

    // Gambar dan update semua pipa
    ctx.fillStyle = getPipeStyle(); // Ambil style gradien berdasarkan skor

    for (let i = pipes.length - 1; i >= 0; i--) {
        pipes[i].x -= pipeSpeed;

        const pipeWidth = 50; // Lebar badan
        const pipeEdgeWidth = 60; // Lebar tepi
        const pipeEdgeHeight = 15; // Tinggi tepi
        const pipeX = pipes[i].x;
        const topSolidHeight = pipes[i].top; // Tinggi solid atas
        const bottomSolidHeight = pipes[i].bottom; // Tinggi solid bawah
        const bottomPipeY = canvas.height - bottomSolidHeight; // Y mulai pipa bawah

        // Koordinat tepi (sedikit lebih lebar)
        const edgeX = pipeX - (pipeEdgeWidth - pipeWidth) / 2;

        // Gambar Pipa Atas (Badan)
        ctx.fillRect(pipeX, 0, pipeWidth, topSolidHeight);
        // Gambar Tepi Pipa Atas
        ctx.fillRect(edgeX, topSolidHeight - pipeEdgeHeight, pipeEdgeWidth, pipeEdgeHeight);

        // Gambar Pipa Bawah (Badan)
        ctx.fillRect(pipeX, bottomPipeY, pipeWidth, bottomSolidHeight);
        // Gambar Tepi Pipa Bawah
        ctx.fillRect(edgeX, bottomPipeY, pipeEdgeWidth, pipeEdgeHeight);


        // Deteksi tabrakan (gunakan fungsi checkCollision)
        if (checkCollision(pipes[i])) {
            gameOver = true;
            gameStarted = false;
            playSound(gameOverBuffer);
            gameContainer.classList.remove('game-active');
            gameContainer.classList.add('game-over');
            if (pauseBtn) pauseBtn.style.display = 'none';
            break; // Stop checking other pipes
        }

        // Tambah skor jika burung melewati bagian TENGAH pipa (lebih akurat)
        const pipeCenterX = pipes[i].x + pipeWidth / 2;
        if (pipeCenterX < bird.x && !pipes[i].scored) {
            score++;
            pipes[i].scored = true;
            playSound(scoreBuffer);
            adjustDifficulty(); // Cek naik level
        }

        // Hapus pipa yang sudah keluar layar (berdasarkan tepi terluarnya)
        if (pipes[i].x < -pipeEdgeWidth) {
            pipes.splice(i, 1);
        }
    }
}

// Fungsi untuk menggambar UI (Skor, Level, Pesan)
function drawUI() {
    const fontSizeScore = Math.max(18, Math.floor(canvas.width / 25)); // Ukuran font skor
    const fontSizeLevel = Math.max(14, Math.floor(canvas.width / 30)); // Ukuran font level
    const uiPadding = 10; // Jarak dari tepi

    ctx.fillStyle = "#FFFFFF";
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 2; // Ketebalan outline

    // Gambar Skor
    ctx.font = `bold ${fontSizeScore}px Arial`;
    ctx.textAlign = "left";
    const scoreText = "Skor: " + score;
    ctx.strokeText(scoreText, uiPadding, fontSizeScore + uiPadding);
    ctx.fillText(scoreText, uiPadding, fontSizeScore + uiPadding);

    // Gambar Level
    ctx.font = `bold ${fontSizeLevel}px Arial`;
    ctx.textAlign = "right";
    const levelText = `Level: ${getCurrentLevel()}`;
    ctx.strokeText(levelText, canvas.width - uiPadding, fontSizeLevel + uiPadding);
    ctx.fillText(levelText, canvas.width - uiPadding, fontSizeLevel + uiPadding);

    // Tampilkan pesan Game Over
    if (gameOver) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.6)"; // Overlay gelap transparan
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
        ctx.font = `normal ${restartFontSize}px Arial`; // Normal weight for instruction
        const restartText = "Tekan 'Main Lagi'";
        const restartTextY = textY + gameOverFontSize * 0.8 + restartFontSize; // Position below "Game Over"
        ctx.strokeText(restartText, canvas.width / 2, restartTextY);
        ctx.fillText(restartText, canvas.width / 2, restartTextY);
    }

    // Tampilkan pesan Paused
    if (isPaused && !gameOver) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
        ctx.fillRect(0, 0, canvas.width, canvas.height); // Overlay gelap

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


// Fungsi untuk reset permainan
function resetGame() {
    // Cukup panggil startGame(), karena sudah menghandle reset state internal
    startGame();
}

// Fungsi utama game loop
let animationFrameId;
function update() {
    // Hentikan loop jika game over
    if (gameOver) {
        drawUI(); // Hanya gambar UI game over
        return;
    }

    // Hentikan loop jika dijeda
    if (isPaused) {
        // Gambar state terakhir + UI pause, tapi jangan update state
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawPipes();
        drawBird();
        drawUI(); // Gambar UI (termasuk pesan pause)
        // Jangan request frame berikutnya
        return;
    }


    // --- Update Game State ---
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

    // Tabrakan Atas (cegah terbang ke atas tak terbatas)
    if (bird.y < 0) {
        bird.y = 0;
        bird.velocity = 0;
    }

    // Pipa (Update posisi, gambar, cek tabrakan, cek skor, hapus yg keluar)
    // Memanggil drawPipes juga melakukan update posisi & logika pipa
    drawPipes(); // Menggambar & mengupdate pipa

    // Gambar Burung (setelah pipa, sebelum UI)
    drawBird();

    // Gambar UI (skor, level)
    drawUI();

    // Tingkatkan frame count
    frameCount++;

    // Minta frame animasi berikutnya jika game masih berjalan
    if (!gameOver && !isPaused) {
         animationFrameId = requestAnimationFrame(update);
    }
}

// Fungsi menggambar tampilan awal
function drawInitialScreen() {
    // Pastikan canvas bersih dan punya dimensi
    if (canvas.width > 0 && canvas.height > 0) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Gambar burung di posisi awal (pastikan posisi sudah di-reset oleh resize)
        drawBird();

        // Tampilkan pesan untuk memulai
        ctx.fillStyle = "#FFFFFF";
        ctx.strokeStyle = "#000000";
        ctx.lineWidth = 2;
        ctx.textAlign = "center";
        const startFontSize = Math.max(18, Math.floor(canvas.width / 22));
        ctx.font = `bold ${startFontSize}px Arial`;
        const startText = "Tekan 'Mulai Permainan'";
        const textY = canvas.height / 2 + bird.height + 30; // Posisikan di bawah burung
        ctx.strokeText(startText, canvas.width / 2, textY);
        ctx.fillText(startText, canvas.width / 2, textY);
    }
}


// Fungsi inisialisasi game
function initGame() {
    addPauseButton();   // Tambahkan tombol pause ke DOM
    resizeCanvas();     // Sesuaikan ukuran canvas saat pertama kali load
    updateSoundButton(); // Set ikon tombol suara awal
    // Tidak perlu memanggil update() di sini, itu dimulai oleh startGame()
    // Tampilan awal digambar oleh resizeCanvas -> drawInitialScreen
}

// Jalankan inisialisasi game saat script dimuat
initGame();