/**
 * ============================================================================
 * 2D Multiplayer Virtual Office — 網路抽象層 (Network Manager)
 * 規格依據: Specification Section 3 (Multiplayer WebSocket Network Layer & Socket.io)
 * 核心功能:
 *  - Socket.io 連接與自定義封包處理
 *  - 本地座標節流上報 (Throttled player_move)
 *  - 遠端玩家對象維護 Map<string, RemotePlayer>
 *  - 線性插值平滑渲染 (Linear Interpolation Lerp) 消除網路抖動
 *  - 賽博輪盤旋轉同步、YouTube 影音同播、手持點心狀態廣播
 * ============================================================================
 */

export class NetworkManager {
  /**
   * @param {Phaser.Scene} scene - 所屬主場景
   */
  constructor(scene) {
    this.scene = scene;
    this.socket = null;
    this.selfId = null;

    // 遠端在線玩家對照表 Map<socketId, RemotePlayerEntry>
    this.remotePlayers = new Map();

    // 座標上報節流定時器 (約 25Hz ~ 40ms 一次)
    this.lastEmitTime = 0;
    this.emitInterval = 40; // 40ms
    this.lastEmittedState = { x: 0, y: 0, anim: '', isSprinting: false, heldItem: null };
  }

  /**
   * 初始化連接 Socket.io
   */
  connect() {
    // 自動判定當前主機路徑或反向代理端口
    // @ts-ignore
    this.socket = io({
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000
    });

    this.registerEventHandlers();
  }

  /**
   * 註冊 WebSocket 廣播監聽事件
   */
  registerEventHandlers() {
    const socket = this.socket;

    // 1. 初始化狀態套件 (包含本地自定義 ID 與全場既有玩家)
    socket.on('init_state', (data) => {
      console.log(`[Network] 🔗 連線成功! 本地 ID: ${data.selfId}, 當前線上玩家數: ${data.players.length}`);
      this.selfId = data.selfId;

      // 生成自身玩家實體
      this.scene.spawnLocalPlayer(data);

      // 生成其餘現存遠端玩家
      data.players.forEach(pData => {
        if (pData.id !== this.selfId) {
          this.createRemotePlayer(pData);
        }
      });

      // 同步當前多媒體狀態
      if (data.currentMedia && this.scene.updateMediaState) {
        this.scene.updateMediaState(data.currentMedia);
      }

      this.updateOnlineCounter();
    });

    // 2. 新玩家加入事件 (player_join)
    socket.on('player_join', (pData) => {
      console.log(`[Network] 👤 新玩家進入辦公室: ${pData.name} (${pData.id})`);
      if (pData.id !== this.selfId && !this.remotePlayers.has(pData.id)) {
        this.createRemotePlayer(pData);
        this.updateOnlineCounter();
        this.scene.showSystemNotice(`🍃 歡迎同事 ${pData.name} 進入虛擬辦公室！`);
      }
    });

    // 3. 遠端玩家位移與動畫同步 (player_moved)
    socket.on('player_moved', (data) => {
      if (data.id === this.selfId) return;

      const remote = this.remotePlayers.get(data.id);
      if (remote) {
        // 更新目標插值座標 (Target Coordinates for Lerp)
        remote.targetX = data.x;
        remote.targetY = data.y;
        remote.anim = data.anim;
        remote.isSprinting = data.isSprinting;
        remote.isSitting = data.isSitting;
        remote.heldItem = data.heldItem;

        // 更新外觀手持物與方向動畫
        this.updateRemotePlayerVisuals(remote);
      }
    });

    // 4. 遠端玩家手持物改變 (item_state_changed)
    socket.on('item_state_changed', (data) => {
      if (data.id === this.selfId) {
        // 本地玩家食物更新
        this.scene.updateLocalHeldItem(data.heldItem, data.action);
        return;
      }

      const remote = this.remotePlayers.get(data.id);
      if (remote) {
        remote.heldItem = data.heldItem;
        this.updateRemotePlayerVisuals(remote);

        if (data.action === 'consume') {
          this.playEatingAnimation(remote.container);
        }
      }
    });

    // 5. 賽博輪盤旋轉權威同步指令 (roulette_spin_result)
    socket.on('roulette_spin_result', (data) => {
      console.log(`[Network] 🎡 收到輪盤轉動指令: 中獎扇區 [${data.winningIndex}] ${data.sectorLabel}`);
      this.scene.handleServerRouletteSpin(data);
    });

    // 6. 多媒體投影區更新 (media_state_changed)
    socket.on('media_state_changed', (mediaData) => {
      console.log(`[Network] 📺 收到多媒體投影切換廣播: ${mediaData.title}`);
      if (this.scene.updateMediaState) {
        this.scene.updateMediaState(mediaData);
      }
    });

    // 7. 頭頂對話氣泡廣播 (chat_broadcast)
    socket.on('chat_broadcast', (chatData) => {
      this.scene.displayFloatingChatBubble(chatData);
    });

    // 8. 玩家斷線離開 (player_leave)
    socket.on('player_leave', (data) => {
      console.log(`[Network] 🚪 玩家離線: ${data.id}`);
      this.removeRemotePlayer(data.id);
      this.updateOnlineCounter();
    });
  }

  // ==========================================================================
  // 遠端玩家實體生成與管理 (Remote Player Entity Management)
  // ==========================================================================
  createRemotePlayer(data) {
    const species = data.species || 'CAT';
    const shirtColor = data.shirtColor || '#4ECDC4';

    // 構建復合容器 (Composite Sprite Container) 方便頭頂文字、手持食物一體化渲染
    const container = this.scene.add.container(data.x, data.y);
    container.setDepth(data.y);

    // 陰影
    const shadow = this.scene.add.ellipse(0, 22, 28, 10, 0x000000, 0.18);
    container.add(shadow);

    // 主精靈圖 (Avatar Sprite)
    const initialKey = `avatar_${species}_down_0`;
    const sprite = this.scene.add.sprite(0, 0, initialKey);
    // 依據伺服器發放的衣服顏色進行色調渲染
    if (shirtColor) {
      const hex = parseInt(shirtColor.replace('#', '0x'), 16);
      sprite.setTint(hex);
    }
    container.add(sprite);

    // 頭頂可愛姓名標籤 (Rounded Name Tag)
    const nameBg = this.scene.add.graphics();
    nameBg.fillStyle(0xFFFFFF, 0.9);
    nameBg.lineStyle(1.5, 0x78C0A8, 1);
    nameBg.fillRoundedRect(-40, -38, 80, 18, 9);
    nameBg.strokeRoundedRect(-40, -38, 80, 18, 9);
    container.add(nameBg);

    const nameText = this.scene.add.text(0, -29, data.name || 'Visitor', {
      fontFamily: 'Nunito, Quicksand, sans-serif',
      fontSize: '11px',
      color: '#2D3748',
      fontStyle: 'bold'
    }).setOrigin(0.5);
    container.add(nameText);

    // 手持物品懸浮渲染層 (Floating Held Food Icon)
    const foodIcon = this.scene.add.sprite(14, 8, 'item_coke');
    foodIcon.setScale(0.85);
    foodIcon.setVisible(Boolean(data.heldItem));
    if (data.heldItem) {
      foodIcon.setTexture(`item_${data.heldItem.toLowerCase()}`);
    }
    container.add(foodIcon);

    const remoteEntry = {
      id: data.id,
      name: data.name,
      species,
      shirtColor,
      container,
      sprite,
      foodIcon,
      targetX: data.x,
      targetY: data.y,
      anim: data.anim || 'idle_down',
      heldItem: data.heldItem,
      isSprinting: data.isSprinting,
      isSitting: data.isSitting
    };

    this.remotePlayers.set(data.id, remoteEntry);
    return remoteEntry;
  }

  /**
   * 更新遠端玩家外觀狀態
   */
  updateRemotePlayerVisuals(remote) {
    // 1. 動畫幀紋理更新
    let baseAnim = remote.anim || 'idle_down';
    let frameIdx = 0;
    let dir = 'down';

    if (baseAnim.includes('up')) dir = 'up';
    else if (baseAnim.includes('left')) dir = 'left';
    else if (baseAnim.includes('right')) dir = 'right';

    if (remote.isSitting) {
      frameIdx = 3; // 坐姿幀
    } else if (baseAnim.startsWith('walk')) {
      // 依據時間產生雙腳踏步效果
      const tick = Math.floor(this.scene.time.now / 150) % 2;
      frameIdx = tick === 0 ? 1 : 2;
    }

    const key = `avatar_${remote.species}_${dir}_${frameIdx}`;
    if (this.scene.textures.exists(key)) {
      remote.sprite.setTexture(key);
    }

    // 2. 手持物品顯示更新
    if (remote.heldItem) {
      remote.foodIcon.setTexture(`item_${remote.heldItem.toLowerCase()}`);
      remote.foodIcon.setVisible(true);
    } else {
      remote.foodIcon.setVisible(false);
    }
  }

  /**
   * 享用點心時的縮放彈跳動畫 (Scale-bounce Eating Animation)
   */
  playEatingAnimation(container) {
    this.scene.tweens.add({
      targets: container,
      scaleY: 1.25,
      scaleX: 0.9,
      duration: 120,
      yoyo: true,
      repeat: 2,
      ease: 'Sine.easeInOut'
    });
  }

  /**
   * 移除遠端玩家實體
   */
  removeRemotePlayer(id) {
    const remote = this.remotePlayers.get(id);
    if (remote) {
      remote.container.destroy();
      this.remotePlayers.delete(id);
    }
  }

  // ==========================================================================
  // 本地玩家座標上報與插值平滑邏輯 (Client Update Loop)
  // ==========================================================================
  
  /**
   * 在主場景 update 循環中呼叫
   */
  update(time, delta) {
    // 1. 遠端玩家座標線性差值運算 (Linear Interpolation Lerp) 消除網路卡頓
    const lerpFactor = 0.22; // 阻尼係數
    this.remotePlayers.forEach((remote) => {
      const prevX = remote.container.x;
      const prevY = remote.container.y;

      remote.container.x = Phaser.Math.Linear(prevX, remote.targetX, lerpFactor);
      remote.container.y = Phaser.Math.Linear(prevY, remote.targetY, lerpFactor);

      // 動態更新深度排序: depth = container.y
      remote.container.setDepth(remote.container.y);
    });

    // 2. 本地玩家座標節流上報
    if (!this.socket || !this.scene.player) return;

    // 檢查互斥機: 如果處於小遊戲中，嚴格暫停發送位移包
    if (this.scene.mutexMachine && this.scene.mutexMachine.isMiniGaming) {
      return;
    }

    const p = this.scene.player;
    const now = Date.now();
    if (now - this.lastEmitTime >= this.emitInterval) {
      const currentAnim = this.scene.currentAnimKey || 'idle_down';
      const isSprinting = this.scene.mutexMachine ? this.scene.mutexMachine.isSprinting : false;
      const isSitting = this.scene.mutexMachine ? this.scene.mutexMachine.isSitting : false;
      const heldItem = this.scene.mutexMachine ? this.scene.mutexMachine.heldItem : null;

      // 檢查位移或狀態是否有變更
      const moved = Math.abs(p.x - this.lastEmittedState.x) > 0.5 || Math.abs(p.y - this.lastEmittedState.y) > 0.5;
      const stateChanged = currentAnim !== this.lastEmittedState.anim ||
                           isSprinting !== this.lastEmittedState.isSprinting ||
                           isSitting !== this.lastEmittedState.isSitting ||
                           heldItem !== this.lastEmittedState.heldItem;

      if (moved || stateChanged) {
        this.socket.emit('player_move', {
          id: this.selfId,
          x: Math.round(p.x * 10) / 10,
          y: Math.round(p.y * 10) / 10,
          vx: Math.round(p.body.velocity.x),
          vy: Math.round(p.body.velocity.y),
          anim: currentAnim,
          heldItem: heldItem,
          isSprinting: isSprinting,
          isSitting: isSitting
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
  // 外部業務觸發封包接口 (Public Emitters)
  // ==========================================================================

  sendChatMessage(message) {
    if (this.socket) {
      this.socket.emit('chat_message', { message });
    }
  }

  sendSpinRoulette() {
    if (this.socket) {
      this.socket.emit('spin_roulette');
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

  updateOnlineCounter() {
    const el = document.getElementById('online-count');
    if (el) {
      el.textContent = String(this.remotePlayers.size + 1);
    }
  }
}
