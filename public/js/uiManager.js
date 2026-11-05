/**
 * ============================================================================
 * 2D Multiplayer Virtual Office — UI 與操作控制器 (UI & Controls Manager)
 * 規格依據: Specification Section 4 (Mobile View Overlays & Temple Transparent Overlays)
 * 核心功能:
 *  1. 左下象限虛擬觸控搖桿 (Mobile Virtual Touch Joystick / Trackpad)
 *  2. 右下象限透明神殿風懸浮動作按鈕 (Temple-Style Transparent Floating Action Buttons):
 *     - 按鈕 1: 🏃 RUN (長按 2.5 倍衝刺，放開回歸常速)
 *     - 按鈕 2: 🧍 STAND UP (僅在 isSitting 時條件渲染顯示)
 *     - 按鈕 3: 🍽️ EAT / CONSUME (手持食物時條件顯示)
 *     - 按鈕 4: ⚡ INTERACT / ACTION (靠近可互動設施時亮起)
 *  3. 茶水間冰箱專屬互動下拉選單 (Coke, Snack, Pizza, Consume)
 *  4. 底部聊天輸入欄與快捷對話
 *  5. 多媒體 YouTube 投影播放機控制器與距離音量漸弱邏輯 (Proximity Volume Attenuation)
 * ============================================================================
 */

export class UIManager {
  /**
   * @param {Phaser.Scene} scene 
   */
  constructor(scene) {
    this.scene = scene;
    this.mutex = scene.mutexMachine;
    this.network = scene.network;

    // 虛擬搖桿內部狀態
    this.joystickActive = false;
    this.joystickDelta = { x: 0, y: 0 };
    this.joystickOrigin = { x: 0, y: 0 };
    this.maxJoystickRadius = 45; // 搖桿最大推移行程

    // DOM 節點快取
    this.joystickBase = document.getElementById('virtual-joystick-base');
    this.joystickThumb = document.getElementById('virtual-joystick-thumb');
    this.btnRun = document.getElementById('btn-run');
    this.btnStand = document.getElementById('btn-stand');
    this.btnEat = document.getElementById('btn-eat');
    this.btnAction = document.getElementById('btn-action');
    this.btnClub = document.getElementById('btn-club');
    this.chatInput = document.getElementById('chat-input');
    this.chatForm = document.getElementById('chat-form');
    this.fridgeMenu = document.getElementById('fridge-menu-modal');
    this.mediaModal = document.getElementById('media-modal');
    this.youtubeContainer = document.getElementById('youtube-player-layer');

    // 當前接近的可互動設施
    this.nearbyInteractive = null; // { type: 'FRIDGE' | 'TV' | 'ROULETTE' | 'SCREEN' | 'CHAIR', target: any }

    // 關聯綁定至互斥狀態機
    this.mutex.bindUIElements({
      runBtn: this.btnRun,
      standBtn: this.btnStand
    });

    this.initTouchJoystick();
    this.initActionButtons();
    this.initChatSystem();
    this.initFridgeModal();
    this.initMediaControls();
  }

  // ==========================================================================
  // 1. 左下象限虛擬觸控搖桿 (Virtual Touch Joystick)
  // ==========================================================================
  initTouchJoystick() {
    const trackpadArea = document.getElementById('joystick-touch-zone');
    if (!trackpadArea || !this.joystickBase || !this.joystickThumb) return;

    const startTouch = (clientX, clientY) => {
      // 坐姿或小遊戲狀態下鎖定搖桿
      if (this.mutex.isSitting || this.mutex.isMiniGaming) return;

      this.joystickActive = true;
      const rect = trackpadArea.getBoundingClientRect();
      const localX = clientX - rect.left;
      const localY = clientY - rect.top;

      this.joystickOrigin = { x: localX, y: localY };
      this.joystickBase.style.left = `${localX}px`;
      this.joystickBase.style.top = `${localY}px`;
      this.joystickBase.style.display = 'block';
      this.joystickThumb.style.transform = `translate(0px, 0px)`;
      this.joystickDelta = { x: 0, y: 0 };
    };

    const moveTouch = (clientX, clientY) => {
      if (!this.joystickActive) return;

      const rect = trackpadArea.getBoundingClientRect();
      const currentX = clientX - rect.left;
      const currentY = clientY - rect.top;

      let dx = currentX - this.joystickOrigin.x;
      let dy = currentY - this.joystickOrigin.y;
      const distance = Math.hypot(dx, dy);

      if (distance > this.maxJoystickRadius) {
        const angle = Math.atan2(dy, dx);
        dx = Math.cos(angle) * this.maxJoystickRadius;
        dy = Math.sin(angle) * this.maxJoystickRadius;
      }

      this.joystickThumb.style.transform = `translate(${dx}px, ${dy}px)`;

      // 正規化向量 (-1.0 ~ 1.0)
      this.joystickDelta = {
        x: dx / this.maxJoystickRadius,
        y: dy / this.maxJoystickRadius
      };
    };

    const endTouch = () => {
      this.joystickActive = false;
      this.joystickDelta = { x: 0, y: 0 };
      if (this.joystickBase) {
        this.joystickBase.style.display = 'none';
      }
    };

    // 觸控事件監聽 (Mobile Touch Events)
    trackpadArea.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      startTouch(touch.clientX, touch.clientY);
    }, { passive: false });

    trackpadArea.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      moveTouch(touch.clientX, touch.clientY);
    }, { passive: false });

    trackpadArea.addEventListener('touchend', (e) => {
      e.preventDefault();
      endTouch();
    }, { passive: false });

    // 滑鼠相容支援 (Desktop Mouse Drag on Zone)
    trackpadArea.addEventListener('mousedown', (e) => {
      startTouch(e.clientX, e.clientY);
      const onMouseMove = (me) => moveTouch(me.clientX, me.clientY);
      const onMouseUp = () => {
        endTouch();
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });
  }

  // ==========================================================================
  // 2. 右下象限神殿風格透明動作按鈕 (Temple-Style Transparent Buttons)
  // ==========================================================================
  initActionButtons() {
    // 按鈕 1: 🏃 奔跑鍵 (RUN)
    if (this.btnRun) {
      const handleRunStart = (e) => {
        if (e) e.preventDefault();
        // 互斥檢查: 坐姿或小遊戲中無法奔跑
        this.mutex.setSprinting(true);
      };

      const handleRunEnd = (e) => {
        if (e) e.preventDefault();
        this.mutex.setSprinting(false);
      };

      this.btnRun.addEventListener('pointerdown', handleRunStart);
      this.btnRun.addEventListener('pointerup', handleRunEnd);
      this.btnRun.addEventListener('pointerleave', handleRunEnd);
      this.btnRun.addEventListener('pointercancel', handleRunEnd);
    }

    // 按鈕 2: 🧍 站起鍵 (STAND UP) - 僅在 isSitting 時條件渲染
    if (this.btnStand) {
      this.btnStand.onclick = (e) => {
        e.preventDefault();
        this.scene.performStandUp();
      };
    }

    // 按鈕 3: 🍽️ 享用食物鍵 (CONSUME)
    if (this.btnEat) {
      this.btnEat.onclick = (e) => {
        e.preventDefault();
        this.scene.consumeCurrentHeldItem();
      };
    }

    // 按鈕 4: ⚡ 萬能互動鍵 (INTERACT / ACTION)
    if (this.btnAction) {
      this.btnAction.onclick = (e) => {
        e.preventDefault();
        this.triggerCurrentInteractive();
      };
    }

    // 按鈕 5: 🪩 夜店派對模式鍵 (TOGGLE CLUB)
    if (this.btnClub) {
      this.btnClub.onclick = (e) => {
        e.preventDefault();
        if (this.network && this.network.sendToggleClubMode) {
          this.network.sendToggleClubMode();
        }
      };
    }

    // 鍵盤空白鍵 (Space) 與 E 鍵快速觸發互動
    window.addEventListener('keydown', (e) => {
      // 避免在聊天輸入框輸入時觸發
      if (document.activeElement === this.chatInput) return;
      if (this.mutex.isMiniGaming) return;

      if (e.key === 'e' || e.key === 'E' || e.key === ' ') {
        if (this.nearbyInteractive) {
          e.preventDefault();
          this.triggerCurrentInteractive();
        }
      } else if (e.key === 'Shift') {
        // Shift 鍵衝刺
        this.mutex.setSprinting(true);
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.key === 'Shift') {
        this.mutex.setSprinting(false);
      }
    });
  }

  // ==========================================================================
  // 3. 聊天輸入系統 (Floating Overhead Chat Submission)
  // ==========================================================================
  initChatSystem() {
    if (!this.chatForm || !this.chatInput) return;

    this.chatForm.onsubmit = (e) => {
      e.preventDefault();
      const text = this.chatInput.value.trim();
      if (!text) return;

      this.network.sendChatMessage(text);
      this.chatInput.value = '';
      this.chatInput.blur(); // 歸還焦點
    };

    // 快捷表情短語按鈕
    const quickEmotes = document.querySelectorAll('.quick-chat-btn');
    quickEmotes.forEach(btn => {
      btn.onclick = () => {
        const msg = btn.getAttribute('data-msg');
        if (msg) {
          this.network.sendChatMessage(msg);
        }
      };
    });
  }

  // ==========================================================================
  // 4. 茶水間冰箱互動彈窗 (Fridge Dropdown Modal)
  // ==========================================================================
  initFridgeModal() {
    if (!this.fridgeMenu) return;

    // 關閉按鈕
    const closeBtn = document.getElementById('fridge-close-btn');
    if (closeBtn) {
      closeBtn.onclick = () => this.hideFridgeMenu();
    }

    // 食物選擇按鈕
    const foodCards = document.querySelectorAll('.fridge-item-option');
    foodCards.forEach(card => {
      card.onclick = () => {
        const itemType = card.getAttribute('data-item'); // 'Coke' | 'Snack' | 'Pizza'
        if (itemType) {
          this.scene.pickupFoodFromFridge(itemType);
          this.hideFridgeMenu();
        }
      };
    });
  }

  showFridgeMenu() {
    if (this.fridgeMenu) {
      this.fridgeMenu.classList.remove('hidden');
    }
  }

  hideFridgeMenu() {
    if (this.fridgeMenu) {
      this.fridgeMenu.classList.add('hidden');
    }
  }

  // ==========================================================================
  // 5. 多媒體 YouTube 投影螢幕控制器 (Proximity Video Player)
  // ==========================================================================
  initMediaControls() {
    const mediaForm = document.getElementById('media-submit-form');
    const mediaInput = document.getElementById('media-url-input');
    const mediaClose = document.getElementById('media-close-btn');

    if (mediaForm && mediaInput) {
      mediaForm.onsubmit = (e) => {
        e.preventDefault();
        const url = mediaInput.value.trim();
        if (url) {
          this.network.sendYouTubeUrl(url, 'Multiplayer Shared Video');
          mediaInput.value = '';
          this.hideMediaModal();
        }
      };
    }

    if (mediaClose) {
      mediaClose.onclick = () => this.hideMediaModal();
    }
  }

  showMediaModal() {
    if (this.mediaModal) {
      this.mediaModal.classList.remove('hidden');
      const input = document.getElementById('media-url-input');
      if (input) input.focus();
    }
  }

  hideMediaModal() {
    if (this.mediaModal) {
      this.mediaModal.classList.add('hidden');
    }
  }

  /**
   * 依據玩家與投影屏的距離動態計算音量衰減 (Proximity Volume Attenuation)
   */
  updateProximityAudio(distance, maxRadius = 380) {
    if (!this.youtubeContainer) return;
    const iframe = this.youtubeContainer.querySelector('iframe');
    if (!iframe) return;

    if (distance > maxRadius) {
      // 超出聽覺半徑，靜音或降低透明度
      this.youtubeContainer.style.opacity = '0.15';
    } else {
      // 線性漸強 (越接近音量越飽滿)
      const volumeRatio = Math.max(0.1, 1.0 - (distance / maxRadius));
      this.youtubeContainer.style.opacity = '1.0';

      // 透過 postMessage 嘗試向 YouTube iframe 傳送音量調節
      try {
        const volumePercent = Math.round(volumeRatio * 100);
        iframe.contentWindow.postMessage(
          JSON.stringify({ event: 'command', func: 'setVolume', args: [volumePercent] }),
          '*'
        );
      } catch (err) {
        // 跨域 iframe 安全策略防護
      }
    }
  }

  // ==========================================================================
  // 6. 萬能互動器路由 (Interactive Trigger Dispatcher)
  // ==========================================================================
  
  setNearbyInteractive(interactive) {
    this.nearbyInteractive = interactive;
    const promptBanner = document.getElementById('interactive-prompt');
    const promptText = document.getElementById('interactive-prompt-text');

    if (interactive) {
      if (promptBanner && promptText) {
        promptBanner.classList.remove('hidden');
        promptText.textContent = interactive.label || 'Tap Action to Interact';
      }
      if (this.btnAction) {
        this.btnAction.classList.remove('hidden');
        this.btnAction.classList.add('btn-active-glow');
      }
    } else {
      if (promptBanner) {
        promptBanner.classList.add('hidden');
      }
      if (this.btnAction) {
        this.btnAction.classList.add('hidden');
        this.btnAction.classList.remove('btn-active-glow');
      }
    }
  }

  triggerCurrentInteractive() {
    if (!this.nearbyInteractive) return;

    const { type, data } = this.nearbyInteractive;

    switch (type) {
      case 'CHAIR':
        // 坐下交互
        this.scene.performSitDown(data);
        break;

      case 'FRIDGE':
        // 開啟茶水點心菜單
        this.showFridgeMenu();
        break;

      case 'TV':
        // 開啟復古街機貪吃蛇
        this.scene.launchArcadeSnake();
        break;

      case 'ROULETTE':
        // 轉動賽博輪盤
        if (this.network && this.network.sendRouletteSpin) {
          this.network.sendRouletteSpin();
        } else if (this.network && this.network.sendSpinRoulette) {
          this.network.sendSpinRoulette();
        }
        break;

      case 'SCREEN':
        // 開啟 YouTube 影片輸入彈窗
        this.showMediaModal();
        break;

      default:
        console.log('[UI] 未知互動類型:', type);
    }
  }

  /**
   * 更新手持點心 UI 狀態
   */
  updateHeldItemUI(item) {
    if (this.btnEat) {
      if (item) {
        this.btnEat.classList.remove('hidden');
        this.btnEat.title = `Consume ${item}`;
      } else {
        this.btnEat.classList.add('hidden');
      }
    }
  }
}
