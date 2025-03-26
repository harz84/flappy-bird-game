const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const gameContainer = document.getElementById("gameContainer");
const startButton = document.getElementById("startButton");
const restartButton = document.getElementById("restartButton");
const soundButton = document.getElementById("soundToggle"); // Reference for potential future use

// Deteksi perangkat mobile
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

// Variabel untuk offscreen rendering (Tidak diperlukan lagi untuk pola)
// const offscreenCanvas = document.createElement('canvas');
// const offscreenCtx = offscreenCanvas.getContext('2d');
// const pipePatterns = { ... }; // Dihapus

// Fungsi untuk menyesuaikan canvas dengan ukuran layar
function resizeCanvas() {
    const container = canvas.parentElement || document.body;
    let containerWidth = container.clientWidth || window.innerWidth;
    let containerHeight = container.clientHeight || window.innerHeight;

    // Clamp width to max width
    containerWidth = Math.min(containerWidth, 480);

    // Calculate target aspect ratio (e.g., 3:4 like original 480x640)
    const targetAspectRatio = 3 / 4;
    let canvasHeight = containerWidth / targetAspectRatio;

    // Ensure canvas fits within the available vertical space (e.g., 90vh from CSS)
    const maxHeight = containerHeight * 0.9;
    if (canvasHeight > maxHeight) {
        canvasHeight = maxHeight;
        // Optional: adjust width based on new height to maintain aspect ratio
        // containerWidth = canvasHeight * targetAspectRatio;
    }

    canvas.width = containerWidth;
    canvas.height = canvasHeight;

    // Perbarui ukuran burung berdasarkan ukuran canvas
    bird.width = Math.max(30, canvas.width * 0.1); // Bird size relative to width
    bird.height = bird.width * (2/3); // Maintain bird aspect ratio

    // Reset posisi burung ke tengah (vertikal) dan sisi kiri (horizontal)
    if (!gameOver) { // Only reset position if game is not over (avoids jump on resize)
         bird.x = canvas.width * 0.2;
         bird.y = canvas.height / 2 - bird.height / 2;
    }

    // Perbarui celah pipa berdasarkan tinggi canvas
    pipeGap = Math.max(150, canvas.height * 0.25); // Celah relatif terhadap tinggi canvas

    // (Tidak perlu lagi perbarui pola pipa)
    // createPipePatterns();
}

// Variabel permainan
let bird = {
    x: 50,
    y: 150,
    width: 60, // Akan di-override oleh resizeCanvas
    height: 40, // Akan di-override oleh resizeCanvas
    // --- PERUBAHAN GRAVITY & LIFT ---
    gravity: isMobile ? 0.11 : 0.14, // Gravitasi dikurangi (burung lebih ringan)
    lift: isMobile ? -9.5 : -11.4,   // Lompatan diperkuat 20% (lebih negatif)
    // --- AKHIR PERUBAHAN ---
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
const MIN_JUMP_INTERVAL = isMobile ? 250 : 150; // ms, sedikit lebih lama di mobile

// Variabel untuk kesulitan
let pipeSpeed = isMobile ? 1.05 : 1.2; // Kecepatan awal pipa (sedikit lebih lambat di mobile)
let pipeSpawnInterval = isMobile ? 150 : 120; // Jarak antar pipa (lebih jauh di mobile)
let pipeGap = 200; // Celah antar pipa (Akan di-override oleh resizeCanvas)

// Audio effects
let audioContext; // For better audio handling on mobile
let jumpBuffer, scoreBuffer, gameOverBuffer, startBuffer, successBuffer;

// Fungsi untuk memuat audio menggunakan Web Audio API
async function setupAudio() {
    if (audioInitialized) return;
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const loadSound = async (url) => {
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            return await audioContext.decodeAudioData(arrayBuffer);
        };

        [jumpBuffer, scoreBuffer, gameOverBuffer, startBuffer, successBuffer] = await Promise.all([
            loadSound('jump.wav'),
            loadSound('score.wav'),
            loadSound('gameover.wav'),
            loadSound('start.wav'),
            loadSound('success.mp3')
        ]);
        audioInitialized = true;
        console.log("Web Audio API initialized and sounds loaded.");
        // Update sound button based on initial state
        updateSoundButton();
    } catch (error) {
        console.error("Failed to initialize Web Audio API or load sounds:", error);
        // Fallback or disable audio
        soundEnabled = false;
        audioInitialized = false; // Mark as not initialized if error
        updateSoundButton();
    }
}

// Fungsi untuk memainkan suara (Web Audio API)
function playSound(buffer) {
    if (!soundEnabled || !audioInitialized || !buffer || !audioContext) return;
     // Resume context if suspended (common in mobile browsers before interaction)
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);
    source.start(0);
}

// Fungsi toggle suara
function toggleSound() {
    soundEnabled = !soundEnabled;
    updateSoundButton();
    // Initialize audio if toggled on for the first time by user
    if (soundEnabled && !audioInitialized) {
        setupAudio();
    }
}

// Update tampilan tombol suara
function updateSoundButton() {
    if (soundButton) {
         soundButton.textContent = soundEnabled ? "🔊" : "🔇";
    }
}


// Fungsi untuk menangani lompatan
function handleJump() {
    // Jangan lompat jika game belum dimulai atau sudah selesai atau dijeda
    if (!gameStarted || gameOver || isPaused) return;

    const now = Date.now();
    // Cegah spam tap/klik
    if (now - lastJumpTime < MIN_JUMP_INTERVAL) return;

    lastJumpTime = now;
    bird.velocity = bird.lift;
    playSound(jumpBuffer);
}

// --- Event Listeners ---

// Kontrol keyboard
document.addEventListener("keydown", function(event) {
    if (!gameStarted || gameOver) return; // Hanya berlaku saat game berjalan

    if ((event.key === " " || event.key === "ArrowUp" || event.key === "Shift") && !isPaused) {
        handleJump();
    }
    // Pause functionality remains (toggle with 'P')
    if (event.key.toLowerCase() === "p") {
        togglePause();
    }
});

// Kontrol sentuh untuk perangkat mobile (Hanya pada Canvas)
canvas.addEventListener("touchstart", function(event) {
    event.preventDefault(); // Mencegah scroll/zoom saat menyentuh canvas
    if (!gameStarted || gameOver) return; // Jangan lakukan apa-apa jika game belum/tidak aktif

    if (!isPaused) {
        handleJump();
    }
}, { passive: false });

// Tombol Mulai
startButton.addEventListener('click', startGame);

// Tombol Restart
restartButton.addEventListener('click', resetGame);

// Tombol Suara
soundButton.addEventListener('click', () => {
    // Initialize on first click if not already
    if (!audioInitialized) {
         setupAudio(); // Try setting up audio context on user interaction
    }
    toggleSound();
});

// Resize listener
window.addEventListener('resize', resizeCanvas);

// Prevent scrolling on body (more robust)
document.body.addEventListener('touchmove', function(event) {
   // Allow scrolling ONLY if the target is not the canvas or its container
   if (!canvas.contains(event.target)) {
       return;
   }
   event.preventDefault();
}, { passive: false });

// --- Game Functions ---

function startGame() {
    if (gameStarted) return; // Cegah mulai ganda
    gameStarted = true;
    gameOver = false;
    isPaused = false;
    score = 0;
    frameCount = 0; // Reset frame count
    pipes = []; // Kosongkan pipa

    // Reset posisi & kecepatan burung
    bird.y = canvas.height / 2 - bird.height / 2;
    bird.velocity = 0;

    // Reset kesulitan
    pipeSpeed = isMobile ? 1.3 : 1.5;
    pipeSpawnInterval = isMobile ? 150 : 120;
    // pipeGap direset di resizeCanvas

    // Setup audio jika belum
    if (!audioInitialized) {
        setupAudio().then(() => {
             playSound(startBuffer); // Mainkan suara start setelah audio siap
        });
    } else {
        playSound(startBuffer);
    }

    // Update UI state
    gameContainer.classList.add('game-active');
    gameContainer.classList.remove('game-over');
    if (pauseBtn) pauseBtn.style.display = 'block'; // Tampilkan tombol pause

    // Mulai game loop
    if (animationFrameId) cancelAnimationFrame(animationFrameId); // Hentikan loop lama jika ada
    update();
}


// Toggle pause
function togglePause() {
    if (gameOver || !gameStarted) return; // Tidak bisa pause jika game over atau belum mulai
    isPaused = !isPaused;
    if (pauseBtn) {
        pauseBtn.textContent = isPaused ? "▶️" : "⏸️";
    }
    // Jika melanjutkan, restart game loop
    if (!isPaused) {
        update();
    }
}

// Tambah tombol pause (jika belum ada)
let pauseBtn;
function addPauseButton() {
    if (document.getElementById('pauseBtn')) return; // Jangan tambah jika sudah ada

    pauseBtn = document.createElement('button');
    pauseBtn.id = 'pauseBtn';
    pauseBtn.textContent = "⏸️";
    pauseBtn.style.position = "absolute";
    pauseBtn.style.top = "15px"; // Beri jarak sedikit dari atas
    pauseBtn.style.right = "15px"; // Beri jarak sedikit dari kanan
    pauseBtn.style.zIndex = "100";
    pauseBtn.style.fontSize = "24px";
    pauseBtn.style.backgroundColor = "rgba(255,255,255,0.6)";
    pauseBtn.style.border = "none";
    pauseBtn.style.borderRadius = "50%";
    pauseBtn.style.width = "45px"; // Sedikit lebih besar
    pauseBtn.style.height = "45px";
    pauseBtn.style.padding = "0";
    pauseBtn.style.cursor = "pointer";
    pauseBtn.style.display = 'none'; // Sembunyikan awalnya
    pauseBtn.style.lineHeight = '45px'; // Bantu vertikal align icon
     pauseBtn.style.textAlign = 'center';
    pauseBtn.addEventListener('click', togglePause);

    gameContainer.appendChild(pauseBtn); // Tambahkan ke container utama
}

// Muat gambar burung
const birdImage = new Image();
birdImage.src = 'burung.png'; // Pastikan path ini benar

// Fungsi untuk menggambar burung dari gambar
function drawBird() {
    // Gambar burung jika gambar sudah dimuat dan valid
    if (birdImage.complete && birdImage.naturalWidth !== 0) {
        ctx.drawImage(birdImage, bird.x, bird.y, bird.width, bird.height);
    } else {
        // Fallback jika gambar gagal dimuat
        ctx.fillStyle = "#FFFF00"; // Warna kuning placeholder
        ctx.fillRect(bird.x, bird.y, bird.width, bird.height);
    }
}

// --- Penyederhanaan Gambar Pipa ---

// Fungsi untuk menentukan warna pipa berdasarkan skor (menggunakan gradien)
function getPipeStyle() {
    let gradient;
    const pipeWidth = 50; // Lebar pipa tetap

    if (score < 10) { // Level 1: Hijau
        gradient = ctx.createLinearGradient(0, 0, pipeWidth, 0);
        gradient.addColorStop(0, '#5DBE3F'); // Hijau terang
        gradient.addColorStop(1, '#3E892E'); // Hijau gelap
    } else if (score < 20) { // Level 2: Biru
        gradient = ctx.createLinearGradient(0, 0, pipeWidth, 0);
        gradient.addColorStop(0, '#5BC0EB'); // Biru terang
        gradient.addColorStop(1, '#2E7DAF'); // Biru gelap
    } else if (score < 30) { // Level 3: Merah
        gradient = ctx.createLinearGradient(0, 0, pipeWidth, 0);
        gradient.addColorStop(0, '#F26C4F'); // Merah terang
        gradient.addColorStop(1, '#C1272D'); // Merah gelap
    } else { // Level 4+: Ungu
        gradient = ctx.createLinearGradient(0, 0, pipeWidth, 0);
        gradient.addColorStop(0, '#A76FB9'); // Ungu terang
        gradient.addColorStop(1, '#76438A'); // Ungu gelap
    }
    return gradient;
}


// Fungsi untuk mendapatkan level saat ini
function getCurrentLevel() {
    return Math.floor(score / 10) + 1;
}

// Fungsi untuk menyesuaikan kesulitan berdasarkan skor
function adjustDifficulty() {
    const level = getCurrentLevel();
    // Hanya adjust jika naik level
    if (score > 0 && score % 10 === 0) {
         // Contoh peningkatan: kecepatan +10%, interval spawn -5% per 10 skor
         pipeSpeed *= 1.10;
         pipeSpawnInterval = Math.max(60, Math.round(pipeSpawnInterval * 0.95)); // Batas bawah interval spawn
         // Celah pipa (pipeGap) sudah diatur relatif terhadap tinggi layar, jadi mungkin tidak perlu diubah di sini
         console.log(`Level Up ${level}! Speed: ${pipeSpeed.toFixed(2)}, Spawn Interval: ${pipeSpawnInterval}`);
         playSound(successBuffer);
    }
}

// Deteksi tabrakan (sedikit lebih toleran)
function checkCollision(pipe) {
    const tolerance = 0.1; // 10% toleransi dari ukuran burung
    const birdHitboxX = bird.x + bird.width * tolerance;
    const birdHitboxY = bird.y + bird.height * tolerance;
    const birdHitboxWidth = bird.width * (1 - 2 * tolerance);
    const birdHitboxHeight = bird.height * (1 - 2 * tolerance);

    const pipeWidth = 50; // Lebar pipa
    const pipeEdgeWidth = 60; // Lebar tepi pipa

    // Cek tabrakan dengan badan pipa utama (lebar 50)
     const bodyCollision = birdHitboxX + birdHitboxWidth > pipe.x &&
                           birdHitboxX < pipe.x + pipeWidth &&
                           (birdHitboxY < pipe.top || birdHitboxY + birdHitboxHeight > canvas.height - pipe.bottom);

    // Cek tabrakan dengan tepi pipa (lebar 60, sedikit lebih lebar)
    const edgeCollision = birdHitboxX + birdHitboxWidth > pipe.x - 5 && // Tepi dimulai 5px sebelum badan
                          birdHitboxX < pipe.x + pipeWidth + 5 && // Tepi berakhir 5px setelah badan
                          ( (birdHitboxY < pipe.top + 15 && birdHitboxY + birdHitboxHeight > pipe.top) || // Tepi atas
                            (birdHitboxY < canvas.height - pipe.bottom && birdHitboxY + birdHitboxHeight > canvas.height - pipe.bottom - 15) ); // Tepi bawah


    return bodyCollision || edgeCollision;
}

// Fungsi untuk membuat dan menggambar pipa (diserdehanakan)
function drawPipes() {
    // Tambah pipa baru secara berkala
    if (frameCount % pipeSpawnInterval === 0) {
        // Pastikan pipeGap sudah dihitung oleh resizeCanvas
        const minTop = 50; // Jarak minimal dari atas
        const maxTop = canvas.height - pipeGap - 50; // Jarak maksimal dari atas (menyisakan ruang untuk celah & pipa bawah)
        let topPipeHeight = Math.floor(Math.random() * (maxTop - minTop + 1)) + minTop;
        let bottomPipeHeight = canvas.height - topPipeHeight - pipeGap;

        pipes.push({
            x: canvas.width,
            top: topPipeHeight, // Tinggi bagian atas (yang kosong)
            bottom: bottomPipeHeight, // Tinggi bagian bawah (yang kosong)
            scored: false
        });
    }

    // Gambar dan update semua pipa
    ctx.fillStyle = getPipeStyle(); // Ambil style gradien berdasarkan skor

    for (let i = pipes.length - 1; i >= 0; i--) {
        pipes[i].x -= pipeSpeed;

        const pipeWidth = 50;
        const pipeEdgeWidth = 60; // Lebar untuk 'cap'
        const pipeEdgeHeight = 15; // Tinggi untuk 'cap'
        const pipeX = pipes[i].x;
        const pipeTopHeight = pipes[i].top; // Ini adalah tinggi ruang kosong di atas pipa bawah
        const pipeBottomHeight = pipes[i].bottom; // Ini adalah tinggi ruang kosong di bawah pipa atas

        // Gambar Pipa Atas
        ctx.fillRect(pipeX, 0, pipeWidth, pipeTopHeight);
        // Gambar Tepi Pipa Atas (sedikit lebih lebar)
        ctx.fillRect(pipeX - (pipeEdgeWidth - pipeWidth) / 2, pipeTopHeight - pipeEdgeHeight, pipeEdgeWidth, pipeEdgeHeight);

        // Gambar Pipa Bawah
        ctx.fillRect(pipeX, canvas.height - pipeBottomHeight, pipeWidth, pipeBottomHeight);
        // Gambar Tepi Pipa Bawah (sedikit lebih lebar)
        ctx.fillRect(pipeX - (pipeEdgeWidth - pipeWidth) / 2, canvas.height - pipeBottomHeight, pipeEdgeWidth, pipeEdgeHeight);


        // Deteksi tabrakan
        if (checkCollision(pipes[i])) {
            gameOver = true;
            gameStarted = false; // Tandai game tidak aktif lagi
            playSound(gameOverBuffer);
            gameContainer.classList.remove('game-active');
            gameContainer.classList.add('game-over');
            if (pauseBtn) pauseBtn.style.display = 'none'; // Sembunyikan tombol pause
            break; // Hentikan loop pipa jika game over
        }

        // Tambah skor jika burung melewati pipa
        if (pipes[i].x + pipeWidth < bird.x && !pipes[i].scored) {
            score++;
            pipes[i].scored = true;
            playSound(scoreBuffer);
            adjustDifficulty(); // Cek apakah perlu naik level
        }

        // Hapus pipa yang sudah keluar layar
        if (pipes[i].x < -pipeEdgeWidth) { // Gunakan lebar tepi untuk menghapus
            pipes.splice(i, 1);
        }
    }
}

// Fungsi untuk menggambar UI (Skor, Level, Pesan)
function drawUI() {
    const fontSize = Math.max(16, Math.floor(canvas.width / 20)); // Ukuran font relatif

    // Gambar Skor
    ctx.fillStyle = "#FFFFFF"; // Warna putih agar kontras
    ctx.strokeStyle = "#000000"; // Outline hitam
    ctx.lineWidth = 2;
    ctx.font = `bold ${fontSize}px Arial`;
    ctx.textAlign = "left";
    const scoreText = "Score: " + score;
    ctx.strokeText(scoreText, 10, fontSize + 5);
    ctx.fillText(scoreText, 10, fontSize + 5);

    // Gambar Level
    const level = getCurrentLevel();
    const levelText = `Level: ${level}`;
    ctx.textAlign = "right";
    ctx.strokeText(levelText, canvas.width - 10, fontSize + 5);
    ctx.fillText(levelText, canvas.width - 10, fontSize + 5);

    // Tampilkan pesan Game Over
    if (gameOver) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.6)"; // Overlay gelap
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = "#FFFFFF";
        ctx.strokeStyle = "#000000";
        ctx.lineWidth = 3;
        ctx.textAlign = "center";

        const gameOverFontSize = Math.max(24, Math.floor(canvas.width / 10));
        ctx.font = `bold ${gameOverFontSize}px Arial`;
        const gameOverText = "Game Over";
        ctx.strokeText(gameOverText, canvas.width / 2, canvas.height / 2 - gameOverFontSize / 2);
        ctx.fillText(gameOverText, canvas.width / 2, canvas.height / 2 - gameOverFontSize / 2);


        const restartFontSize = Math.max(16, Math.floor(canvas.width / 25));
        ctx.font = `${restartFontSize}px Arial`;
        const restartText = "Tekan 'Main Lagi'"; // Pesan sesuai tombol
        ctx.strokeText(restartText, canvas.width / 2, canvas.height / 2 + restartFontSize * 1.5);
        ctx.fillText(restartText, canvas.width / 2, canvas.height / 2 + restartFontSize * 1.5);
    }

    // Tampilkan pesan Paused
    if (isPaused && !gameOver) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
        ctx.textAlign = "center";
        const pausedFontSize = Math.max(20, Math.floor(canvas.width / 15));
        ctx.font = `bold ${pausedFontSize}px Arial`;
        ctx.fillStyle = "#FFFFFF";
        ctx.fillText("PAUSED", canvas.width / 2, canvas.height / 2);
    }
}


// Fungsi untuk reset permainan (dipanggil oleh tombol Main Lagi)
function resetGame() {
    // Cukup panggil startGame() lagi, karena sudah menghandle reset state
    startGame();
}

// Fungsi utama game loop
let animationFrameId;
function update() {
    // Hentikan loop jika game over
    if (gameOver) {
        drawUI(); // Tetap gambar UI game over
        return;
    }

    // Hentikan loop jika dijeda
    if (isPaused) {
        // Tetap gambar state terakhir sebelum pause + UI pause
        ctx.clearRect(0, 0, canvas.width, canvas.height); // Bersihkan canvas
        drawPipes(); // Gambar pipa di posisi terakhir
        drawBird(); // Gambar burung di posisi terakhir
        drawUI(); // Gambar UI (termasuk pesan pause)
        // Jangan panggil requestAnimationFrame lagi sampai di-resume
        return;
    }


    // Bersihkan Canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Update Posisi Burung
    bird.velocity += bird.gravity;
    bird.y += bird.velocity;

    // Cek Tabrakan dengan Batas Bawah Layar
    if (bird.y + bird.height > canvas.height) {
        bird.y = canvas.height - bird.height; // Posisikan di dasar
        bird.velocity = 0;
        gameOver = true;
        gameStarted = false;
        playSound(gameOverBuffer);
        gameContainer.classList.remove('game-active');
        gameContainer.classList.add('game-over');
         if (pauseBtn) pauseBtn.style.display = 'none';
    }

    // Cek Tabrakan dengan Batas Atas Layar (opsional, cegah terbang ke atas)
    if (bird.y < 0) {
        bird.y = 0;
        bird.velocity = 0; // Hentikan momentum ke atas
    }

    // Gambar elemen-elemen game
    drawPipes(); // Gambar pipa dulu (latar belakang)
    drawBird(); // Gambar burung di atas pipa
    drawUI(); // Gambar skor dll di atas segalanya

    // Tingkatkan frame count
    frameCount++;

    // Minta frame animasi berikutnya
    animationFrameId = requestAnimationFrame(update);
}

// Fungsi inisialisasi game
function initGame() {
    addPauseButton(); // Tambahkan tombol pause ke DOM
    resizeCanvas(); // Sesuaikan ukuran canvas saat pertama kali load
    updateSoundButton(); // Set ikon tombol suara awal

    // Gambar tampilan awal (sebelum game dimulai)
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBird(); // Gambar burung di posisi awal
    // Tampilkan pesan untuk memulai
    ctx.fillStyle = "#FFFFFF";
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 2;
    ctx.textAlign = "center";
    const startFontSize = Math.max(18, Math.floor(canvas.width / 22));
    ctx.font = `bold ${startFontSize}px Arial`;
    const startText = "Tekan 'Mulai Permainan'";
    ctx.strokeText(startText, canvas.width / 2, canvas.height / 2 + 50);
    ctx.fillText(startText, canvas.width / 2, canvas.height / 2 + 50);


    // Memastikan gambar burung dimuat sebelum game loop dimulai (jika perlu)
    if (!birdImage.complete) {
        birdImage.onload = () => {
            console.log("Gambar burung dimuat.");
            // Gambar ulang tampilan awal setelah gambar siap
            if (!gameStarted) {
                 ctx.clearRect(0, 0, canvas.width, canvas.height);
                 drawBird();
                 ctx.fillStyle = "#FFFFFF"; // Warna teks
                 ctx.strokeStyle = "#000000"; // Outline
                 ctx.lineWidth = 2;
                 ctx.textAlign = "center";
                 ctx.font = `bold ${startFontSize}px Arial`;
                 ctx.strokeText(startText, canvas.width / 2, canvas.height / 2 + 50);
                 ctx.fillText(startText, canvas.width / 2, canvas.height / 2 + 50);
            }
        };
        birdImage.onerror = () => {
            console.error("Gagal memuat gambar burung!");
        };
    }
}

// Jalankan inisialisasi game
initGame();