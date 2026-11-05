/**
 * ============================================================================
 * 2D Multiplayer Virtual Office — 嵌入式復古街機貪吃蛇引擎 (Embedded Snake Game)
 * 規格依據: Specification Section 2 (Gaming Arcade Zone & Embedded Snake Game)
 * 核心機制:
 *  - 16x16 像素矩陣網格更新 (Grid-based 16x16 cell matrix)
 *  - 每 150ms 固定頻率的幀推進定時器 (Fixed 150ms frame ticker)
 *  - 箭頭鍵與 WASD 方向輸入監聽器
 *  - 隨機食物生成系統 (Automatic food spawn randomization)
 *  - 得分與最高分統計 (Current score & high score counter)
 *  - 螢幕邊界碰撞與自身尾巴碰撞檢測 (Wall & Self-tail collision detection)
 *  - "離開遊戲" DOM 處理按鈕 (Clean "Exit Game" DOM handle)
 * ============================================================================
 */

export class SnakeMiniGame {
  constructor(containerEl, onCloseCallback) {
    this.container = containerEl;
    this.onClose = onCloseCallback;

    // 遊戲網格參數
    this.gridWidth = 20;  // 20 列
    this.gridHeight = 20; // 20 行
    this.cellSize = 16;   // 每個儲存格 16x16 像素
    this.canvasWidth = this.gridWidth * this.cellSize;   // 320 px
    this.canvasHeight = this.gridHeight * this.cellSize; // 320 px

    // 狀態變數
    this.snake = [];
    this.direction = { x: 1, y: 0 };
    this.nextDirection = { x: 1, y: 0 };
    this.food = { x: 5, y: 5 };
    this.score = 0;
    this.highScore = parseInt(localStorage.getItem('office_snake_high') || '0', 10);
    this.isGameOver = false;
    this.isPaused = false;
    this.tickerTimer = null;

    this.domWrapper = null;
    this.canvas = null;
    this.ctx = null;
    this.scoreTextEl = null;

    this.boundKeyDown = this.handleKeyDown.bind(this);
  }

  /**
   * 啟動小遊戲並構建 DOM 覆蓋層
   */
  start() {
    this.buildDOM();
    this.resetGame();
    window.addEventListener('keydown', this.boundKeyDown, true);
    this.startTicker();
  }

  /**
   * 建立街機視窗 DOM 架構
   */
  buildDOM() {
    this.domWrapper = document.createElement('div');
    this.domWrapper.className = 'snake-modal-overlay';
    this.domWrapper.innerHTML = `
      <div class="snake-arcade-box">
        <div class="snake-header">
          <div class="flex items-center gap-2">
            <span class="text-xl">🕹️</span>
            <span class="font-extrabold text-amber-900 tracking-wider">RETRO ARCADE — SNAKE</span>
          </div>
          <button id="snake-exit-btn" class="snake-close-btn" title="Exit Game">✕</button>
        </div>

        <div class="snake-hud">
          <div class="text-xs font-bold text-emerald-800">SCORE: <span id="snake-score" class="text-base text-amber-600 font-black">0</span></div>
          <div class="text-xs font-bold text-slate-600">BEST: <span id="snake-high" class="text-base text-slate-800 font-black">${this.highScore}</span></div>
        </div>

        <div class="snake-canvas-container">
          <canvas id="snake-canvas" width="${this.canvasWidth}" height="${this.canvasHeight}"></canvas>
          <div id="snake-game-over-banner" class="snake-game-over hidden">
            <div class="text-2xl font-black text-rose-600">GAME OVER</div>
            <div class="text-xs text-slate-700 mt-1">Press SPACE or Tap to Restart</div>
          </div>
        </div>

        <div class="snake-footer">
          <span class="text-[11px] text-slate-500">🎮 Use Arrow Keys or WASD to Slither</span>
          <button id="snake-restart-btn" class="snake-action-btn">🔄 Restart</button>
        </div>
      </div>
    `;

    this.container.appendChild(this.domWrapper);

    this.canvas = this.domWrapper.querySelector('#snake-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.scoreTextEl = this.domWrapper.querySelector('#snake-score');
    this.gameOverBanner = this.domWrapper.querySelector('#snake-game-over-banner');

    // 綁定退出按鈕
    this.domWrapper.querySelector('#snake-exit-btn').onclick = () => this.destroy();
    this.domWrapper.querySelector('#snake-restart-btn').onclick = () => this.resetGame();

    // 點擊 Game Over 區域重開
    this.gameOverBanner.onclick = () => this.resetGame();
  }

  /**
   * 重設遊戲數據
   */
  resetGame() {
    this.snake = [
      { x: 8, y: 10 },
      { x: 7, y: 10 },
      { x: 6, y: 10 }
    ];
    this.direction = { x: 1, y: 0 };
    this.nextDirection = { x: 1, y: 0 };
    this.score = 0;
    this.isGameOver = false;
    this.updateScoreDisplay();
    this.spawnFood();
    if (this.gameOverBanner) {
      this.gameOverBanner.classList.add('hidden');
    }
    this.draw();
  }

  /**
   * 啟動 150ms 固定頻率的街機時鐘 (150ms Frame Ticker)
   */
  startTicker() {
    if (this.tickerTimer) clearInterval(this.tickerTimer);
    this.tickerTimer = setInterval(() => {
      this.updateTick();
    }, 150);
  }

  /**
   * 隨機生成食物座標 (避開蛇身)
   */
  spawnFood() {
    let valid = false;
    let newX, newY;
    while (!valid) {
      newX = Math.floor(Math.random() * this.gridWidth);
      newY = Math.floor(Math.random() * this.gridHeight);
      valid = !this.snake.some(segment => segment.x === newX && segment.y === newY);
    }
    this.food = { x: newX, y: newY };
  }

  /**
   * 鍵盤輸入路由 (嚴格攔截，不透傳至 Phaser 主角移動)
   */
  handleKeyDown(e) {
    const key = e.key;

    // 防止網頁滾動
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(key)) {
      e.preventDefault();
      e.stopPropagation();
    }

    if (this.isGameOver) {
      if (key === ' ' || key === 'Enter') {
        this.resetGame();
      }
      return;
    }

    // 防止直接反向掉頭
    if ((key === 'ArrowUp' || key === 'w' || key === 'W') && this.direction.y !== 1) {
      this.nextDirection = { x: 0, y: -1 };
    } else if ((key === 'ArrowDown' || key === 's' || key === 'S') && this.direction.y !== -1) {
      this.nextDirection = { x: 0, y: 1 };
    } else if ((key === 'ArrowLeft' || key === 'a' || key === 'A') && this.direction.x !== 1) {
      this.nextDirection = { x: -1, y: 0 };
    } else if ((key === 'ArrowRight' || key === 'd' || key === 'D') && this.direction.x !== -1) {
      this.nextDirection = { x: 1, y: 0 };
    } else if (key === 'Escape') {
      this.destroy();
    }
  }

  /**
   * 遊戲心跳邏輯 (150ms 單步推進)
   */
  updateTick() {
    if (this.isGameOver || this.isPaused) return;

    this.direction = { ...this.nextDirection };

    const head = this.snake[0];
    const newHead = {
      x: head.x + this.direction.x,
      y: head.y + this.direction.y
    };

    // 1. 邊界碰撞檢測 (Wall Collision Check)
    if (newHead.x < 0 || newHead.x >= this.gridWidth || newHead.y < 0 || newHead.y >= this.gridHeight) {
      this.triggerGameOver();
      return;
    }

    // 2. 身體自我碰撞檢測 (Self-tail Collision Check)
    for (let i = 0; i < this.snake.length; i++) {
      if (this.snake[i].x === newHead.x && this.snake[i].y === newHead.y) {
        this.triggerGameOver();
        return;
      }
    }

    // 插入新蛇頭
    this.snake.unshift(newHead);

    // 3. 吃下食物檢測
    if (newHead.x === this.food.x && newHead.y === this.food.y) {
      this.score += 10;
      if (this.score > this.highScore) {
        this.highScore = this.score;
        localStorage.setItem('office_snake_high', String(this.highScore));
        const highEl = this.domWrapper.querySelector('#snake-high');
        if (highEl) highEl.textContent = this.highScore;
      }
      this.updateScoreDisplay();
      this.spawnFood();
    } else {
      // 移除蛇尾
      this.snake.pop();
    }

    this.draw();
  }

  triggerGameOver() {
    this.isGameOver = true;
    if (this.gameOverBanner) {
      this.gameOverBanner.classList.remove('hidden');
    }
  }

  updateScoreDisplay() {
    if (this.scoreTextEl) {
      this.scoreTextEl.textContent = this.score;
    }
  }

  /**
   * 繪製街機畫面
   */
  draw() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const cs = this.cellSize;

    // 清空背景 (復古螢幕墨綠灰風格)
    ctx.fillStyle = '#0F2027';
    ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);

    // 繪製細微點陣網格
    ctx.strokeStyle = 'rgba(44, 83, 100, 0.35)';
    ctx.lineWidth = 0.5;
    for (let x = 0; x < this.canvasWidth; x += cs) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, this.canvasHeight); ctx.stroke();
    }
    for (let y = 0; y < this.canvasHeight; y += cs) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(this.canvasWidth, y); ctx.stroke();
    }

    // 繪製蘋果食物 (鮮紅可愛小蘋果)
    ctx.fillStyle = '#EF476F';
    ctx.beginPath();
    ctx.arc(this.food.x * cs + cs / 2, this.food.y * cs + cs / 2, cs / 2 - 1, 0, Math.PI * 2);
    ctx.fill();
    // 綠色葉子
    ctx.fillStyle = '#06D6A0';
    ctx.beginPath();
    ctx.arc(this.food.x * cs + cs / 2 + 2, this.food.y * cs + 3, 2, 0, Math.PI * 2);
    ctx.fill();

    // 繪製蛇身 (翡翠薄荷圓角黏土質感)
    this.snake.forEach((seg, index) => {
      ctx.fillStyle = index === 0 ? '#FFD166' : '#06D6A0'; // 蛇頭明黃，身體薄荷綠
      const px = seg.x * cs + 1;
      const py = seg.y * cs + 1;
      const size = cs - 2;

      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(px, py, size, size, 4) : ctx.rect(px, py, size, size);
      ctx.fill();

      // 蛇頭專屬萌系雙眼
      if (index === 0) {
        ctx.fillStyle = '#264653';
        const ex1 = px + (this.direction.x === 0 ? 3 : (this.direction.x > 0 ? 9 : 3));
        const ey1 = py + (this.direction.y === 0 ? 3 : (this.direction.y > 0 ? 9 : 3));
        ctx.beginPath();
        ctx.arc(ex1, ey1, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }

  /**
   * 銷毀街機視窗，歸還主畫面控制焦點
   */
  destroy() {
    if (this.tickerTimer) {
      clearInterval(this.tickerTimer);
      this.tickerTimer = null;
    }
    window.removeEventListener('keydown', this.boundKeyDown, true);

    if (this.domWrapper && this.domWrapper.parentNode) {
      this.domWrapper.parentNode.removeChild(this.domWrapper);
    }

    if (typeof this.onClose === 'function') {
      this.onClose();
    }
  }
}
