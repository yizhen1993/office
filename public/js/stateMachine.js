/**
 * ============================================================================
 * 2D Multiplayer Virtual Office — 嚴格狀態互斥機 (Strict Mutex Machine)
 * 規格依據: Specification Section 4 (Hard State Conflict Lock Engine)
 * 核心職責:
 *  1. 當 isSprinting === true 時，阻斷坐下互動 (Sitting) 與禁止進入小遊戲 (MiniGaming)
 *  2. 當 isSitting === true 時，強制清除所有線速度 (Velocity = 0)，鎖定虛擬搖桿，並將奔跑按鈕凍結 (opacity 0.4, pointer-events: none)
 *  3. 當 isMiniGaming === true 時，全權攔截鍵盤按鍵導向 Snake 邏輯，並暫停向伺服器發送位移同步包
 * ============================================================================
 */

export class StateMutexMachine {
  constructor() {
    // 玩家四項互斥核心狀態
    this.isSprinting = false; // 是否處於 2.5 倍衝刺奔跑狀態
    this.isSitting = false;   // 是否處於椅子坐姿狀態
    this.isMiniGaming = false; // 是否處於貪吃蛇街機小遊戲狀態
    this.heldItem = null;     // 當前手持茶水間點心: 'Coke' | 'Snack' | 'Pizza' | null

    // 關聯綁定的椅子與互動實體
    this.activeChair = null;

    // DOM 控制句柄 (奔跑按鈕、站立按鈕等)
    this.runBtnEl = null;
    this.standBtnEl = null;
  }

  /**
   * 初始化綁定 UI DOM 元素
   */
  bindUIElements({ runBtn, standBtn }) {
    this.runBtnEl = runBtn;
    this.standBtnEl = standBtn;
    this.applyUiConstraints();
  }

  // ==========================================================================
  // 規則 1: 衝刺狀態 (Sprinting State)
  // ==========================================================================
  setSprinting(value) {
    // 如果正在坐著或在玩小遊戲，嚴禁開啟衝刺
    if (this.isSitting || this.isMiniGaming) {
      this.isSprinting = false;
      this.applyUiConstraints();
      return false;
    }

    this.isSprinting = Boolean(value);
    this.applyUiConstraints();
    return true;
  }

  /**
   * 檢查是否允許坐下 (Can Sit?)
   * 規則: 正在衝刺中或正在玩小遊戲時，嚴禁坐下
   */
  canSit() {
    if (this.isSprinting) {
      console.warn('[Mutex] ⚠️ 衝刺中無法執行坐下動作，請先鬆開奔跑鍵。');
      return false;
    }
    if (this.isMiniGaming) {
      return false;
    }
    return !this.isSitting;
  }

  /**
   * 檢查是否允許進入小遊戲 (Can Enter MiniGame?)
   * 規則: 正在衝刺中嚴禁觸發小遊戲
   */
  canEnterMiniGame() {
    if (this.isSprinting) {
      console.warn('[Mutex] ⚠️ 衝刺狂奔中無法開啟街機遊戲。');
      return false;
    }
    return !this.isMiniGaming;
  }

  // ==========================================================================
  // 規則 2: 坐姿狀態 (Sitting State)
  // ==========================================================================
  enterSit(chair, playerSprite) {
    if (!this.canSit()) return false;

    this.isSitting = true;
    this.isSprinting = false;
    this.activeChair = chair;

    // 強制停止物理實體線速度 (kill all movement velocities)
    if (playerSprite && playerSprite.body) {
      playerSprite.body.setVelocity(0, 0);
      playerSprite.body.moves = false; // 暫停實體物理推力
    }

    this.applyUiConstraints();
    return true;
  }

  standUp(playerSprite) {
    if (!this.isSitting) return false;

    this.isSitting = false;
    if (this.activeChair) {
      this.activeChair = null;
    }

    // 恢復實體物理運動
    if (playerSprite && playerSprite.body) {
      playerSprite.body.moves = true;
      playerSprite.body.setVelocity(0, 0);
    }

    this.applyUiConstraints();
    return true;
  }

  // ==========================================================================
  // 規則 3: 小遊戲狀態 (Mini-Gaming State)
  // ==========================================================================
  enterMiniGame(playerSprite) {
    if (!this.canEnterMiniGame()) return false;

    this.isMiniGaming = true;
    this.isSprinting = false;

    // 暫停主角色物理移動
    if (playerSprite && playerSprite.body) {
      playerSprite.body.setVelocity(0, 0);
    }

    this.applyUiConstraints();
    return true;
  }

  exitMiniGame(playerSprite) {
    if (!this.isMiniGaming) return false;

    this.isMiniGaming = false;

    if (playerSprite && playerSprite.body) {
      playerSprite.body.setVelocity(0, 0);
    }

    this.applyUiConstraints();
    return true;
  }

  // ==========================================================================
  // 規則 4: 手持物品管理 (Held Item State)
  // ==========================================================================
  setHeldItem(item) {
    this.heldItem = item;
  }

  consumeHeldItem() {
    const item = this.heldItem;
    this.heldItem = null;
    return item;
  }

  // ==========================================================================
  // UI 限制狀態同步 (UI Constraints Syncer)
  // ==========================================================================
  applyUiConstraints() {
    // 1. 奔跑按鈕 (RUN BUTTON):
    // 當 isSitting 為 true 時，凍結 run buttons (style opacity 0.4, pointer-events 'none')
    if (this.runBtnEl) {
      if (this.isSitting || this.isMiniGaming) {
        this.runBtnEl.style.opacity = '0.35';
        this.runBtnEl.style.pointerEvents = 'none';
        this.runBtnEl.style.transform = 'scale(0.95)';
      } else {
        this.runBtnEl.style.opacity = '1.0';
        this.runBtnEl.style.pointerEvents = 'auto';
        this.runBtnEl.style.transform = this.isSprinting ? 'scale(1.1)' : 'scale(1.0)';
        if (this.isSprinting) {
          this.runBtnEl.classList.add('btn-active-glow');
        } else {
          this.runBtnEl.classList.remove('btn-active-glow');
        }
      }
    }

    // 2. 站起按鈕 (STAND UP BUTTON):
    // 僅在 isSitting === true 時條件渲染顯示
    if (this.standBtnEl) {
      if (this.isSitting) {
        this.standBtnEl.style.display = 'flex';
        this.standBtnEl.style.opacity = '1.0';
        this.standBtnEl.style.pointerEvents = 'auto';
      } else {
        this.standBtnEl.style.display = 'none';
        this.standBtnEl.style.pointerEvents = 'none';
      }
    }
  }
}
