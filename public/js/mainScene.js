/**
 * ============================================================================
 * 2D Multiplayer Virtual Office — Phaser 3 主場景 (Main Game Scene)
 * 規格依據: Specification Section 1 & 2 (Architecture, Z-Sorting, Map Generation)
 * 核心職責:
 *  - 程式化生成無縫 1600x1200 辦公空間地圖 (8桌矩陣、北面投影屏、復古街機廳、茶水吧檯、衛生間、賽博輪盤)
 *  - Z-Index 嚴格層次管理與每幀 Y軸動態深度排序 (`sprite.depth = sprite.y`)
 *  - Arcade Physics 固態碰撞體與角色控制
 *  - 設施距離感測器 (Proximity Detectors) 與 YouTube 影音音量動態衰減
 *  - 賽博輪盤 4000ms 緩動減速動畫 (Cubic.easeOut Tween)
 *  - 頭頂浮動對話氣泡動態生成與 5 秒自毀機制
 * ============================================================================
 */

import { GAME_CONFIG } from './config.js';
import { TextureGenerator } from './textures.js';
import { StateMutexMachine } from './stateMachine.js';
import { NetworkManager, initSocketConnections } from './network.js';
import { UIManager } from './uiManager.js';
import { SnakeMiniGame } from './snakeGame.js';

export class MainScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MainScene' });

    // 核心子系統
    this.mutexMachine = null;
    this.network = null;
    this.ui = null;

    // 玩家實體
    this.player = null;
    this.playerContainer = null;
    this.playerSprite = null;
    this.playerFoodIcon = null;
    this.currentAnimKey = 'idle_down';

    // 靜態物理碰撞組 (Static Physics Body Group)
    this.staticColliders = null;

    // 互動設施清單
    this.chairs = [];
    this.interactiveObjects = [];

    // 輪盤精靈參照
    this.rouletteWheelSprite = null;
    this.isRouletteSpinning = false;

    // 當前多媒體投影屏實體
    this.mediaScreenSprite = null;
    this.youtubeDomObject = null;
    this.currentMediaData = null;

    // NPC DJ
    this.npcDjContainer = null;
  }

  // ==========================================================================
  // 1. 資源預載 (Preload Lifecycle)
  // ==========================================================================
  preload() {
    console.log('[Scene] 🎨 正在執行程式化材質生成...');
    TextureGenerator.generateAll(this);
  }

  // ==========================================================================
  // 2. 場景建立 (Create Lifecycle)
  // ==========================================================================
  create() {
    console.log('[Scene] 🚀 正在構建 2D 虛擬辦公空間世界...');

    // 1. 初始化狀態互斥機與網路管理器
    this.mutexMachine = new StateMutexMachine();
    this.network = initSocketConnections(this);

    // 2. 設置物理世界邊界 (World Bounds)
    this.physics.world.setBounds(0, 0, GAME_CONFIG.WORLD_WIDTH, GAME_CONFIG.WORLD_HEIGHT);
    this.staticColliders = this.physics.add.staticGroup();

    // 3. 構建 Layer 0: 地板圖層 (Floor Tilemap)
    this.buildFloorLayers();

    // 4. 構建空間區域與固態實體 (Zones & Solid Objects)
    this.buildOfficeMatrixZone();    // 8-Set 辦公桌集群矩陣
    this.buildMultimediaZone();       // 北面 YouTube 投影區
    this.buildArcadeLoungeZone();     // 遊戲娛樂休息廳 (沙發+CRT電視+PS5)
    this.buildPantryZone();           // 茶水間木質吧檯與雙門冰箱
    this.buildRestroomZone();         // 衛生間雙獨立隔間
    this.buildRouletteZone();         // 賽博輪盤抽獎區
    this.buildDjLoungeBooth();        // 露台 NPC DJ 音樂台

    // 5. 初始化 UI 控制器 (包含虛擬搖桿與神殿透明按鈕)
    this.ui = new UIManager(this);

    // 6. 連接 Socket.io WebSocket 服務器
    this.network.connect();

    // 7. 綁定鍵盤方向鍵輸入
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = {
      up: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D)
    };
  }

  // ==========================================================================
  // 3. 地圖分區建構函式集 (Modular Map Builders)
  // ==========================================================================

  /**
   * Layer 0: 繪製地坪紋理、地毯與空間分區地磚
   */
  buildFloorLayers() {
    const W = GAME_CONFIG.WORLD_WIDTH;
    const H = GAME_CONFIG.WORLD_HEIGHT;

    // A. 全局木質拼花地板 (Tiled Parquet Wood)
    const baseFloor = this.add.tileSprite(W / 2, H / 2, W, H, 'floor_wood');
    baseFloor.setDepth(GAME_CONFIG.LAYERS.FLOOR);

    // B. 主辦公區大圓角薄荷綠地毯 (2塊地毯覆蓋兩大工作矩陣)
    const rug1 = this.add.image(GAME_CONFIG.ZONES.OFFICE_CLUSTER_1.x + 80, GAME_CONFIG.ZONES.OFFICE_CLUSTER_1.y + 60, 'rug_office');
    rug1.setDepth(GAME_CONFIG.LAYERS.FLOOR + 1);

    const rug2 = this.add.image(GAME_CONFIG.ZONES.OFFICE_CLUSTER_2.x + 80, GAME_CONFIG.ZONES.OFFICE_CLUSTER_2.y + 60, 'rug_office');
    rug2.setDepth(GAME_CONFIG.LAYERS.FLOOR + 1);

    // C. 遊戲娛樂區溫馨珊瑚粉地毯
    const rugLounge = this.add.image(GAME_CONFIG.ZONES.ARCADE_LOUNGE.x, GAME_CONFIG.ZONES.ARCADE_LOUNGE.y + 20, 'rug_lounge');
    rugLounge.setDepth(GAME_CONFIG.LAYERS.FLOOR + 1);

    // D. 茶水區棋盤格地磚 (Checkerboard Linoleum)
    const pantryTile = this.add.tileSprite(GAME_CONFIG.ZONES.PANTRY_BAR.x + 20, GAME_CONFIG.ZONES.PANTRY_BAR.y + 20, 360, 260, 'floor_linoleum');
    pantryTile.setDepth(GAME_CONFIG.LAYERS.FLOOR + 1);

    // E. 衛生間清爽淡藍瓷磚
    const wcTile = this.add.tileSprite(270, 880, 380, 280, 'floor_restroom');
    wcTile.setDepth(GAME_CONFIG.LAYERS.FLOOR + 1);

    // F. 世界外圍防穿透護牆 (Room Perimeter Solid Walls)
    const wallThickness = 32;
    // 北牆
    const northWall = this.add.rectangle(W / 2, wallThickness / 2, W, wallThickness, 0x475569);
    this.staticColliders.add(northWall);
    // 南牆
    const southWall = this.add.rectangle(W / 2, H - wallThickness / 2, W, wallThickness, 0x475569);
    this.staticColliders.add(southWall);
    // 西牆
    const westWall = this.add.rectangle(wallThickness / 2, H / 2, wallThickness, H, 0x475569);
    this.staticColliders.add(westWall);
    // 東牆
    const eastWall = this.add.rectangle(W - wallThickness / 2, H / 2, wallThickness, H, 0x475569);
    this.staticColliders.add(eastWall);
  }

  /**
   * 1. 主辦公區: 8個辦公桌矩陣 (2x2 兩大集群)
   * 每個桌位包含: 1 圓角螢幕、1 緊湊鍵盤、1 筆電、1 迷你主機、1 旋轉椅
   */
  buildOfficeMatrixZone() {
    const clusters = [
      GAME_CONFIG.ZONES.OFFICE_CLUSTER_1,
      GAME_CONFIG.ZONES.OFFICE_CLUSTER_2
    ];

    let deskIndex = 1;

    clusters.forEach((clusterAnchor, cIdx) => {
      // 每個集群為 2x2 排列，共 4 桌
      for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 2; col++) {
          const dx = clusterAnchor.x + col * 128;
          const dy = clusterAnchor.y + row * 110;
          const currentDeskId = `desk_${cIdx}_${row}_${col}`;

          // A. 辦公桌實體 (具有固態碰撞)
          const desk = this.staticColliders.create(dx, dy, 'desk_single');
          desk.setDepth(dy);
          desk.refreshBody();

          // B. 桌面四合一設備 (Layer 2: Overlays)
          // 1. 圓角螢幕 (Monitor)
          const monitor = this.add.image(dx - 18, dy - 8, 'prop_monitor');
          monitor.setDepth(dy + 1);

          // 2. 緊湊鍵盤 (Keyboard)
          const keyboard = this.add.image(dx - 18, dy + 12, 'prop_keyboard');
          keyboard.setDepth(dy + 1);

          // 3. 可愛粉色筆電 (Laptop)
          const laptop = this.add.image(dx + 22, dy + 8, 'prop_laptop');
          laptop.setDepth(dy + 1);

          // 4. 迷你桌上主機 (Mini CPU)
          const cpu = this.add.image(dx + 34, dy - 6, 'prop_cpu');
          cpu.setDepth(dy + 1);

          // C. 旋轉人體工學椅 (Swivel Office Chair)
          const chairY = dy + 38;
          const chair = this.add.image(dx - 18, chairY, 'office_chair');
          chair.setDepth(chairY - 1); // 椅子比桌子稍前，可被玩家坐下覆蓋

          // 註冊為可坐下的椅子交互點
          const chairData = {
            id: currentDeskId,
            x: dx - 18,
            y: chairY,
            standX: dx - 18,
            standY: chairY + 28
          };
          this.chairs.push(chairData);

          deskIndex++;
        }
      }
    });
  }

  /**
   * 2. 多媒體投影區 (北面大屏幕 YouTube Proximity Player)
   */
  buildMultimediaZone() {
    const pos = GAME_CONFIG.ZONES.MEDIA_SCREEN;

    // 大屏幕投影布幕實體
    this.mediaScreenSprite = this.staticColliders.create(pos.x, pos.y, 'prop_projector_screen');
    this.mediaScreenSprite.setDepth(pos.y);
    this.mediaScreenSprite.refreshBody();

    // 投影地毯互動光圈標記
    const zoneBeacon = this.add.graphics();
    zoneBeacon.lineStyle(2, 0x38BDF8, 0.6);
    zoneBeacon.fillStyle(0x38BDF8, 0.12);
    zoneBeacon.strokeCircle(pos.x, pos.y + 45, 45);
    zoneBeacon.fillCircle(pos.x, pos.y + 45, 45);
    zoneBeacon.setDepth(GAME_CONFIG.LAYERS.FLOOR + 2);

    // 註冊近距離感應設施
    this.interactiveObjects.push({
      type: 'SCREEN',
      x: pos.x,
      y: pos.y + 45,
      radius: 65,
      label: '📺 Click or Press E to Share / Watch YouTube Video'
    });
  }

  /**
   * 3. 遊戲娛樂區 (L型厚實沙發 + 復古 CRT 電視 + PS5)
   */
  buildArcadeLoungeZone() {
    const lounge = GAME_CONFIG.ZONES.ARCADE_LOUNGE;

    // A. 復古木紋 CRT 電視 (電視具有固態碰撞)
    const tv = this.staticColliders.create(lounge.tvPos.x, lounge.tvPos.y, 'prop_crt_tv');
    tv.setDepth(lounge.tvPos.y);
    tv.refreshBody();

    // B. 白色 PS5 主機立在電視旁
    const ps5 = this.add.image(lounge.tvPos.x + 44, lounge.tvPos.y + 2, 'prop_ps5');
    ps5.setDepth(lounge.tvPos.y);

    // C. 鼠尾草綠 L型沙發 (具有碰撞體)
    const couch = this.staticColliders.create(lounge.x, lounge.y, 'lounge_couch');
    couch.setDepth(lounge.y);
    couch.refreshBody();

    // 註冊電視為街機小遊戲觸發器 (Interact for Snake)
    this.interactiveObjects.push({
      type: 'TV',
      x: lounge.tvPos.x,
      y: lounge.tvPos.y + 36,
      radius: 60,
      label: '🕹️ Press E or Action to Play Retro Snake Arcade!'
    });
  }

  /**
   * 4. 茶水點心吧檯與雙門冰箱 (Pantry Bar & Dual Refrigerator)
   */
  buildPantryZone() {
    const pantry = GAME_CONFIG.ZONES.PANTRY_BAR;

    // A. 圓弧木質吧檯長桌 (具有物理碰撞體)
    const bar = this.staticColliders.create(pantry.x, pantry.y, 'bar_counter');
    bar.setDepth(pantry.y);
    bar.refreshBody();

    // B. 吧檯椅 (3 張高腳圓凳)
    [-55, 0, 55].forEach((offset, idx) => {
      const stool = this.add.image(pantry.x + offset, pantry.y + 30, 'bar_stool');
      stool.setDepth(pantry.y + 30);

      this.chairs.push({
        id: `bar_stool_${idx}`,
        x: pantry.x + offset,
        y: pantry.y + 26,
        standX: pantry.x + offset,
        standY: pantry.y + 54
      });
    });

    // C. 吧檯上的咖啡壺與餐具點綴
    const sampleDrink = this.add.image(pantry.x - 40, pantry.y - 8, 'item_coke');
    sampleDrink.setDepth(pantry.y + 2);
    const sampleSnack = this.add.image(pantry.x + 35, pantry.y - 8, 'item_snack');
    sampleSnack.setDepth(pantry.y + 2);

    // D. 雙門淡奶油色冰箱 (具有物理碰撞體)
    const fridge = this.staticColliders.create(pantry.fridgePos.x, pantry.fridgePos.y, 'prop_fridge');
    fridge.setDepth(pantry.fridgePos.y);
    fridge.refreshBody();

    // 註冊冰箱互動感應點
    this.interactiveObjects.push({
      type: 'FRIDGE',
      x: pantry.fridgePos.x,
      y: pantry.fridgePos.y + 40,
      radius: 55,
      label: '🥤 Press E or Action to Open Fridge (Coke, Snack, Pizza)'
    });
  }

  /**
   * 5. 衛生間隔間 (雙獨立馬桶與洗手台)
   */
  buildRestroomZone() {
    const s1 = GAME_CONFIG.ZONES.RESTROOM_STALL_1;
    const s2 = GAME_CONFIG.ZONES.RESTROOM_STALL_2;

    // 實體隔間牆 (Stall Boundary Walls)
    const wall1 = this.staticColliders.create(s1.x, s1.y + 30, 'stall_wall_v');
    wall1.setDepth(s1.y + 30);
    wall1.refreshBody();

    const wall2 = this.staticColliders.create(s2.x - 20, s2.y + 30, 'stall_wall_v');
    wall2.setDepth(s2.y + 30);
    wall2.refreshBody();

    // 馬桶 1 & 2
    const toilet1 = this.staticColliders.create(s1.x + 40, s1.y, 'prop_toilet');
    toilet1.setDepth(s1.y);
    toilet1.refreshBody();

    const toilet2 = this.staticColliders.create(s2.x + 30, s2.y, 'prop_toilet');
    toilet2.setDepth(s2.y);
    toilet2.refreshBody();

    // 洗手台與梳妝鏡 (Vanity Wash Sinks)
    const sink1 = this.staticColliders.create(s1.x + 40, s1.y + 70, 'prop_sink');
    sink1.setDepth(s1.y + 70);
    sink1.refreshBody();

    const sink2 = this.staticColliders.create(s2.x + 30, s2.y + 70, 'prop_sink');
    sink2.setDepth(s2.y + 70);
    sink2.refreshBody();
  }

  /**
   * 6. 賽博大輪盤 (Cyber Roulette 8-Sector Wheel)
   */
  buildRouletteZone() {
    const pos = GAME_CONFIG.ZONES.ROULETTE;

    // 輪盤底座地毯
    const rug = this.add.graphics();
    rug.fillStyle(0xFFD166, 0.2);
    rug.lineStyle(2, 0xFFD166, 0.8);
    rug.fillCircle(pos.x, pos.y, 75);
    rug.strokeCircle(pos.x, pos.y, 75);
    rug.setDepth(GAME_CONFIG.LAYERS.FLOOR + 2);

    // 輪盤可旋轉精靈本體
    this.rouletteWheelSprite = this.add.sprite(pos.x, pos.y, 'roulette_wheel');
    this.rouletteWheelSprite.setDepth(pos.y);

    // 頂部金色指針
    const needle = this.add.image(pos.x, pos.y - 62, 'roulette_needle');
    needle.setDepth(pos.y + 10);

    // 註冊輪盤互動感應點
    this.interactiveObjects.push({
      type: 'ROULETTE',
      x: pos.x,
      y: pos.y + 40,
      radius: 65,
      label: '🎡 Press E or Action to Spin Cyber Roulette!'
    });
  }

  /**
   * 7. 露台 NPC DJ (K.K. Slider 音樂狗)
   */
  buildDjLoungeBooth() {
    const pos = GAME_CONFIG.ZONES.DJ_BOOTH;

    // DJ 混音控制台
    const booth = this.staticColliders.create(pos.x, pos.y, 'dj_booth');
    booth.setDepth(pos.y);
    booth.refreshBody();

    // NPC DJ 狗實體 (White Puppy with Headphones)
    this.npcDjContainer = this.add.container(pos.x, pos.y - 18);
    this.npcDjContainer.setDepth(pos.y - 1);

    const djSprite = this.add.sprite(0, 0, 'avatar_PUPPY_down_0');
    djSprite.setTint(0xFFFFFF); // 純白吉娃娃
    this.npcDjContainer.add(djSprite);

    // DJ 律動搖擺 Tween 動畫
    this.tweens.add({
      targets: this.npcDjContainer,
      y: pos.y - 22,
      duration: 350,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // 閃耀音符粒子特效 (Music Notes Floating)
    this.time.addEvent({
      delay: 1200,
      loop: true,
      callback: () => {
        const noteText = this.add.text(
          pos.x + (Math.random() * 40 - 20),
          pos.y - 40,
          ['🎵', '🎶', '✨', '🎧'][Math.floor(Math.random() * 4)],
          { fontSize: '16px' }
        ).setOrigin(0.5).setDepth(pos.y + 50);

        this.tweens.add({
          targets: noteText,
          y: pos.y - 75,
          alpha: 0,
          duration: 1600,
          onComplete: () => noteText.destroy()
        });
      }
    });
  }

  // ==========================================================================
  // 4. 本地玩家生成與控制 (Local Player Spawning & Lifecycle)
  // ==========================================================================

  /**
   * 根據伺服器發放的 init_state 生成本地玩家實體
   */
  spawnLocalPlayer(initData) {
    const selfData = initData.players.find(p => p.id === initData.selfId) || {
      x: 640,
      y: 720,
      species: 'CAT',
      shirtColor: '#4ECDC4',
      name: 'Player'
    };

    console.log(`[Scene] 🎮 生成主角: ${selfData.name} (${selfData.species})`);

    // 1. 建立玩家物理精靈 (Arcade Dynamic Body)
    this.player = this.physics.add.sprite(selfData.x, selfData.y, `avatar_${selfData.species}_down_0`);
    this.player.setSize(22, 16);
    this.player.setOffset(13, 34); // 腳底碰撞判定盒
    this.player.setCollideWorldBounds(true);

    // 實體間物理碰撞 (Player vs Static Furniture & Walls)
    this.physics.add.collider(this.player, this.staticColliders);

    // 2. 建立本地外觀復合容器 (Name Tag & Food Hand Layout)
    this.playerContainer = this.add.container(selfData.x, selfData.y);
    this.playerContainer.setDepth(selfData.y);

    // 陰影
    const shadow = this.add.ellipse(0, 22, 28, 10, 0x000000, 0.2);
    this.playerContainer.add(shadow);

    // 主角外觀精靈
    this.playerSprite = this.add.sprite(0, 0, `avatar_${selfData.species}_down_0`);
    if (selfData.shirtColor) {
      const hex = parseInt(selfData.shirtColor.replace('#', '0x'), 16);
      this.playerSprite.setTint(hex);
    }
    this.playerContainer.add(this.playerSprite);

    // 主角頭頂可愛金色姓名標籤 (Gold Name Tag)
    const nameBg = this.add.graphics();
    nameBg.fillStyle(0xFFF9E6, 0.95);
    nameBg.lineStyle(2, 0xF59E0B, 1);
    nameBg.fillRoundedRect(-44, -38, 88, 18, 9);
    nameBg.strokeRoundedRect(-44, -38, 88, 18, 9);
    this.playerContainer.add(nameBg);

    const nameText = this.add.text(0, -29, `★ ${selfData.name}`, {
      fontFamily: 'Nunito, Quicksand, sans-serif',
      fontSize: '11px',
      color: '#92400E',
      fontStyle: 'bold'
    }).setOrigin(0.5);
    this.playerContainer.add(nameText);

    // 手持食物懸浮圖標
    this.playerFoodIcon = this.add.sprite(14, 8, 'item_coke');
    this.playerFoodIcon.setScale(0.85);
    this.playerFoodIcon.setVisible(false);
    this.playerContainer.add(this.playerFoodIcon);

    // 3. 鏡頭鎖定與跟隨 (Camera Follow with Damping)
    this.cameras.main.startFollow(this.player, true, 0.08, 0.08);
    this.cameras.main.setBounds(0, 0, GAME_CONFIG.WORLD_WIDTH, GAME_CONFIG.WORLD_HEIGHT);
    this.cameras.main.setZoom(1.25); // 舒適動森特寫縮放

    this.playerData = selfData;

    // 更新 HUD 玩家姓名
    const hudName = document.getElementById('hud-player-name');
    if (hudName) hudName.textContent = selfData.name;
  }

  // ==========================================================================
  // 5. 每幀主循環邏輯 (Update Loop: Movement, Mutex, Depth, Proximity)
  // ==========================================================================
  update(time, delta) {
    if (!this.player || !this.player.body) return;

    // 1. 同步外觀容器與物理實體座標
    this.playerContainer.x = this.player.x;
    this.playerContainer.y = this.player.y;

    // 2. 嚴格 Y軸深度排序 (Dynamic Y-Sort Depth Hierarchy)
    // 防止穿模 (Walking behind / in front of desks & objects)
    this.playerContainer.setDepth(this.player.y);
    this.player.setDepth(this.player.y);

    // 3. 狀態機互斥規則檢查 (Strict Mutex Machine Execution)
    if (this.mutexMachine.isSitting) {
      // 坐姿狀態: 速度全歸零，鎖死所有移動
      this.player.body.setVelocity(0, 0);
      this.currentAnimKey = 'sit_down';
      this.updatePlayerVisuals('down', true, false);
      this.network.update(time, delta);
      return;
    }

    if (this.mutexMachine.isMiniGaming) {
      // 小遊戲狀態: 速度歸零，輸入移交街機引擎
      this.player.body.setVelocity(0, 0);
      this.network.update(time, delta);
      return;
    }

    // 4. 計算綜合運動輸入向量 (Keyboard + Mobile Virtual Joystick)
    let vx = 0;
    let vy = 0;

    // A. 鍵盤輸入 (WASD & Arrow Keys)
    if (this.cursors.left.isDown || this.wasd.left.isDown) vx -= 1;
    if (this.cursors.right.isDown || this.wasd.right.isDown) vx += 1;
    if (this.cursors.up.isDown || this.wasd.up.isDown) vy -= 1;
    if (this.cursors.down.isDown || this.wasd.down.isDown) vy += 1;

    // B. 虛擬搖桿輸入
    if (this.ui && this.ui.joystickActive) {
      vx += this.ui.joystickDelta.x;
      vy += this.ui.joystickDelta.y;
    }

    // C. 速度計算與 2.5 倍衝刺乘數 (Speed Multiplier Engine)
    const isMoving = Math.abs(vx) > 0.05 || Math.abs(vy) > 0.05;
    const currentSpeed = this.mutexMachine.isSprinting
      ? GAME_CONFIG.SPEED_SPRINT
      : GAME_CONFIG.SPEED_WALK;

    if (isMoving) {
      // 正規化向量防止對角線移動過快
      const angle = Math.atan2(vy, vx);
      this.player.body.setVelocity(
        Math.cos(angle) * currentSpeed,
        Math.sin(angle) * currentSpeed
      );

      // 判定朝向
      let dir = 'down';
      if (Math.abs(vx) > Math.abs(vy)) {
        dir = vx > 0 ? 'right' : 'left';
      } else {
        dir = vy > 0 ? 'down' : 'up';
      }

      this.currentAnimKey = `walk_${dir}`;
      this.updatePlayerVisuals(dir, false, true);
    } else {
      this.player.body.setVelocity(0, 0);
      const lastDir = this.currentAnimKey.split('_')[1] || 'down';
      this.currentAnimKey = `idle_${lastDir}`;
      this.updatePlayerVisuals(lastDir, false, false);
    }

    // 5. 檢測附近可互動設施 (Proximity Detectors)
    this.checkNearbyInteractives();

    // 6. 推進網路線性插值平滑邏輯
    this.network.update(time, delta);
  }

  /**
   * 更新主角精靈幀與踏步動畫
   */
  updatePlayerVisuals(dir, isSit = false, isWalk = false) {
    if (!this.playerSprite || !this.playerData) return;

    let frame = 0;
    if (isSit) {
      frame = 3;
    } else if (isWalk) {
      const tick = Math.floor(this.time.now / 140) % 2;
      frame = tick === 0 ? 1 : 2;
    }

    const key = `avatar_${this.playerData.species}_${dir}_${frame}`;
    if (this.textures.exists(key)) {
      this.playerSprite.setTexture(key);
    }
  }

  // ==========================================================================
  // 6. 互動感測器與設施邏輯 (Interactive Proximity Engine)
  // ==========================================================================

  checkNearbyInteractives() {
    if (!this.player) return;
    const px = this.player.x;
    const py = this.player.y;

    let closest = null;
    let minDistance = Infinity;

    // 1. 檢查一般設施 (Screen, Fridge, TV, Roulette)
    for (const obj of this.interactiveObjects) {
      const d = Phaser.Math.Distance.Between(px, py, obj.x, obj.y);
      if (d <= obj.radius && d < minDistance) {
        minDistance = d;
        closest = { type: obj.type, label: obj.label, data: obj };
      }

      // 多媒體投影音量隨距離衰減感測 (Proximity Audio Volume)
      if (obj.type === 'SCREEN') {
        this.ui.updateProximityAudio(d);
      }
    }

    // 2. 檢查椅子交互 (Chairs)
    if (!this.mutexMachine.isSitting) {
      for (const chair of this.chairs) {
        const d = Phaser.Math.Distance.Between(px, py, chair.x, chair.y);
        if (d <= 35 && d < minDistance) {
          minDistance = d;
          closest = {
            type: 'CHAIR',
            label: '🪑 Press Action or Stand button to Sit',
            data: chair
          };
        }
      }
    }

    // 更新 UI 提示 Banner 與 Action 按鈕
    this.ui.setNearbyInteractive(closest);
  }

  // ==========================================================================
  // 7. 具體交互動作處置 (Interaction Action Handlers)
  // ==========================================================================

  /**
   * 坐下動作 (Sit Down Action)
   */
  performSitDown(chair) {
    if (!this.mutexMachine.canSit()) return;

    this.mutexMachine.enterSit(chair, this.player);

    // 平滑瞬移坐入椅子中央
    this.player.setPosition(chair.x, chair.y);
    this.playerContainer.setPosition(chair.x, chair.y);

    // 發送坐下同步封包至伺服器
    this.network.sendChairInteract('sit', {
      chairId: chair.id,
      x: chair.x,
      y: chair.y,
      anim: 'sit_down'
    });
  }

  /**
   * 站起動作 (Stand Up Action)
   */
  performStandUp() {
    if (!this.mutexMachine.isSitting) return;

    const chair = this.mutexMachine.activeChair;
    const standX = chair ? chair.standX : this.player.x;
    const standY = chair ? chair.standY : (this.player.y + 24);

    this.mutexMachine.standUp(this.player);

    this.player.setPosition(standX, standY);
    this.playerContainer.setPosition(standX, standY);

    this.network.sendChairInteract('stand', {
      standX,
      standY
    });
  }

  /**
   * 開啟復古街機貪吃蛇小遊戲 (Launch Snake Arcade)
   */
  launchArcadeSnake() {
    if (!this.mutexMachine.canEnterMiniGame()) return;

    this.mutexMachine.enterMiniGame(this.player);

    // 實例化街機 DOM 引擎
    const snakeApp = new SnakeMiniGame(document.body, () => {
      // 小遊戲結束回調
      this.mutexMachine.exitMiniGame(this.player);
      console.log('[Scene] 🎮 已退出街機小遊戲，返回主辦公室。');
    });

    snakeApp.start();
  }

  /**
   * 從冰箱領取食物
   */
  pickupFoodFromFridge(itemType) {
    this.mutexMachine.setHeldItem(itemType);
    this.updateLocalHeldItem(itemType, 'pickup');
    this.network.sendItemAction('pickup', itemType);
    this.showSystemNotice(`🍔 你從冰箱拿出了冰涼可口的 ${itemType}！`);
  }

  /**
   * 享用當前手持點心
   */
  consumeCurrentHeldItem() {
    const item = this.mutexMachine.consumeHeldItem();
    if (!item) return;

    this.updateLocalHeldItem(null, 'consume');
    this.network.sendItemAction('consume', item);

    // 播放彈跳進食動畫
    this.tweens.add({
      targets: this.playerContainer,
      scaleY: 1.25,
      scaleX: 0.9,
      duration: 120,
      yoyo: true,
      repeat: 2,
      ease: 'Sine.easeInOut'
    });

    this.showSystemNotice(`✨ 咕嚕咕嚕... 你享用了 ${item}，體力精力全滿！`);
  }

  /**
   * 更新本地手持圖標渲染
   */
  updateLocalHeldItem(item, action) {
    if (this.playerFoodIcon) {
      if (item) {
        this.playerFoodIcon.setTexture(`item_${item.toLowerCase()}`);
        this.playerFoodIcon.setVisible(true);
      } else {
        this.playerFoodIcon.setVisible(false);
      }
    }
    if (this.ui) {
      this.ui.updateHeldItemUI(item);
    }
  }

  // ==========================================================================
  // 8. 賽博輪盤權威同步與緩動動畫 (Roulette Cubic.easeOut Tween)
  // ==========================================================================
  handleServerRouletteSpin(data) {
    if (!this.rouletteWheelSprite) return;

    // 0~36 號輪盤開獎角度計算
    const sliceAngle = 360 / 37;
    const baseRounds = 360 * 5; // 順時針高速旋轉 5 圈
    const targetAngle = baseRounds + (360 - (data.winningIndex * sliceAngle));

    this.isRouletteSpinning = true;

    // 觸發 4 秒減速緩動 (Cubic.easeOut Tween)
    this.tweens.add({
      targets: this.rouletteWheelSprite,
      angle: targetAngle,
      duration: data.durationMs || 4000,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        this.isRouletteSpinning = false;
        // 歸一化角度防止浮點數溢出
        this.rouletteWheelSprite.angle = this.rouletteWheelSprite.angle % 360;

        // 彈出中獎公告橫幅
        this.showRoulettePrizeBanner(data);
      }
    });
  }

  showRoulettePrizeBanner(data) {
    const banner = document.getElementById('roulette-prize-banner');
    const title = document.getElementById('roulette-prize-title');
    const desc = document.getElementById('roulette-prize-desc');

    if (banner && title && desc) {
      const num = data.winningIndex !== undefined ? data.winningIndex : 0;
      const isGreen = num === 0;
      const isRed = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36].includes(num);
      const colorLabel = isGreen ? '🟢 [零號守護 Green 0]' : (isRed ? '🔴 [幸運赤紅 Red]' : '⚫ [曜石暗黑 Black]');
      const label = `中獎號碼 #${num} ${colorLabel} (+${num * 10 + 50} Bells)`;

      title.textContent = `🎉 恭喜同事 ${data.spunByName || 'Colleague'} 轉出大獎！`;
      desc.textContent = label;
      banner.classList.remove('hidden');

      setTimeout(() => {
        banner.classList.add('hidden');
      }, 5000);
    }
  }

  // ==========================================================================
  // 9. 多媒體投影區更新 (YouTube Player DOM Management)
  // ==========================================================================
  updateMediaState(mediaData) {
    this.currentMediaData = mediaData;
    const banner = document.getElementById('media-now-playing');
    if (banner) {
      banner.textContent = `▶ Now Playing: ${mediaData.title || 'Multiplayer Video'}`;
    }

    const content = document.getElementById('youtube-player-content');
    if (content && mediaData.embedUrl) {
      content.innerHTML = `
        <iframe 
          id="youtube-iframe"
          width="100%" 
          height="100%" 
          src="${mediaData.embedUrl}" 
          frameborder="0" 
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
          allowfullscreen>
        </iframe>
      `;
    }
  }

  // ==========================================================================
  // 10. 頭頂對話氣泡 (Floating Overhead Chat Bubbles with 5s Timer)
  // ==========================================================================
  displayFloatingChatBubble(chatData) {
    // 尋找目標容器 (自身或遠端玩家)
    let targetContainer = null;
    if (chatData.id === this.network.selfId) {
      targetContainer = this.playerContainer;
    } else {
      const remote = this.network.remotePlayers.get(chatData.id);
      if (remote) targetContainer = remote.container;
    }

    if (!targetContainer) return;

    // 建立浮動氣泡容器
    const bubble = this.add.container(0, -56);
    bubble.setDepth(targetContainer.y + 1000);

    // 繪製文字量測尺寸
    const textStyle = {
      fontFamily: 'Nunito, Quicksand, sans-serif',
      fontSize: '13px',
      color: '#1E293B',
      fontStyle: 'bold',
      wordWrap: { width: 160, useAdvancedWrap: true },
      align: 'center'
    };

    const tempText = this.add.text(0, 0, chatData.message, textStyle).setOrigin(0.5);
    const bounds = tempText.getBounds();
    const padX = 14;
    const padY = 8;
    const bw = Math.max(bounds.width + padX * 2, 44);
    const bh = bounds.height + padY * 2;

    // 繪製圓角黏土質感白色底框與小尾巴
    const bg = this.add.graphics();
    bg.fillStyle(0xFFFFFF, 0.96);
    bg.lineStyle(2, 0x78C0A8, 1);
    bg.fillRoundedRect(-bw / 2, -bh / 2, bw, bh, 10);
    bg.strokeRoundedRect(-bw / 2, -bh / 2, bw, bh, 10);

    // 氣泡指向小三角
    bg.beginPath();
    bg.moveTo(-5, bh / 2);
    bg.lineTo(0, bh / 2 + 6);
    bg.lineTo(5, bh / 2);
    bg.closePath();
    bg.fill();
    bg.stroke();

    bubble.add(bg);
    bubble.add(tempText);
    targetContainer.add(bubble);

    // 浮起微動動畫
    this.tweens.add({
      targets: bubble,
      y: -64,
      duration: 300,
      ease: 'Back.easeOut'
    });

    // 5秒延遲自毀定時器 (5000ms delayedCall)
    this.time.delayedCall(5000, () => {
      this.tweens.add({
        targets: bubble,
        alpha: 0,
        y: -76,
        duration: 400,
        onComplete: () => {
          bubble.destroy();
        }
      });
    });
  }

  showSystemNotice(msg) {
    const banner = document.getElementById('system-notice');
    if (banner) {
      banner.textContent = msg;
      banner.classList.remove('hidden');
      setTimeout(() => banner.classList.add('hidden'), 3500);
    }
  }
}
