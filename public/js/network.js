/**
 * ============================================================================
 * 2D Multiplayer Virtual Office — 客戶端網路橋接模組 (Stage 2 Network Bridge)
 * 規格依據: Specification Section 3 (Complete Client-Side Network Handler Bridge)
 * 核心職責:
 *  - 提供模組化初始化函式 initSocketConnections(scene) 與 NetworkManager 類別
 *  - 綁定權威伺服器監聽事件:
 *      * current_players: 迭代遠端資料並調用工廠函式生成動森黏土精靈
 *      * new_player: 實例化新進遠端同仁精靈
 *      * player_moved: 查詢快取對象並透過線性插值 (Lerp) 平滑向量杜絕卡頓
 *      * roulette_started: 觸發 0~36 號扇區權威同播旋轉
 *      * chat_broadcast: 於目標實體頭頂生成氣泡並同步寫入左下歷史日誌
 *      * club_mode_changed: 🪩 夜店派對模式全域調色切換
 *      * player_disconnected: 安全解構銷毀遠端精靈容器
 * ============================================================================
 */

export class NetworkManager {
  /**
   * @param {Phaser.Scene} scene - 所屬主場景實例
   */
  constructor(scene) {
    this.scene = scene;
    this.socket = null;
    this.selfId = null;

    // 遠端連線玩家本地快取容器 Map<socketId, RemotePlayerRecord>
    this.remotePlayers = new Map();

    // 本地座標發送節流計時 (25Hz ~ 40ms)
    this.lastEmitTime = 0;
    this.emitInterval = 40;
    this.lastEmittedState = { x: 0, y: 0, anim: '', isSprinting: false, heldItem: 'none' };
  }

  /**
   * 初始化連接 Socket.io 服務
   */
  connect() {
    if (this.socket) return;
    // 自動相容反向代理與本地直接端口
    // @ts-ignore
    this.socket = io({
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000
    });

    // 綁定各項協議監聽器
    this.bindSocketEvents();
  }

  /**
   * 註冊 Socket.io 伺服器事件處理管道
   */
  bindSocketEvents() {
    const socket = this.socket;

    // ========================================================================
    // 1. 現存所有玩家全域快照 (current_players)
    // ========================================================================
    socket.on('current_players', (data) => {
      console.log(`[Network] 📦 收到 current_players 快照! 本地 ID: ${data.selfId}`);
      this.selfId = data.selfId;

      const playersObj = data.players || {};

      // A. 若場景具備本地玩家生成工廠
      if (this.scene.spawnLocalPlayer) {
        if (this.scene.isSpawnBlocked) {
          // 條件 B: 尚未完成首次創角，暫存 current_players 快照，先不生成主角精靈
          console.log('[Network] ⏸️ 首次創角中，暫存 current_players 快照等待提交');
          this.scene.pendingInitData = {
            selfId: this.selfId,
            players: Object.values(playersObj)
          };
        } else {
          // 條件 A: 已有快取資料，順暢生成本地主角
          this.scene.spawnLocalPlayer({
            selfId: this.selfId,
            players: Object.values(playersObj)
          });
        }
      }

      // B. 迭代其餘在線玩家並生成遠端精靈實體
      Object.keys(playersObj).forEach((id) => {
        if (id !== this.selfId) {
          this.spawnRemotePlayerSprite(playersObj[id]);
        }
      });

      // C. 派對模式全房同步
      if (data.clubMode !== undefined) {
        this.applyClubMode(data.clubMode);
      }

      // D. 多媒體影音狀態同播
      if (data.currentMedia && this.scene.updateMediaState) {
        this.scene.updateMediaState(data.currentMedia);
      }

      this.updateOnlineCounter();
    });

    // ========================================================================
    // 2. 新玩家連入通知 (new_player)
    // ========================================================================
    socket.on('new_player', (pData) => {
      console.log(`[Network] 👤 偵測到新玩家連線: ${pData.name} (${pData.id})`);
      if (pData.id !== this.selfId && !this.remotePlayers.has(pData.id)) {
        this.spawnRemotePlayerSprite(pData);
        this.updateOnlineCounter();

        if (this.scene.showSystemNotice) {
          this.scene.showSystemNotice(`🍃 歡迎同事 ${pData.name} 加入辦公空間！`);
        }
      }
    });

    // ========================================================================
    // 3. 玩家位移遙測更新 (player_moved)
    // ========================================================================
    socket.on('player_moved', (data) => {
      if (data.id === this.selfId) return;

      const remote = this.remotePlayers.get(data.id);
      if (remote) {
        // 更新目標向量供 update() 內的 Lerp 線性插值平滑平移
        remote.targetX = data.x;
        remote.targetY = data.y;
        remote.anim = data.anim;
        remote.isSprinting = data.isSprinting;
        remote.isSitting = data.isSitting;
        remote.heldItem = data.heldItem;
        if (data.avatarData) remote.avatarData = data.avatarData;
        if (data.customBubble !== undefined) remote.customBubble = data.customBubble;

        this.syncRemoteSpriteVisuals(remote);
      }
    });

    // ========================================================================
    // 3.5 玩家外觀造型自訂更新 (player_avatar_updated)
    // ========================================================================
    socket.on('player_avatar_updated', (data) => {
      console.log(`[Network] 🎨 收到玩家裝扮同步更新: ${data.id}`, data);
      if (data.id === this.selfId) return;

      const remote = this.remotePlayers.get(data.id);
      if (remote) {
        if (data.name) {
          remote.name = data.name;
          if (remote.nameText) remote.nameText.setText(data.name);
        }
        if (data.avatarData) {
          remote.avatarData = data.avatarData;
          remote.species = data.avatarData.species || remote.species;
          remote.shirtColor = data.avatarData.outfitColor || remote.shirtColor;
        }
        if (data.customBubble !== undefined) {
          remote.customBubble = data.customBubble;
        }
        this.syncRemoteSpriteVisuals(remote);
      }
    });

    // ========================================================================
    // 4. 賽博輪盤權威開獎旋轉指令 (roulette_started)
    // ========================================================================
    socket.on('roulette_started', (data) => {
      console.log(`[Network] 🎡 伺服器啟動全體同步旋轉! 最終中獎號碼: [${data.winningIndex}]`);
      if (this.scene.handleServerRouletteSpin) {
        this.scene.handleServerRouletteSpin(data);
      }
    });

    // ========================================================================
    // 5. 頭頂對話氣泡廣播與歷史日誌紀錄 (chat_broadcast)
    // ========================================================================
    socket.on('chat_broadcast', (chatData) => {
      // 5.1 在目標玩家精靈頭頂上方生成浮動氣泡
      if (this.scene.displayFloatingChatBubble) {
        this.scene.displayFloatingChatBubble(chatData);
      }

      // 5.2 寫入左下角 #chat-overlay 歷史日誌視窗
      this.appendChatLog(chatData);
    });

    // ========================================================================
    // 6. 🪩 夜店派對模式切換廣播 (club_mode_changed)
    // ========================================================================
    socket.on('club_mode_changed', (data) => {
      this.applyClubMode(data.active);
      if (this.scene.showSystemNotice) {
        this.scene.showSystemNotice(
          data.active 
            ? `🪩 ${data.triggeredBy} 開啟了夜店派對狂歡模式！` 
            : `☕ ${data.triggeredBy} 關閉了夜店模式，回歸專注文靜辦公。`
        );
      }
    });

    // ========================================================================
    // 7. 手持物品變更 (item_state_changed)
    // ========================================================================
    socket.on('item_state_changed', (data) => {
      if (data.id === this.selfId) {
        if (this.scene.updateLocalHeldItem) {
          this.scene.updateLocalHeldItem(data.heldItem, data.action);
        }
        return;
      }

      const remote = this.remotePlayers.get(data.id);
      if (remote) {
        remote.heldItem = data.heldItem;
        this.syncRemoteSpriteVisuals(remote);

        if (data.action === 'consume' && this.scene.tweens) {
          this.scene.tweens.add({
            targets: remote.container,
            scaleY: 1.25,
            scaleX: 0.9,
            duration: 120,
            yoyo: true,
            repeat: 2,
            ease: 'Sine.easeInOut'
          });
        }
      }
    });

    // ========================================================================
    // 8. 多媒體投影變更 (media_state_changed)
    // ========================================================================
    socket.on('media_state_changed', (mediaData) => {
      if (this.scene.updateMediaState) {
        this.scene.updateMediaState(mediaData);
      }
    });

    // ========================================================================
    // 9. 玩家斷線銷毀 (player_disconnected)
    // ========================================================================
    socket.on('player_disconnected', (data) => {
      console.log(`[Network] 🚪 遠端玩家離線: ID = ${data.id}`);
      this.destroyRemotePlayer(data.id);
      this.updateOnlineCounter();
    });
  }

  // ==========================================================================
  // 遠端實體精靈生成工廠 (Remote Player Composite Factory)
  // ==========================================================================
  spawnRemotePlayerSprite(pData) {
    if (this.remotePlayers.has(pData.id)) return;

    const species = (pData.avatarData && pData.avatarData.species) || pData.species || 'CAT';
    const avatarData = pData.avatarData || {
      species: species,
      hair: 'spiky',
      hairColor: '#FFE66D',
      outfit: 'hoodie',
      outfitColor: pData.shirtColor || '#4ECDC4'
    };
    const customBubble = pData.customBubble || 'code';

    // 建立複合容器 (Composite Container)
    const container = this.scene.add.container(pData.x, pData.y);
    container.setDepth(pData.y);

    // 1. 底部黏土橢圓陰影
    const shadow = this.scene.add.ellipse(0, 22, 28, 10, 0x000000, 0.2);
    container.add(shadow);

    // 2. 底層身體外觀精靈 (Base Body Frame)
    const initialBaseKey = `avatar_base_${species}_down_0`;
    const baseSprite = this.scene.add.sprite(0, 0, initialBaseKey);
    container.add(baseSprite);

    // 3. 衣服款式精靈 (Outfit Layer) 搭配色彩 Tint 濾鏡著色
    const initialOutfitKey = `outfit_${avatarData.outfit}_down_0`;
    const outfitSprite = this.scene.add.sprite(0, 0, initialOutfitKey);
    if (avatarData.outfitColor) {
      const hex = parseInt(avatarData.outfitColor.replace('#', '0x'), 16);
      outfitSprite.setTint(hex);
    }
    container.add(outfitSprite);

    // 4. 髮型款式精靈 (Hair Layer) 搭配色彩 Tint 濾鏡著色
    const initialHairKey = `hair_${avatarData.hair}_down`;
    const hairSprite = this.scene.add.sprite(0, 0, initialHairKey);
    if (avatarData.hairColor) {
      const hex = parseInt(avatarData.hairColor.replace('#', '0x'), 16);
      hairSprite.setTint(hex);
    }
    container.add(hairSprite);

    // 5. 遠端同仁精緻姓名標籤 (Temple Frosted Name Tag)
    const nameBg = this.scene.add.graphics();
    nameBg.fillStyle(0xFFFFFF, 0.9);
    nameBg.lineStyle(1.5, 0x78C0A8, 1);
    nameBg.fillRoundedRect(-40, -38, 80, 18, 9);
    nameBg.strokeRoundedRect(-40, -38, 80, 18, 9);
    container.add(nameBg);

    const nameText = this.scene.add.text(0, -29, pData.name || 'Colleague', {
      fontFamily: 'Nunito, Quicksand, sans-serif',
      fontSize: '11px',
      color: '#2D3748',
      fontStyle: 'bold'
    }).setOrigin(0.5);
    container.add(nameText);

    // 6. 自訂頭頂跟隨狀態泡泡 (直接加入 container 扁平管理)
    let bubbleSprite = null;
    const bubbleKey = `bubble_badge_${customBubble}`;
    if (this.scene.textures.exists(bubbleKey)) {
      bubbleSprite = this.scene.add.sprite(0, -50, bubbleKey);
      bubbleSprite.setScale(0.85);
      container.add(bubbleSprite);

      // 泡泡懸浮微動緩動動畫
      this.scene.tweens.add({
        targets: bubbleSprite,
        y: -54,
        duration: 1200,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
    }

    // 7. 手持點心懸浮圖標
    const foodIcon = this.scene.add.sprite(14, 8, 'item_coke');
    foodIcon.setScale(0.85);
    const hasItem = pData.heldItem && pData.heldItem !== 'none';
    foodIcon.setVisible(Boolean(hasItem));
    if (hasItem) {
      foodIcon.setTexture(`item_${pData.heldItem.toLowerCase()}`);
    }
    container.add(foodIcon);

    const remoteEntry = {
      id: pData.id,
      name: pData.name,
      species,
      shirtColor: avatarData.outfitColor,
      avatarData,
      customBubble,
      container,
      baseSprite,
      outfitSprite,
      hairSprite,
      bubbleSprite,
      nameText,
      foodIcon,
      targetX: pData.x,
      targetY: pData.y,
      anim: pData.anim || 'idle',
      heldItem: pData.heldItem || 'none',
      isSprinting: pData.isSprinting,
      isSitting: pData.isSitting
    };

    this.remotePlayers.set(pData.id, remoteEntry);
    return remoteEntry;
  }

  /**
   * 同步更新遠端精靈外觀、踏步幀、衣服/髮型層次與手持物品
   */
  syncRemoteSpriteVisuals(remote) {
    let dir = 'down';
    const anim = remote.anim || 'idle';
    if (anim.includes('up')) dir = 'up';
    else if (anim.includes('left')) dir = 'left';
    else if (anim.includes('right')) dir = 'right';

    let frame = 0;
    if (remote.isSitting) {
      frame = 3;
    } else if (anim.startsWith('walk')) {
      const tick = Math.floor(this.scene.time.now / 140) % 2;
      frame = tick === 0 ? 1 : 2;
    }

    const species = (remote.avatarData && remote.avatarData.species) || remote.species || 'CAT';
    const hair = (remote.avatarData && remote.avatarData.hair) || 'spiky';
    const hairColor = (remote.avatarData && remote.avatarData.hairColor) || '#FFE66D';
    const outfit = (remote.avatarData && remote.avatarData.outfit) || 'hoodie';
    const outfitColor = (remote.avatarData && remote.avatarData.outfitColor) || remote.shirtColor || '#4ECDC4';
    const customBubble = remote.customBubble || 'code';

    // 1. 底層身體與面部
    const baseKey = `avatar_base_${species}_${dir}_${frame}`;
    if (this.scene.textures.exists(baseKey) && remote.baseSprite) {
      remote.baseSprite.setTexture(baseKey);
    }

    // 2. 衣服款式與動態 Tint
    const outfitKey = `outfit_${outfit}_${dir}_${frame}`;
    if (this.scene.textures.exists(outfitKey) && remote.outfitSprite) {
      remote.outfitSprite.setTexture(outfitKey);
      const hex = parseInt(outfitColor.replace('#', '0x'), 16);
      remote.outfitSprite.setTint(hex);
    }

    // 3. 髮型款式與動態 Tint
    const hairKey = `hair_${hair}_${dir}`;
    if (this.scene.textures.exists(hairKey) && remote.hairSprite) {
      remote.hairSprite.setTexture(hairKey);
      const hex = parseInt(hairColor.replace('#', '0x'), 16);
      remote.hairSprite.setTint(hex);
    }

    // 4. 頭頂狀態徽章
    if (remote.bubbleSprite) {
      const bubbleKey = `bubble_badge_${customBubble}`;
      if (this.scene.textures.exists(bubbleKey)) {
        remote.bubbleSprite.setTexture(bubbleKey);
      }
    }

    // 5. 手持點心圖標
    if (remote.foodIcon) {
      if (remote.heldItem && remote.heldItem !== 'none') {
        remote.foodIcon.setTexture(`item_${remote.heldItem.toLowerCase()}`);
        remote.foodIcon.setVisible(true);
      } else {
        remote.foodIcon.setVisible(false);
      }
    }
  }

  /**
   * 銷毀遠端玩家實體
   */
  destroyRemotePlayer(id) {
    const remote = this.remotePlayers.get(id);
    if (remote) {
      remote.container.destroy();
      this.remotePlayers.delete(id);
    }
  }

  // ==========================================================================
  // 每幀線性插值平滑推進 (Lerp Loop)
  // ==========================================================================
  update(time, delta) {
    const lerpFactor = 0.22; // 平滑插值係數

    this.remotePlayers.forEach((remote) => {
      const prevX = remote.container.x;
      const prevY = remote.container.y;

      // 線性插值平滑座標 (Phaser.Math.Linear) 杜絕網路微卡頓
      remote.container.x = Phaser.Math.Linear(prevX, remote.targetX, lerpFactor);
      remote.container.y = Phaser.Math.Linear(prevY, remote.targetY, lerpFactor);

      // 動態 Y 深度排序
      remote.container.setDepth(remote.container.y);
    });

    // 本地座標節流上報
    if (!this.socket || !this.scene.player) return;

    // 檢查互斥機狀態
    if (this.scene.mutexMachine && this.scene.mutexMachine.isMiniGaming) {
      return;
    }

    const p = this.scene.player;
    const now = Date.now();
    if (now - this.lastEmitTime >= this.emitInterval) {
      const currentAnim = this.scene.currentAnimKey || 'idle';
      const isSprinting = this.scene.mutexMachine ? this.scene.mutexMachine.isSprinting : false;
      const isSitting = this.scene.mutexMachine ? this.scene.mutexMachine.isSitting : false;
      const heldItem = (this.scene.mutexMachine && this.scene.mutexMachine.heldItem) ? this.scene.mutexMachine.heldItem : 'none';

      const moved = Math.abs(p.x - this.lastEmittedState.x) > 0.4 || Math.abs(p.y - this.lastEmittedState.y) > 0.4;
      const stateChanged = currentAnim !== this.lastEmittedState.anim ||
                           isSprinting !== this.lastEmittedState.isSprinting ||
                           isSitting !== this.lastEmittedState.isSitting ||
                           heldItem !== this.lastEmittedState.heldItem;

      if (moved || stateChanged) {
        const avatarData = this.scene.playerData ? this.scene.playerData.avatarData : undefined;
        const customBubble = this.scene.playerData ? this.scene.playerData.customBubble : undefined;

        this.socket.emit('player_move', {
          id: this.selfId,
          x: Math.round(p.x * 10) / 10,
          y: Math.round(p.y * 10) / 10,
          anim: currentAnim,
          heldItem: heldItem,
          isSprinting: isSprinting,
          isSitting: isSitting,
          avatarData: avatarData,
          customBubble: customBubble
        });

        this.lastEmittedState = {
          x: p.x,
          y: p.y,
          anim: currentAnim,
          isSprinting: isSprinting,
          isSitting: isSitting,
          heldItem: heldItem
        };
        this.lastEmitTime = now;
      }
    }
  }

  // ==========================================================================
  // 業務事件發射句柄 (Public Emitters)
  // ==========================================================================
  sendMoveImmediate() {
    if (!this.socket || !this.scene.player) return;
    const p = this.scene.player;
    const currentAnim = this.scene.currentAnimKey || 'idle_down';
    const isSprinting = this.scene.mutexMachine ? this.scene.mutexMachine.isSprinting : false;
    const isSitting = this.scene.mutexMachine ? this.scene.mutexMachine.isSitting : false;
    const heldItem = (this.scene.mutexMachine && this.scene.mutexMachine.heldItem) ? this.scene.mutexMachine.heldItem : 'none';
    const avatarData = this.scene.playerData ? this.scene.playerData.avatarData : undefined;
    const customBubble = this.scene.playerData ? this.scene.playerData.customBubble : undefined;

    this.socket.emit('player_move', {
      id: this.selfId,
      x: Math.round(p.x * 10) / 10,
      y: Math.round(p.y * 10) / 10,
      anim: currentAnim,
      heldItem: heldItem,
      isSprinting: isSprinting,
      isSitting: isSitting,
      avatarData: avatarData,
      customBubble: customBubble
    });

    this.lastEmittedState = {
      x: p.x,
      y: p.y,
      anim: currentAnim,
      isSprinting: isSprinting,
      isSitting: isSitting,
      heldItem: heldItem
    };
    this.lastEmitTime = Date.now();
  }

  sendUpdateAvatar(avatarConfig) {
    if (this.socket) {
      this.socket.emit('player_update_avatar', avatarConfig);
    }
  }

  sendChatMessage(message) {
    if (this.socket) {
      this.socket.emit('chat_message', { message });
    }
  }

  sendRouletteSpin() {
    if (this.socket) {
      this.socket.emit('roulette_spin');
    }
  }

  sendToggleClubMode() {
    if (this.socket) {
      this.socket.emit('toggle_club_mode');
    }
  }

  sendItemAction(action, item) {
    if (this.socket) {
      this.socket.emit('item_action', { action, item });
    }
  }

  sendChairInteract(action, chairData) {
    if (this.socket) {
      this.socket.emit('chair_interact', { action, ...chairData });
    }
  }

  sendYouTubeUrl(url, title) {
    if (this.socket) {
      this.socket.emit('submit_youtube_url', { url, title });
    }
  }

  // ==========================================================================
  // DOM 輔助交互方法
  // ==========================================================================
  appendChatLog(data) {
    const logBox = document.getElementById('chat-history-log');
    if (!logBox) return;

    const row = document.createElement('div');
    row.className = 'chat-bubble-log';
    row.innerHTML = `<span class="font-black text-emerald-800">${data.name || 'Colleague'}:</span> <span class="text-slate-800">${data.message}</span>`;
    logBox.appendChild(row);

    // 自動滾動至底部最新訊息
    logBox.scrollTop = logBox.scrollHeight;
  }

  applyClubMode(isActive) {
    const overlay = document.getElementById('club-disco-overlay');
    const clubBtn = document.getElementById('btn-club');

    if (overlay) {
      if (isActive) overlay.classList.add('active');
      else overlay.classList.remove('active');
    }

    if (clubBtn) {
      if (isActive) clubBtn.classList.add('btn-club-active');
      else clubBtn.classList.remove('btn-club-active');
    }
  }

  updateOnlineCounter() {
    const el = document.getElementById('online-count');
    if (el) {
      el.textContent = String(this.remotePlayers.size + 1);
    }
  }
}

/**
 * 依據 Stage 2 規範導出的標準化模組掛載函式 (Modular Function Hook)
 * @param {Phaser.Scene} scene - 主遊戲場景
 * @returns {NetworkManager}
 */
export function initSocketConnections(scene) {
  const manager = new NetworkManager(scene);
  manager.connect();
  return manager;
}
