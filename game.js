const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// Variabel permainan
let bird = {
    x: 50,
    y: 150,
    width: 60,
    height: 40,
    gravity: 0.3,
    lift: -6,
    velocity: 0
};

let pipes = [];
let frameCount = 0;
let score = 0;
let gameOver = false;
let audioInitialized = false;

// Variabel untuk kesulitan
let pipeSpeed = 1.5; // Kecepatan awal pipa (Level 1)
let pipeSpawnInterval = 150; // Jarak antar pipa (Level 1)
let pipeGap = 200; // Celah antar pipa (Level 1)

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
        document.addEventListener('keydown', () => {
            audio.play().catch(err => console.log("Retry audio play failed: ", err));
        }, { once: true });
    });
}

// Event listener untuk mendeteksi akhir suara start
audioStart.onended = () => {
    isStartPlaying = false;
    if (jumpQueue) {
        playSound(audioJump); // Putar jump yang tertunda
        jumpQueue = false;   // Kosongkan antrian
    }
};

// Fungsi untuk menangani lompatan
function handleJump() {
    bird.velocity = bird.lift; // Selalu izinkan lompat
    if (isStartPlaying) {
        jumpQueue = true; // Tambahkan ke antrian jika start masih berjalan
    } else {
        playSound(audioJump); // Putar langsung jika start selesai
    }
}

// Kontrol keyboard
document.addEventListener("keydown", function(event) {
    if ((event.key === " " || event.shiftKey) && !gameOver) {
        handleJump(); // Panggil fungsi lompatan untuk Spasi atau Shift
        if (!audioInitialized) {
            playSound(audioStart);
        }
    }
    if (event.key.toLowerCase() === "r" && gameOver) {
        resetGame();
    }
});

// Kontrol sentuh untuk perangkat mobile
canvas.addEventListener("touchstart", function(event) {
    event.preventDefault(); // Mencegah scroll atau zoom saat disentuh
    if (!gameOver) {
        handleJump(); // Panggil fungsi lompatan saat layar disentuh
        if (!audioInitialized) {
            playSound(audioStart);
        }
    }
}, { passive: false });

// Muat gambar burung
const birdImage = new Image();
birdImage.src = 'burung.png';

// Fungsi untuk menggambar burung dari gambar
function drawBird() {
    if (birdImage.complete && birdImage.naturalWidth !== 0) {
        ctx.drawImage(birdImage, bird.x, bird.y, bird.width, bird.height);
    } else {
        console.log("Gambar burung belum dimuat atau rusak!");
        ctx.fillStyle = "#FFFF00"; // Warna kuning sebagai placeholder jika gambar gagal
        ctx.fillRect(bird.x, bird.y, bird.width, bird.height);
    }
}

// Fungsi untuk menggambar pola bata
function drawBrickPattern(x, y, width, height) {
    const brickWidth = 25;  // Lebar bata disesuaikan untuk detail lebih realistis
    const brickHeight = 15; // Tinggi bata
    const brickColor = ctx.createLinearGradient(x, y, x + width, y);
    brickColor.addColorStop(0, '#FF6347'); // Merah terang (tomato)
    brickColor.addColorStop(1, '#FA8072'); // Merah muda (salmon)
    ctx.fillStyle = brickColor;

    for (let row = 0; row < Math.ceil(height / brickHeight); row++) {
        for (let col = 0; col < Math.ceil(width / brickWidth); col++) {
            const brickX = x + col * brickWidth + (row % 2 === 0 ? 0 : brickWidth / 2); // Offset bergantian
            const brickY = y + row * brickHeight;
            ctx.fillRect(brickX, brickY, brickWidth - 2, brickHeight - 2); // Mengurangi 2 untuk garis
            ctx.strokeStyle = '#808080'; // Garis abu-abu untuk mortar
            ctx.lineWidth = 2;
            ctx.strokeRect(brickX, brickY, brickWidth - 2, brickHeight - 2);
        }
    }
}

// Fungsi untuk menggambar pola bambu dengan tangkai dan daun
function drawBambooPattern(x, y, width, height) {
    const bambooColor = ctx.createLinearGradient(x, y, x + width, y);
    bambooColor.addColorStop(0, '#228B22'); // Hijau tua (forestgreen)
    bambooColor.addColorStop(1, '#2E8B57'); // Hijau lebih terang (seagreen)
    ctx.fillStyle = bambooColor;
    ctx.fillRect(x, y, width, height); // Gambar batang bambu

    const segmentHeight = 100; // Tinggi setiap ruas bambu
    ctx.strokeStyle = '#8B4513'; // Cokelat tua untuk ruas
    ctx.lineWidth = 3;

    // Gambar ruas bambu
    for (let i = 0; i < Math.ceil(height / segmentHeight); i++) {
        const segmentY = y + i * segmentHeight;
        if (segmentY < y + height) {
            ctx.beginPath();
            ctx.moveTo(x, segmentY);
            ctx.lineTo(x + width, segmentY);
            ctx.stroke();

            // Gambar tangkai dan daun pada setiap ruas (bergantian kiri/kanan)
            const side = i % 2 === 0 ? 'left' : 'right'; // Bergantian kiri dan kanan
            const stemX = side === 'left' ? x : x + width;
            const stemEndX = side === 'left' ? x - 20 : x + width + 20;
            const stemY = segmentY + 10;

            // Gambar tangkai
            ctx.beginPath();
            ctx.strokeStyle = '#8B4513'; // Cokelat tua untuk tangkai
            ctx.lineWidth = 1;
            ctx.moveTo(stemX, stemY);
            ctx.lineTo(stemEndX, stemY - 10); // Tangkai sedikit miring ke atas
            ctx.stroke();

            // Gambar daun (elips sederhana)
            ctx.fillStyle = '#32CD32'; // Hijau terang untuk daun
            ctx.beginPath();
            ctx.ellipse(stemEndX, stemY - 10, 8, 3, side === 'left' ? Math.PI / 4 : -Math.PI / 4, 0, 2 * Math.PI); // Daun miring
            ctx.fill();
        }
    }
}

// Fungsi untuk menggambar pola kayu
function drawWoodPattern(x, y, width, height) {
    const woodColor = ctx.createLinearGradient(x, y, x + width, y);
    woodColor.addColorStop(0, '#8B4513'); // Cokelat tua (saddlebrown)
    woodColor.addColorStop(1, '#D2B48C'); // Cokelat terang (tan)
    ctx.fillStyle = woodColor;
    ctx.fillRect(x, y, width, height); // Gambar tekstur kayu dasar

    // Tambahkan serat kayu (garis horizontal dan vertikal)
    ctx.strokeStyle = '#A0522D'; // Cokelat kemerahan untuk serat
    ctx.lineWidth = 1;

    // Garis horizontal (serat kayu)
    for (let i = 0; i < height; i += 10) {
        ctx.beginPath();
        ctx.moveTo(x, y + i);
        ctx.lineTo(x + width, y + i);
        ctx.stroke();
    }

    // Garis vertikal (serat tambahan)
    for (let i = 0; i < width; i += 15) {
        ctx.beginPath();
        ctx.moveTo(x + i, y);
        ctx.lineTo(x + i, y + height);
        ctx.stroke();
    }
}

// Fungsi untuk menggambar pola batu
function drawStonePattern(x, y, width, height) {
    const stoneColors = ['#D2B48C', '#F5F5DC', '#A9A9A9']; // Cokelat terang, krem, abu-abu
    ctx.fillStyle = stoneColors[Math.floor(Math.random() * stoneColors.length)];
    ctx.fillRect(x, y, width, height); // Dasar batu acak

    // Gambar batu-batu acak
    const stoneCount = 10; // Jumlah batu per area
    for (let i = 0; i < stoneCount; i++) {
        const stoneX = x + Math.random() * width;
        const stoneY = y + Math.random() * height;
        const stoneWidth = 20 + Math.random() * 30; // Lebar batu acak
        const stoneHeight = 15 + Math.random() * 20; // Tinggi batu acak
        ctx.fillStyle = stoneColors[Math.floor(Math.random() * stoneColors.length)];
        ctx.beginPath();
        ctx.ellipse(stoneX, stoneY, stoneWidth / 2, stoneHeight / 2, 0, 0, 2 * Math.PI);
        ctx.fill();
        ctx.strokeStyle = '#696969'; // Abu-abu gelap untuk tepi
        ctx.lineWidth = 1;
        ctx.stroke();
    }
}

// Fungsi untuk menentukan warna dan pola pipa berdasarkan skor
function getPipeColors() {
    if (score < 10) {
        return { body: ['#FF6347', '#FA8072'], edge: ['#FF6347', '#FA8072'], pattern: 'brick' }; // Pola bata merah terang
    } else if (score < 20) {
        return { body: ['#228B22', '#2E8B57'], edge: ['#228B22', '#2E8B57'], pattern: 'bamboo' }; // Pola bambu
    } else if (score < 30) {
        return { body: ['#8B4513', '#D2B48C'], edge: ['#8B4513', '#D2B48C'], pattern: 'wood' }; // Pola kayu
    } else {
        return { body: ['#D2B48C', '#F5F5DC'], edge: ['#A9A9A9', '#696969'], pattern: 'stone' }; // Pola batu
    }
}

// Fungsi untuk menyesuaikan kesulitan berdasarkan skor
function adjustDifficulty() {
    if (score === 10) {
        pipeSpeed = 1.5 * 1.15; // 15% lebih cepat
        pipeSpawnInterval = Math.round(150 * 0.85); // 15% lebih sering
        pipeGap = Math.round(200 * 0.85); // 15% lebih sempit
        playSound(audioSuccess); // Putar suara sukses
    } else if (score === 20) {
        pipeSpeed = 1.5 * 1.15 * 1.15; // 15% dari Level 2
        pipeSpawnInterval = Math.round(150 * 0.85 * 0.85); // 15% dari Level 2
        pipeGap = Math.round(200 * 0.85 * 0.85); // 15% dari Level 2
        playSound(audioSuccess);
    } else if (score === 30) {
        pipeSpeed = 1.5 * 1.15 * 1.15 * 1.15; // 15% dari Level 3
        pipeSpawnInterval = Math.round(150 * 0.85 * 0.85 * 0.85); // 15% dari Level 3
        pipeGap = Math.round(200 * 0.85 * 0.85 * 0.85); // 15% dari Level 3
        playSound(audioSuccess);
    }
}

// Fungsi untuk membuat dan menggambar pipa 3D ala Mario Bros
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

        // Pipa atas
        if (colors.pattern === 'brick') {
            drawBrickPattern(pipes[i].x, 0, 50, pipes[i].top - 15); // Pola bata untuk badan
            drawBrickPattern(pipes[i].x, pipes[i].top - 15, 50, 15); // Pola bata untuk tepi
        } else if (colors.pattern === 'bamboo') {
            drawBambooPattern(pipes[i].x, 0, 50, pipes[i].top - 15); // Pola bambu untuk badan
            drawBambooPattern(pipes[i].x, pipes[i].top - 15, 50, 15); // Pola bambu untuk tepi
        } else if (colors.pattern === 'wood') {
            drawWoodPattern(pipes[i].x, 0, 50, pipes[i].top - 15); // Pola kayu untuk badan
            drawWoodPattern(pipes[i].x, pipes[i].top - 15, 50, 15); // Pola kayu untuk tepi
        } else if (colors.pattern === 'stone') {
            drawStonePattern(pipes[i].x, 0, 50, pipes[i].top - 15); // Pola batu untuk badan
            drawStonePattern(pipes[i].x, pipes[i].top - 15, 50, 15); // Pola batu untuk tepi
        } else {
            let gradientTopBody = ctx.createLinearGradient(pipes[i].x, 0, pipes[i].x + 50, 0);
            gradientTopBody.addColorStop(0, colors.body[0]); // Sisi kiri
            gradientTopBody.addColorStop(0.5, colors.body[1]); // Tengah
            gradientTopBody.addColorStop(1, colors.body[0]); // Sisi kanan
            ctx.fillStyle = gradientTopBody;
            ctx.fillRect(pipes[i].x, 0, 50, pipes[i].top - 15); // Badan pipa

            let gradientTopEnd = ctx.createLinearGradient(pipes[i].x, pipes[i].top - 15, pipes[i].x + 50, pipes[i].top - 15);
            gradientTopEnd.addColorStop(0, colors.edge[0]);
            gradientTopEnd.addColorStop(0.5, colors.edge[1]);
            gradientTopEnd.addColorStop(1, colors.edge[0]);
            ctx.fillStyle = gradientTopEnd;
            ctx.fillRect(pipes[i].x, pipes[i].top - 15, 50, 15); // Tepi tebal 15px di celah
        }

        // Pipa bawah
        if (colors.pattern === 'brick') {
            drawBrickPattern(pipes[i].x, canvas.height - pipes[i].bottom + 15, 50, pipes[i].bottom - 15); // Pola bata untuk badan
            drawBrickPattern(pipes[i].x, canvas.height - pipes[i].bottom, 50, 15); // Pola bata untuk tepi
        } else if (colors.pattern === 'bamboo') {
            drawBambooPattern(pipes[i].x, canvas.height - pipes[i].bottom + 15, 50, pipes[i].bottom - 15); // Pola bambu untuk badan
            drawBambooPattern(pipes[i].x, canvas.height - pipes[i].bottom, 50, 15); // Pola bambu untuk tepi
        } else if (colors.pattern === 'wood') {
            drawWoodPattern(pipes[i].x, canvas.height - pipes[i].bottom + 15, 50, pipes[i].bottom - 15); // Pola kayu untuk badan
            drawWoodPattern(pipes[i].x, canvas.height - pipes[i].bottom, 50, 15); // Pola kayu untuk tepi
        } else if (colors.pattern === 'stone') {
            drawStonePattern(pipes[i].x, canvas.height - pipes[i].bottom + 15, 50, pipes[i].bottom - 15); // Pola batu untuk badan
            drawStonePattern(pipes[i].x, canvas.height - pipes[i].bottom, 50, 15); // Pola batu untuk tepi
        } else {
            let gradientBottomBody = ctx.createLinearGradient(pipes[i].x, canvas.height, pipes[i].x + 50, canvas.height);
            gradientBottomBody.addColorStop(0, colors.body[0]); // Sisi kiri
            gradientBottomBody.addColorStop(0.5, colors.body[1]); // Tengah
            gradientBottomBody.addColorStop(1, colors.body[0]); // Sisi kanan
            ctx.fillStyle = gradientBottomBody;
            ctx.fillRect(pipes[i].x, canvas.height - pipes[i].bottom + 15, 50, pipes[i].bottom - 15); // Badan pipa

            let gradientBottomEnd = ctx.createLinearGradient(pipes[i].x, canvas.height - pipes[i].bottom, pipes[i].x + 50, canvas.height - pipes[i].bottom);
            gradientBottomEnd.addColorStop(0, colors.edge[0]);
            gradientBottomEnd.addColorStop(0.5, colors.edge[1]);
            gradientBottomEnd.addColorStop(1, colors.edge[0]);
            ctx.fillStyle = gradientBottomEnd;
            ctx.fillRect(pipes[i].x, canvas.height - pipes[i].bottom, 50, 15); // Tepi tebal 15px di celah
        }

        // Deteksi tabrakan hanya pada tubuh burung dengan presisi lebih tinggi
        if (
            bird.x + bird.width > pipes[i].x &&
            bird.x < pipes[i].x + 50 &&
            (
                (bird.y + bird.height > pipes[i].top && bird.y < pipes[i].top) || // Tabrakan atas (hanya jika menembus)
                (bird.y < canvas.height - pipes[i].bottom && bird.y + bird.height > canvas.height - pipes[i].bottom) // Tabrakan bawah (hanya jika menembus)
            )
        ) {
            gameOver = true;
            playSound(audioGameOver);
        }

        // Tambah skor
        if (pipes[i].x + 50 < bird.x && !pipes[i].scored) {
            score++;
            pipes[i].scored = true;
            playSound(audioScore);
            adjustDifficulty(); // Sesuaikan kesulitan saat skor bertambah
        }

        // Hapus pipa yang sudah lelet
        if (pipes[i].x < -50) {
            pipes.splice(i, 1);
        }
    }
}

// Fungsi untuk menggambar skor
function drawScore() {
    ctx.fillStyle = "#000000";
    ctx.font = "30px Arial";
    ctx.fillText("Score: " + score, 10, 50);
}

// Fungsi untuk reset permainan
function resetGame() {
    bird.y = 150;
    bird.velocity = 0;
    pipes = [];
    score = 0;
    gameOver = false;
    isStartPlaying = true;
    jumpQueue = false;
    pipeSpeed = 1.5; // Reset ke Level 1
    pipeSpawnInterval = 150; // Reset ke Level 1
    pipeGap = 200; // Reset ke Level 1
    playSound(audioStart);
}

// Fungsi utama permainan
function update() {
    if (gameOver) {
        ctx.fillStyle = "#000000";
        ctx.font = "40px Arial";
        ctx.fillText("Game Over", canvas.width / 2 - 100, canvas.height / 2);
        ctx.font = "20px Arial";
        ctx.fillText("Press R to Restart", canvas.width / 2 - 80, canvas.height / 2 + 40);
        return;
    }

    if (frameCount === 1) {
        isStartPlaying = true;
    }

    // Hapus latar belakang eksplisit (kembali ke default canvas)
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

// Fungsi untuk memastikan gambar burung dimuat sebelum game dimulai
birdImage.onload = function() {
    console.log("Gambar burung dimuat dengan sukses!");
    update(); // Mulai game hanya setelah gambar dimuat
};

birdImage.onerror = function() {
    console.error("Gagal memuat gambar burung! Periksa path file 'burung.png'.");
    // Tampilkan placeholder jika gambar gagal dimuat
    birdImage.src = ''; // Hapus sumber yang salah
    update(); // Lanjutkan game dengan placeholder
};