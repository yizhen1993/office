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
    this.btnStyle = document.getElementById('btn-style');
    this.chatInput = document.getElementById('chat-input');
    this.chatForm = document.getElementById('chat-form');
    this.fridgeMenu = document.getElementById('fridge-menu-modal');
    this.mediaModal = document.getElementById('media-modal');
    this.youtubeContainer = document.getElementById('youtube-player-layer');
    this.avatarModal = document.getElementById('avatar-picker-modal');
    this.youtubeControlStick = document.getElementById('youtube-control-stick');
    this.btnOpenYoutube = document.getElementById('btn-open-youtube-modal');

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
    this.initAvatarPickerModal();
    this.initWelcomePopup();
    this.initYoutubeControlStick();
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

  // ==========================================================================
  // 5.5 複合角色外觀造型面板 (Composite Avatar Customization Modal)
  // ==========================================================================
  initAvatarPickerModal() {
    if (!this.avatarModal) return;

    const closeBtn = document.getElementById('avatar-picker-close-btn');
    const cancelBtn = document.getElementById('btn-cancel-avatar');
    const form = document.getElementById('avatar-custom-form');
    const nameInput = document.getElementById('picker-name-input');
    const hairHex = document.getElementById('picker-hair-hex');
    const outfitHex = document.getElementById('picker-outfit-hex');

    // 點擊 HUD 的 STYLE 按鈕開啟裝扮面板
    if (this.btnStyle) {
      this.btnStyle.onclick = (e) => {
        e.preventDefault();
        this.openAvatarPickerModal();
      };
    }

    if (closeBtn) {
      closeBtn.onclick = () => this.hideAvatarPickerModal();
    }
    if (cancelBtn) {
      cancelBtn.onclick = () => this.hideAvatarPickerModal();
    }

    // 當前暫存選擇狀態 (Current Working State)
    this.modalAvatarState = {
      name: 'Colleague',
      species: 'CAT',
      hair: 'spiky',
      hairColor: '#FFE66D',
      outfit: 'hoodie',
      outfitColor: '#4ECDC4',
      customBubble: 'code'
    };

    // 1. 動物耳朵品種按鈕組 (Species Selection)
    const speciesBtns = document.querySelectorAll('#picker-species-group .species-btn');
    speciesBtns.forEach(btn => {
      btn.onclick = () => {
        const species = btn.getAttribute('data-species');
        this.modalAvatarState.species = species;
        speciesBtns.forEach(b => {
          b.classList.remove('border-emerald-500', 'bg-emerald-100', 'ring-2', 'ring-emerald-400');
          b.classList.add('border-slate-200', 'bg-white');
        });
        btn.classList.remove('border-slate-200', 'bg-white');
        btn.classList.add('border-emerald-500', 'bg-emerald-100', 'ring-2', 'ring-emerald-400');
      };
    });

    // 2. 髮型款式按鈕組 (Hair Style Selection)
    const hairBtns = document.querySelectorAll('#picker-hair-group .hair-btn');
    hairBtns.forEach(btn => {
      btn.onclick = () => {
        const hair = btn.getAttribute('data-hair');
        this.modalAvatarState.hair = hair;
        hairBtns.forEach(b => {
          b.classList.remove('border-amber-500', 'bg-amber-100', 'ring-2', 'ring-amber-400');
          b.classList.add('border-slate-200', 'bg-white');
        });
        btn.classList.remove('border-slate-200', 'bg-white');
        btn.classList.add('border-amber-500', 'bg-amber-100', 'ring-2', 'ring-amber-400');
      };
    });

    // 2.1 髮色調色盤色塊
    const hairColorSwatches = document.querySelectorAll('#picker-hair-colors .color-swatch');
    hairColorSwatches.forEach(swatch => {
      swatch.onclick = () => {
        const color = swatch.getAttribute('data-color');
        this.modalAvatarState.hairColor = color;
        if (hairHex) hairHex.value = color;
      };
    });
    if (hairHex) {
      hairHex.oninput = (e) => {
        this.modalAvatarState.hairColor = e.target.value;
      };
    }

    // 3. 衣服款式按鈕組 (Outfit Style Selection)
    const outfitBtns = document.querySelectorAll('#picker-outfit-group .outfit-btn');
    outfitBtns.forEach(btn => {
      btn.onclick = () => {
        const outfit = btn.getAttribute('data-outfit');
        this.modalAvatarState.outfit = outfit;
        outfitBtns.forEach(b => {
          b.classList.remove('border-teal-500', 'bg-teal-100', 'ring-2', 'ring-teal-400');
          b.classList.add('border-slate-200', 'bg-white');
        });
        btn.classList.remove('border-slate-200', 'bg-white');
        btn.classList.add('border-teal-500', 'bg-teal-100', 'ring-2', 'ring-teal-400');
      };
    });

    // 3.1 衣服調色盤色塊
    const outfitColorSwatches = document.querySelectorAll('#picker-outfit-colors .color-swatch');
    outfitColorSwatches.forEach(swatch => {
      swatch.onclick = () => {
        const color = swatch.getAttribute('data-color');
        this.modalAvatarState.outfitColor = color;
        if (outfitHex) outfitHex.value = color;
      };
    });
    if (outfitHex) {
      outfitHex.oninput = (e) => {
        this.modalAvatarState.outfitColor = e.target.value;
      };
    }

    // 4. 頭頂跟隨自訂狀態泡泡按鈕組 (Overhead Tailing Bubble Selection)
    const bubbleBtns = document.querySelectorAll('#picker-bubble-group .bubble-btn');
    bubbleBtns.forEach(btn => {
      btn.onclick = () => {
        const bubble = btn.getAttribute('data-bubble');
        this.modalAvatarState.customBubble = bubble;
        bubbleBtns.forEach(b => {
          b.classList.remove('border-emerald-500', 'bg-emerald-100', 'ring-2', 'ring-emerald-400');
          b.classList.add('border-slate-200', 'bg-white');
        });
        btn.classList.remove('border-slate-200', 'bg-white');
        btn.classList.add('border-emerald-500', 'bg-emerald-100', 'ring-2', 'ring-emerald-400');
      };
    });

    // 5. 表單提交保存 (Save & Sync)
    if (form) {
      form.onsubmit = (e) => {
        e.preventDefault();
        const customName = nameInput ? nameInput.value.trim() : '';
        const finalName = customName || this.modalAvatarState.name || 'Colleague';

        const finalConfig = {
          name: finalName,
          species: this.modalAvatarState.species,
          avatarData: {
            species: this.modalAvatarState.species,
            hair: this.modalAvatarState.hair,
            hairColor: this.modalAvatarState.hairColor,
            outfit: this.modalAvatarState.outfit,
            outfitColor: this.modalAvatarState.outfitColor
          },
          customBubble: this.modalAvatarState.customBubble
        };

        if (this.scene.applyPlayerCustomAvatar) {
          this.scene.applyPlayerCustomAvatar(finalConfig);
        }

        this.hideAvatarPickerModal();
      };
    }
  }

  openAvatarPickerModal() {
    if (!this.avatarModal) return;

    // 將當前玩家設定同步至表單
    const pData = this.scene.playerData || {};
    const avData = pData.avatarData || {};

    this.modalAvatarState = {
      name: pData.name || 'Colleague',
      species: avData.species || pData.species || 'CAT',
      hair: avData.hair || 'spiky',
      hairColor: avData.hairColor || '#FFE66D',
      outfit: avData.outfit || 'hoodie',
      outfitColor: avData.outfitColor || pData.shirtColor || '#4ECDC4',
      customBubble: pData.customBubble || 'code'
    };

    const nameInput = document.getElementById('picker-name-input');
    if (nameInput) nameInput.value = this.modalAvatarState.name;

    const hairHex = document.getElementById('picker-hair-hex');
    if (hairHex) hairHex.value = this.modalAvatarState.hairColor;

    const outfitHex = document.getElementById('picker-outfit-hex');
    if (outfitHex) outfitHex.value = this.modalAvatarState.outfitColor;

    // 高亮對應選鈕
    const speciesBtn = document.querySelector(`#picker-species-group [data-species="${this.modalAvatarState.species}"]`);
    if (speciesBtn) speciesBtn.click();

    const hairBtn = document.querySelector(`#picker-hair-group [data-hair="${this.modalAvatarState.hair}"]`);
    if (hairBtn) hairBtn.click();

    const outfitBtn = document.querySelector(`#picker-outfit-group [data-outfit="${this.modalAvatarState.outfit}"]`);
    if (outfitBtn) outfitBtn.click();

    const bubbleBtn = document.querySelector(`#picker-bubble-group [data-bubble="${this.modalAvatarState.customBubble}"]`);
    if (bubbleBtn) bubbleBtn.click();

    this.avatarModal.classList.remove('hidden');
  }

  hideAvatarPickerModal() {
    if (this.avatarModal) {
      this.avatarModal.classList.add('hidden');
    }
  }

  // ==========================================================================
  // 5.7 首次入職強制創角彈窗 (Welcome Customizer Popup)
  // ==========================================================================
  initWelcomePopup() {
    this.welcomeModal = document.getElementById('welcome-customizer-popup');
    if (!this.welcomeModal) return;

    this.welcomeAvatarState = {
      name: '',
      species: 'CAT',
      hair: 'spiky',
      hairColor: '#FFE66D',
      outfit: 'hoodie',
      outfitColor: '#4ECDC4',
      customBubble: 'code'
    };

    const nameInput = document.getElementById('welcome-name-input');
    const submitBtn = document.getElementById('welcome-submit-btn');
    const hairHex = document.getElementById('welcome-hair-hex');
    const outfitHex = document.getElementById('welcome-outfit-hex');
    const errorEl = document.getElementById('welcome-name-error');

    // 1. 動物耳朵品種
    const speciesBtns = document.querySelectorAll('#welcome-species-group .welcome-species-btn');
    speciesBtns.forEach(btn => {
      btn.onclick = () => {
        const species = btn.getAttribute('data-species');
        this.welcomeAvatarState.species = species;
        speciesBtns.forEach(b => {
          b.classList.remove('border-emerald-500', 'bg-emerald-100', 'ring-2', 'ring-emerald-400');
          b.classList.add('border-slate-200', 'bg-white');
        });
        btn.classList.remove('border-slate-200', 'bg-white');
        btn.classList.add('border-emerald-500', 'bg-emerald-100', 'ring-2', 'ring-emerald-400');
      };
    });

    // 2. 髮型款式
    const hairBtns = document.querySelectorAll('#welcome-hair-group .welcome-hair-btn');
    hairBtns.forEach(btn => {
      btn.onclick = () => {
        const hair = btn.getAttribute('data-hair');
        this.welcomeAvatarState.hair = hair;
        hairBtns.forEach(b => {
          b.classList.remove('border-amber-500', 'bg-amber-100', 'ring-2', 'ring-amber-400');
          b.classList.add('border-slate-200', 'bg-white');
        });
        btn.classList.remove('border-slate-200', 'bg-white');
        btn.classList.add('border-amber-500', 'bg-amber-100', 'ring-2', 'ring-amber-400');
      };
    });

    // 2.1 髮色調色盤
    const hairSwatches = document.querySelectorAll('#welcome-hair-colors .color-swatch');
    hairSwatches.forEach(swatch => {
      swatch.onclick = () => {
        const color = swatch.getAttribute('data-color');
        this.welcomeAvatarState.hairColor = color;
        if (hairHex) hairHex.value = color;
      };
    });
    if (hairHex) {
      hairHex.oninput = (e) => {
        this.welcomeAvatarState.hairColor = e.target.value;
      };
    }

    // 3. 衣服款式
    const outfitBtns = document.querySelectorAll('#welcome-outfit-group .welcome-outfit-btn');
    outfitBtns.forEach(btn => {
      btn.onclick = () => {
        const outfit = btn.getAttribute('data-outfit');
        this.welcomeAvatarState.outfit = outfit;
        outfitBtns.forEach(b => {
          b.classList.remove('border-teal-500', 'bg-teal-100', 'ring-2', 'ring-teal-400');
          b.classList.add('border-slate-200', 'bg-white');
        });
        btn.classList.remove('border-slate-200', 'bg-white');
        btn.classList.add('border-teal-500', 'bg-teal-100', 'ring-2', 'ring-teal-400');
      };
    });

    // 3.1 衣服配色
    const outfitSwatches = document.querySelectorAll('#welcome-outfit-colors .color-swatch');
    outfitSwatches.forEach(swatch => {
      swatch.onclick = () => {
        const color = swatch.getAttribute('data-color');
        this.welcomeAvatarState.outfitColor = color;
        if (outfitHex) outfitHex.value = color;
      };
    });
    if (outfitHex) {
      outfitHex.oninput = (e) => {
        this.welcomeAvatarState.outfitColor = e.target.value;
      };
    }

    // 4. 頭頂狀態泡泡
    const bubbleBtns = document.querySelectorAll('#welcome-bubble-group .welcome-bubble-btn');
    bubbleBtns.forEach(btn => {
      btn.onclick = () => {
        const bubble = btn.getAttribute('data-bubble');
        this.welcomeAvatarState.customBubble = bubble;
        bubbleBtns.forEach(b => {
          b.classList.remove('border-emerald-500', 'bg-emerald-100', 'ring-2', 'ring-emerald-400');
          b.classList.add('border-slate-200', 'bg-white');
        });
        btn.classList.remove('border-slate-200', 'bg-white');
        btn.classList.add('border-emerald-500', 'bg-emerald-100', 'ring-2', 'ring-emerald-400');
      };
    });

    // 5. 點擊提交按鈕
    if (submitBtn) {
      submitBtn.onclick = (e) => {
        e.preventDefault();
        this.submitWelcomeCustomizer();
      };
    }

    const welcomeForm = document.getElementById('welcome-custom-form');
    if (welcomeForm) {
      welcomeForm.onsubmit = (e) => {
        e.preventDefault();
        this.submitWelcomeCustomizer();
      };
    }

    if (nameInput) {
      nameInput.oninput = () => {
        if (errorEl && nameInput.value.trim().length > 0) {
          errorEl.classList.add('hidden');
          nameInput.classList.remove('ring-2', 'ring-rose-400');
        }
      };
    }
  }

  showWelcomeCustomizerPopup() {
    if (!this.welcomeModal) {
      this.welcomeModal = document.getElementById('welcome-customizer-popup');
    }
    if (this.welcomeModal) {
      this.welcomeModal.classList.remove('hidden');
      const nameInput = document.getElementById('welcome-name-input');
      if (nameInput) {
        setTimeout(() => nameInput.focus(), 150);
      }
    }
  }

  hideWelcomeCustomizerPopup() {
    if (!this.welcomeModal) {
      this.welcomeModal = document.getElementById('welcome-customizer-popup');
    }
    if (this.welcomeModal) {
      this.welcomeModal.classList.add('hidden');
    }
  }

  submitWelcomeCustomizer() {
    const nameInput = document.getElementById('welcome-name-input');
    const errorEl = document.getElementById('welcome-name-error');
    const name = nameInput ? nameInput.value.trim() : '';

    if (!name) {
      if (errorEl) errorEl.classList.remove('hidden');
      if (nameInput) {
        nameInput.focus();
        nameInput.classList.add('ring-2', 'ring-rose-400');
      }
      return;
    }

    if (errorEl) errorEl.classList.add('hidden');
    if (nameInput) nameInput.classList.remove('ring-2', 'ring-rose-400');

    const species = this.welcomeAvatarState.species || 'CAT';
    const outfitColor = this.welcomeAvatarState.outfitColor || '#4ECDC4';
    const hairColor = this.welcomeAvatarState.hairColor || '#FFE66D';
    const hair = this.welcomeAvatarState.hair || 'spiky';
    const outfit = this.welcomeAvatarState.outfit || 'hoodie';
    const customBubble = this.welcomeAvatarState.customBubble || 'code';

    const newAvatarData = {
      name: name,
      species: species,
      shirtColor: outfitColor,
      avatarData: {
        species: species,
        hair: hair,
        hairColor: hairColor,
        outfit: outfit,
        outfitColor: outfitColor
      },
      customBubble: customBubble
    };

    // 1. 本地快取保存 (LocalStorage Persistence)
    try {
      localStorage.setItem('chubby_office_avatar', JSON.stringify(newAvatarData));
      console.log('[Avatar] 💾 成功寫入本地快取 chubby_office_avatar:', newAvatarData);
    } catch (err) {
      console.warn('[Avatar] 寫入 localStorage 失敗:', err);
    }

    // 2. 解鎖並通知場景正式 Spawn 角色
    if (this.scene && this.scene.onNewUserCompleteAvatar) {
      this.scene.onNewUserCompleteAvatar(newAvatarData);
    }

    // 3. 隱藏彈窗
    this.hideWelcomeCustomizerPopup();
  }

  // ==========================================================================
  // 5.6 YouTube 控制棒事件綁定 (YouTube Control Stick Integration)
  // ==========================================================================
  initYoutubeControlStick() {
    if (this.btnOpenYoutube) {
      this.btnOpenYoutube.onclick = (e) => {
        e.preventDefault();
        this.showMediaModal();
      };
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
