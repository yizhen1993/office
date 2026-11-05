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
    this.playerBaseSprite = null;
    this.playerOutfitSprite = null;
    this.playerHairSprite = null;
    this.playerNameText = null;
    this.playerBubbleContainer = null;
    this.playerBubbleSprite = null;
    this.playerFoodIcon = null;
    this.playerData = null;
    this.savedAvatarConfig = null;
    this.currentAnimKey = 'idle_down';

    // 靜態物理碰撞組 (Static Physics Body Group)
    this.staticColliders = null;

    // 互動設施清單
    this.chairs = [];
    this.interactiveObjects = [];
    this.lastSitToggleTime = 0; // 坐姿與互動觸發冷卻防抖時間戳

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
  // 0. 本地持久化裝扮讀取 (Init Lifecycle & LocalStorage Cache)
  // 規格: 嚴格驗證快取結構，防止空值阻塞或未定義字段崩潰
  // ==========================================================================
  init() {
    this.savedAvatarConfig = null;
    this.isSpawnBlocked = true;  // 預設阻止生成，直到確認 LocalStorage
    this.pendingInitData = null; // 暫存伺服器發來的 current_players 數據

    try {
      const raw = localStorage.getItem('chubby_office_avatar');
      if (raw) {
        const parsed = JSON.parse(raw);
        // 嚴格非空與有效結構驗證，嚴禁空值或殘缺物件引發後續崩潰
        if (parsed && typeof parsed === 'object' && parsed.name && typeof parsed.name === 'string' && parsed.name.trim().length > 0) {
          const rawSpecies = (parsed.species || (parsed.avatarData && parsed.avatarData.species) || 'CAT').toUpperCase();
          const validSpecies = ['CAT', 'BEAR', 'BUNNY', 'PUPPY'].includes(rawSpecies) ? rawSpecies : 'CAT';
          const hair = (parsed.avatarData && parsed.avatarData.hair) || 'spiky';
          const hairColor = (parsed.avatarData && parsed.avatarData.hairColor) || '#FFE66D';
          const outfit = (parsed.avatarData && parsed.avatarData.outfit) || 'hoodie';
          const outfitColor = (parsed.avatarData && parsed.avatarData.outfitColor) || parsed.shirtColor || '#4ECDC4';
          const customBubble = parsed.customBubble || 'code';

          this.savedAvatarConfig = {
            name: parsed.name.trim(),
            species: validSpecies,
            shirtColor: outfitColor,
            avatarData: {
              species: validSpecies,
              hair,
              hairColor,
              outfit,
              outfitColor
            },
            customBubble
          };
          this.isSpawnBlocked = false; // 條件 A: 本地有完整舊資料，允許直接生成
          console.log('[Avatar] 📦 成功讀取本地快取裝扮設定:', this.savedAvatarConfig);
        } else {
          console.log('[Avatar] ⚠️ 本地快取資料不完整或缺少姓名，導向創角流程');
          this.savedAvatarConfig = null;
          this.isSpawnBlocked = true;
        }
      } else {
        console.log('[Avatar] ℹ️ 首次登入 (localStorage 為 null)，導向首次創角流程');
        this.savedAvatarConfig = null;
        this.isSpawnBlocked = true;
      }
    } catch (err) {
      console.warn('[Avatar] ⚠️ 讀取本地快取裝扮失敗，降級為首次創角流程:', err);
      this.savedAvatarConfig = null;
      this.isSpawnBlocked = true;
    }
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

    // 檢查首次登入創角條件 (條件 B: 本地無舊資料)
    if (this.isSpawnBlocked || !this.savedAvatarConfig) {
      console.log('[Scene] 🛡️ 條件 B 觸發: 本地無舊資料，暫時阻止 Spawn 並彈出創角視窗');
      this.ui.showWelcomeCustomizerPopup();
    } else {
      console.log('[Scene] ⚡ 條件 A 觸發: 本地已有舊資料，跳過創角視窗直接準備 Spawn');
      this.ui.hideWelcomeCustomizerPopup();
    }

    // 6. 連接 Socket.io WebSocket 服務器
    this.network.connect();

    // 7. 綁定鍵盤方向鍵輸入與 E 鍵互動鍵
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = {
      up: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D)
    };
    this.keyE = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
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

    // B. 主辦公區大圓角薄荷綠地毯 (2塊地毯覆蓋兩大工作矩陣，重新對齊至左側)
    const rug1 = this.add.image(GAME_CONFIG.ZONES.OFFICE_CLUSTER_1.x + 64, GAME_CONFIG.ZONES.OFFICE_CLUSTER_1.y + 55, 'rug_office');
    rug1.setDepth(GAME_CONFIG.LAYERS.FLOOR + 1);

    const rug2 = this.add.image(GAME_CONFIG.ZONES.OFFICE_CLUSTER_2.x + 64, GAME_CONFIG.ZONES.OFFICE_CLUSTER_2.y + 55, 'rug_office');
    rug2.setDepth(GAME_CONFIG.LAYERS.FLOOR + 1);

    // C. 遊戲娛樂區溫馨珊瑚粉地毯 (置中於兩側桌群之間)
    const rugLounge = this.add.image(GAME_CONFIG.ZONES.ARCADE_LOUNGE.x, GAME_CONFIG.ZONES.ARCADE_LOUNGE.y - 10, 'rug_lounge');
    rugLounge.setDepth(GAME_CONFIG.LAYERS.FLOOR + 1);

    // D. 茶水區棋盤格地磚 (Checkerboard Linoleum - 東南側)
    const pantryTile = this.add.tileSprite(GAME_CONFIG.ZONES.PANTRY_BAR.x + 20, GAME_CONFIG.ZONES.PANTRY_BAR.y + 20, 360, 260, 'floor_linoleum');
    pantryTile.setDepth(GAME_CONFIG.LAYERS.FLOOR + 1);

    // E. 衛生間清爽淡藍瓷磚 (西南側)
    const wcTile = this.add.tileSprite(250, 880, 380, 280, 'floor_restroom');
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

          // C. 旋轉人體工學椅 (Swivel Office Chair: 舒適後移並完美對準桌面工作區)
          const chairY = dy + 48;
          const chair = this.add.image(dx - 18, chairY, 'office_chair');
          chair.setDepth(chairY - 1); // 椅子比桌子稍前，可被玩家坐下覆蓋

          // 註冊為可坐下的椅子交互點 (含精確坐下座標、坐向、深度與站起安全點)
          const chairData = {
            id: currentDeskId,
            x: dx - 18,
            y: chairY,
            sitX: dx - 18,
            sitY: chairY - 14,
            dir: 'up',
            standX: dx - 18,
            standY: chairY + 32
          };
          this.chairs.push(chairData);

          deskIndex++;
        }
      }
    });
  }

  /**
   * 2. 多媒體投影區 (YouTube 大屏幕緊貼北牆，置於兩側桌群正中央: x: 520, y: 80)
   */
  buildMultimediaZone() {
    const pos = GAME_CONFIG.ZONES.MEDIA_SCREEN;

    // 大屏幕投影布幕實體 (緊貼北牆)
    this.mediaScreenSprite = this.staticColliders.create(pos.x, pos.y, 'prop_projector_screen');
    this.mediaScreenSprite.setDepth(pos.y);
    this.mediaScreenSprite.refreshBody();

    // 投影地毯互動光圈標記 (置於大屏幕前方觀影區，並附帶全辦公區柔和音頻波紋)
    const zoneBeacon = this.add.graphics();
    zoneBeacon.lineStyle(2, 0x38BDF8, 0.6);
    zoneBeacon.fillStyle(0x38BDF8, 0.12);
    zoneBeacon.strokeCircle(pos.x, pos.y + 60, 50);
    zoneBeacon.fillCircle(pos.x, pos.y + 60, 50);

    // 寬廣全辦公桌音頻波紋光環
    zoneBeacon.lineStyle(1.5, 0x38BDF8, 0.2);
    zoneBeacon.strokeCircle(pos.x, pos.y + 60, 240);
    zoneBeacon.lineStyle(1, 0x38BDF8, 0.1);
    zoneBeacon.strokeCircle(pos.x, pos.y + 60, 480);
    zoneBeacon.setDepth(GAME_CONFIG.LAYERS.FLOOR + 2);

    // 嚴格依據規範配置: 正前方恰好 5 個獨立圓潤沙發座位 (Exactly 5 distinct chubby-styled sofa sitting seats/nodes)
    const sofaConfig = GAME_CONFIG.ZONES.MEDIA_SCREEN.sofaSeats;
    sofaConfig.forEach((seat) => {
      // 改為一般家具圖層，避免固態碰撞體阻擋或排擠坐下之玩家
      const sofa = this.add.image(seat.x, seat.y, 'sofa_single_seat');
      sofa.setDepth(seat.y);

      this.chairs.push({
        id: seat.id,
        x: seat.x,
        y: seat.y,
        sitX: seat.x,
        sitY: seat.y - 6,
        dir: 'up',
        standX: seat.x,
        standY: seat.y + 36
      });
    });

    // 註冊近距離感應設施
    this.interactiveObjects.push({
      type: 'SCREEN',
      x: pos.x,
      y: pos.y + 55,
      radius: 75,
      label: '📺 Click or Press E to Share / Watch YouTube Video'
    });
  }

  /**
   * 3. 遊戲娛樂區 (移至東側休閒露台: L型厚實沙發 + 復古 CRT 電視 + PS5)
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

    // 註冊沙發坐姿互動節點 (面向北面電視，精確對齊沙發頂排軟墊)
    this.chairs.push({
      id: 'arcade_couch_left',
      x: lounge.x - 2,
      y: lounge.y,
      sitX: lounge.x - 2,
      sitY: lounge.y - 40,
      dir: 'up',
      standX: lounge.x - 2,
      standY: lounge.y + 45
    });
    this.chairs.push({
      id: 'arcade_couch_right',
      x: lounge.x + 46,
      y: lounge.y,
      sitX: lounge.x + 46,
      sitY: lounge.y - 40,
      dir: 'up',
      standX: lounge.x + 46,
      standY: lounge.y + 45
    });

    // 註冊電視為街機小遊戲觸發器 (Interact for Snake)
    this.interactiveObjects.push({
      type: 'TV',
      x: lounge.tvPos.x,
      y: lounge.tvPos.y + 36,
      radius: 65,
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
      const stoolY = pantry.y + 34;
      const stool = this.add.image(pantry.x + offset, stoolY, 'bar_stool');
      stool.setDepth(stoolY);

      this.chairs.push({
        id: `bar_stool_${idx}`,
        x: pantry.x + offset,
        y: stoolY,
        sitX: pantry.x + offset,
        sitY: stoolY - 4,
        dir: 'up',
        standX: pantry.x + offset,
        standY: stoolY + 36
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

    // 馬桶 1 & 2 (靜態物體，僅水箱保留碰撞盒，便器區域開放供玩家步入與坐下)
    const toilet1 = this.staticColliders.create(s1.x + 40, s1.y, 'prop_toilet');
    toilet1.setSize(26, 14);
    toilet1.setOffset(4, 2);
    toilet1.setDepth(s1.y);
    toilet1.refreshBody();

    const toilet2 = this.staticColliders.create(s2.x + 30, s2.y, 'prop_toilet');
    toilet2.setSize(26, 14);
    toilet2.setOffset(4, 2);
    toilet2.setDepth(s2.y);
    toilet2.refreshBody();

    // 註冊雙獨立隔間馬桶坐姿交互節點 (支援如廁坐下與站起)
    this.chairs.push({
      id: 'restroom_toilet_1',
      x: s1.x + 40,
      y: s1.y,
      radius: 45,
      sitX: s1.x + 40,
      sitY: s1.y - 4,
      dir: 'down',
      standX: s1.x + 40,
      standY: s1.y + 36,
      label: '🚽 按 [E] 如廁坐下 (Press [E] to Sit on Toilet)',
      standLabel: '🚽 按 [E] 離開馬桶 (Press [E] or Action to Stand Up)'
    });

    this.chairs.push({
      id: 'restroom_toilet_2',
      x: s2.x + 30,
      y: s2.y,
      radius: 45,
      sitX: s2.x + 30,
      sitY: s2.y - 4,
      dir: 'down',
      standX: s2.x + 30,
      standY: s2.y + 36,
      label: '🚽 按 [E] 如廁坐下 (Press [E] to Sit on Toilet)',
      standLabel: '🚽 按 [E] 離開馬桶 (Press [E] or Action to Stand Up)'
    });

    // 洗手台與梳妝鏡 (Vanity Wash Sinks - 移至隔間內側靠牆處，完全騰出馬桶進出走道)
    const sink1 = this.staticColliders.create(s1.x + 105, s1.y, 'prop_sink');
    sink1.setDepth(s1.y);
    sink1.refreshBody();

    const sink2 = this.staticColliders.create(s2.x + 80, s2.y, 'prop_sink');
    sink2.setDepth(s2.y);
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
   * 動態產生或取得頭頂跟隨狀態泡泡紋理 (Dynamic Overhead Status Bubble Texture)
   * 支援: 預設代碼 ('code', 'coffee', 'rocket', etc.) 或自由輸入文字/Emoji (如: "AFK 5m", "衝刺中 🚀")
   */
  getOrCreateStatusBubbleTexture(strOrPreset) {
    if (!strOrPreset) return 'bubble_badge_code';

    const trimmed = String(strOrPreset).trim();
    if (!trimmed) return 'bubble_badge_code';

    // 1. 若為標準預設代碼且預加載紋理存在，直接使用
    const presetKey = `bubble_badge_${trimmed}`;
    if (['code', 'coffee', 'rocket', 'sleep', 'star', 'leaf', 'fire'].includes(trimmed)) {
      if (this.textures.exists(presetKey)) {
        return presetKey;
      }
    }

    // 2. 自訂文字/Emoji 生成邏輯 (長度限制 16 字元)
    const displayText = trimmed.slice(0, 16);
    // 建立唯一安全 key
    const hash = Array.from(displayText).map(c => c.charCodeAt(0).toString(16)).join('_');
    const customKey = `bubble_dyn_${hash}`;

    if (this.textures.exists(customKey)) {
      return customKey;
    }

    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return 'bubble_badge_code';

      const font = 'bold 12px "Quicksand", "Nunito", "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.font = font;
      const textMetrics = ctx.measureText(displayText);
      const textWidth = Math.ceil(textMetrics.width);

      const padX = 9;
      const bubbleW = Math.max(34, textWidth + padX * 2);
      const bubbleH = 24;
      const tailH = 5;
      const totalW = bubbleW + 6;
      const totalH = bubbleH + tailH + 4;

      canvas.width = totalW;
      canvas.height = totalH;

      ctx.font = font;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';

      const r = 9;
      const x = 3;
      const y = 3;
      const w = bubbleW;
      const h = bubbleH;

      // 繪製圓角語音氣泡與底部指向尾巴
      ctx.fillStyle = '#FFFFFF';
      ctx.strokeStyle = '#78C0A8';
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';

      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.arcTo(x + w, y, x + w, y + r, r);
      ctx.lineTo(x + w, y + h - r);
      ctx.arcTo(x + w, y + h, x + w - r, y + h, r);

      // 底部指向尾巴 (Pointing down towards head)
      const midX = x + w / 2;
      ctx.lineTo(midX + 4, y + h);
      ctx.lineTo(midX, y + h + tailH);
      ctx.lineTo(midX - 4, y + h);

      ctx.lineTo(x + r, y + h);
      ctx.arcTo(x, y + h, x, y + h - r, r);
      ctx.lineTo(x, y + r);
      ctx.arcTo(x, y, x + r, y, r);
      ctx.closePath();

      ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
      ctx.shadowBlur = 3;
      ctx.shadowOffsetY = 1;
      ctx.fill();

      ctx.shadowColor = 'transparent';
      ctx.stroke();

      // 文字繪製 (深藍灰色 #1E293B)
      ctx.fillStyle = '#1E293B';
      ctx.fillText(displayText, x + w / 2, y + h / 2 - 1);

      this.textures.addCanvas(customKey, canvas);
      return customKey;
    } catch (e) {
      console.warn('[Scene] ⚠️ 動態生成氣泡失敗，降級使用預設氣泡:', e);
      return 'bubble_badge_code';
    }
  }

  /**
   * 根據伺服器發放的 init_state 或自訂創角數據生成本地玩家實體 (支援複合外觀裝扮與本地持久化)
   */
  spawnLocalPlayer(initData, directAvatarData = null) {
    if (this.player && this.player.active) {
      console.log('[Scene] ⚠️ 主角已存在，忽略重複生成調用');
      return;
    }

    // 若處於生成阻止狀態且無即時創角數據傳入，嚴禁生成
    if (this.isSpawnBlocked && !directAvatarData) {
      console.log('[Scene] ⏸️ 角色生成處於阻止狀態 (首次登入)，已暫存 initData 等待用戶提交創角');
      this.pendingInitData = initData;
      return;
    }

    const selfId = (initData && initData.selfId) || (this.network && this.network.selfId) || 'player';
    const serverPlayer = (initData && initData.players && initData.players.find(p => p.id === selfId)) || {};

    // 優先序: directAvatarData > this.savedAvatarConfig > serverPlayer
    const config = directAvatarData || this.savedAvatarConfig || serverPlayer;

    const name = (config && config.name) || serverPlayer.name || 'Player';
    const rawSpecies = (config && (config.species || (config.avatarData && config.avatarData.species))) || serverPlayer.species || 'CAT';
    const species = ['CAT', 'BEAR', 'BUNNY', 'PUPPY'].includes(String(rawSpecies).toUpperCase()) ? String(rawSpecies).toUpperCase() : 'CAT';
    const shirtColor = (config && (config.shirtColor || (config.avatarData && config.avatarData.outfitColor))) || serverPlayer.shirtColor || '#4ECDC4';

    const avatarData = (config && config.avatarData) ? {
      species: species,
      hair: config.avatarData.hair || 'spiky',
      hairColor: config.avatarData.hairColor || '#FFE66D',
      outfit: config.avatarData.outfit || 'hoodie',
      outfitColor: config.avatarData.outfitColor || shirtColor
    } : {
      species: species,
      hair: 'spiky',
      hairColor: '#FFE66D',
      outfit: 'hoodie',
      outfitColor: shirtColor
    };

    const customBubble = (config && config.customBubble) || 'code';

    // 起點座標: 優先取伺服器指派或預設安全起點 (例如 x: 520, y: 540 中央通道)
    const startX = typeof serverPlayer.x === 'number' && !isNaN(serverPlayer.x) ? serverPlayer.x : 520;
    const startY = typeof serverPlayer.y === 'number' && !isNaN(serverPlayer.y) ? serverPlayer.y : 540;

    const selfData = {
      id: selfId,
      name,
      species,
      shirtColor,
      avatarData,
      customBubble,
      x: startX,
      y: startY
    };

    console.log(`[Scene] 🎮 正式生成主角實體: ${selfData.name} (${selfData.species}) at (${selfData.x}, ${selfData.y})`, selfData);

    // 1. 建立玩家物理精靈 (Arcade Dynamic Body - 核心判定體與基礎身體外觀)
    const baseKey = `avatar_base_${selfData.species}_down_0`;
    const fallbackKey = `avatar_${selfData.species}_down_0`;
    const textureToUse = this.textures.exists(baseKey) ? baseKey : (this.textures.exists(fallbackKey) ? fallbackKey : null);

    this.player = this.physics.add.sprite(selfData.x, selfData.y, textureToUse);
    this.player.setSize(22, 16);
    this.player.setOffset(13, 34); // 腳底碰撞判定盒
    this.player.setCollideWorldBounds(true);
    this.player.setVisible(true); // 關鍵修復: 確保本體精靈可視，徹底杜絕隱形黑屏！
    this.playerBaseSprite = this.player;

    // 實體間物理碰撞 (Player vs Static Furniture & Walls)
    this.physics.add.collider(this.player, this.staticColliders);

    // 2. 建立本地外觀複合容器 (Composite Container: Shadow + Outfit + Hair + Name Tag + Bubble + Food Icon)
    this.playerContainer = this.add.container(selfData.x, selfData.y);
    this.playerContainer.setDepth(selfData.y);

    // 2.1 底部陰影
    const shadow = this.add.ellipse(0, 22, 28, 10, 0x000000, 0.2);
    this.playerContainer.add(shadow);
    this.playerShadow = shadow;

    // 2.2 衣服款式精靈 (Outfit Layer) 搭配動態色彩 Tint
    const outfitKey = `outfit_${selfData.avatarData.outfit}_down_0`;
    if (this.textures.exists(outfitKey)) {
      this.playerOutfitSprite = this.add.sprite(0, 0, outfitKey);
      const outfitColorHex = selfData.avatarData.outfitColor || selfData.shirtColor || '#4ECDC4';
      const outfitTint = parseInt(outfitColorHex.replace('#', '0x'), 16);
      if (!isNaN(outfitTint)) this.playerOutfitSprite.setTint(outfitTint);
      this.playerContainer.add(this.playerOutfitSprite);
    }

    // 2.3 髮型款式精靈 (Hair Layer) 搭配動態色彩 Tint
    const hairKey = `hair_${selfData.avatarData.hair}_down`;
    if (this.textures.exists(hairKey)) {
      this.playerHairSprite = this.add.sprite(0, 0, hairKey);
      const hairColorHex = selfData.avatarData.hairColor || '#FFE66D';
      const hairTint = parseInt(hairColorHex.replace('#', '0x'), 16);
      if (!isNaN(hairTint)) this.playerHairSprite.setTint(hairTint);
      this.playerContainer.add(this.playerHairSprite);
    }

    // 2.4 主角頭頂可愛金色姓名標籤 (Gold Name Tag)
    const nameBg = this.add.graphics();
    nameBg.fillStyle(0xFFF9E6, 0.95);
    nameBg.lineStyle(2, 0xF59E0B, 1);
    nameBg.fillRoundedRect(-44, -38, 88, 18, 9);
    nameBg.strokeRoundedRect(-44, -38, 88, 18, 9);
    this.playerContainer.add(nameBg);

    this.playerNameText = this.add.text(0, -29, `★ ${selfData.name}`, {
      fontFamily: 'Nunito, Quicksand, sans-serif',
      fontSize: '11px',
      color: '#92400E',
      fontStyle: 'bold'
    }).setOrigin(0.5);
    this.playerContainer.add(this.playerNameText);

    // 2.5 自訂頭頂跟隨狀態泡泡徽章 (支援預設圖標與自訂自由輸入文字/Emoji)
    const bubbleKey = this.getOrCreateStatusBubbleTexture(selfData.customBubble || 'code');
    if (bubbleKey && this.textures.exists(bubbleKey)) {
      this.playerBubbleSprite = this.add.sprite(0, -52, bubbleKey);
      this.playerBubbleSprite.setScale(0.95);
      this.playerContainer.add(this.playerBubbleSprite);

      // 泡泡懸浮微動緩動動畫 (Sine Floating Tween)
      this.tweens.add({
        targets: this.playerBubbleSprite,
        y: -56,
        duration: 1200,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
    }

    // 2.6 手持食物懸浮圖標
    this.playerFoodIcon = this.add.sprite(14, 8, 'item_coke');
    this.playerFoodIcon.setScale(0.85);
    this.playerFoodIcon.setVisible(false);
    this.playerContainer.add(this.playerFoodIcon);

    // 3. 鏡頭鎖定與跟隨 (Camera Follow with Damping)
    this.cameras.main.startFollow(this.player, true, 0.08, 0.08);
    this.cameras.main.setBounds(0, 0, GAME_CONFIG.WORLD_WIDTH, GAME_CONFIG.WORLD_HEIGHT);
    this.cameras.main.setZoom(1.25); // 舒適動森特寫縮放

    this.playerData = selfData;

    // 若本地有持久化裝扮，主動廣播最新裝扮至伺服器
    if (this.network && this.network.sendUpdateAvatar) {
      this.network.sendUpdateAvatar({
        name: selfData.name,
        species: selfData.species,
        avatarData: selfData.avatarData,
        customBubble: selfData.customBubble
      });
    }

    // 更新 HUD 玩家姓名
    const hudName = document.getElementById('hud-player-name');
    if (hudName) hudName.textContent = selfData.name;
  }

  /**
   * 首次創角流程完成回調 (Called when new user submits welcome-customizer-popup)
   */
  onNewUserCompleteAvatar(newAvatarData) {
    console.log('[Scene] 🎉 首次創角完成，開始正式生成角色實體:', newAvatarData);
    this.savedAvatarConfig = newAvatarData;
    this.isSpawnBlocked = false;

    // 取得暫存的伺服器快照或預設起點
    const initPayload = this.pendingInitData || {
      selfId: (this.network && this.network.selfId) || 'player',
      players: []
    };

    // 正式生成本地角色
    this.spawnLocalPlayer(initPayload, newAvatarData);

    // 網路層同步
    if (this.network) {
      if (this.network.sendUpdateAvatar) {
        this.network.sendUpdateAvatar(newAvatarData);
      }
      if (this.network.sendMoveImmediate) {
        this.network.sendMoveImmediate();
      }
    }

    this.showSystemNotice(`🎉 歡迎入職！同事 ${newAvatarData.name}，請自由探索辦公室！`);
  }

  // ==========================================================================
  // 5. 每幀主循環邏輯 (Update Loop: Movement, Mutex, Depth, Proximity)
  // ==========================================================================
  update(time, delta) {
    if (!this.player || !this.player.body) return;

    // 0. 檢查鍵盤 E 鍵快捷互動 / 坐下與站起 (Press E to interact: strictly sit if standing, stand if sitting)
    if (Phaser.Input.Keyboard.JustDown(this.keyE)) {
      const activeEl = document.activeElement;
      const isInputFocused = activeEl && (
        activeEl.tagName === 'INPUT' || 
        activeEl.tagName === 'TEXTAREA' || 
        activeEl.isContentEditable
      );
      if (!isInputFocused) {
        this.handleInteractiveAction();
      }
    }

    // 1. 同步外觀容器與物理實體座標
    this.playerContainer.x = this.player.x;
    this.playerContainer.y = this.player.y;

    // 2. 嚴格 Y軸深度排序 (Dynamic Y-Sort Depth Hierarchy)
    // 防止穿模 (Walking behind / in front of desks & objects)
    this.playerContainer.setDepth(this.player.y);
    this.player.setDepth(this.player.y);

    // 3. 狀態機互斥規則檢查 (Strict Mutex Machine Execution)
    if (this.mutexMachine.isSitting) {
      // 坐姿狀態: 速度全歸零，鎖死所有移動與精確對齊坐姿座標
      const chair = this.mutexMachine.activeChair;
      if (chair) {
        if (this.playerShadow) {
          this.playerShadow.setVisible(false);
        }
        const sitX = chair.sitX !== undefined ? chair.sitX : chair.x;
        const sitY = chair.sitY !== undefined ? chair.sitY : (chair.y - 4);
        const sitDir = chair.dir || 'up';
        const chairDepth = chair.depth !== undefined ? chair.depth : (chair.y + 2);
        this.player.setPosition(sitX, sitY);
        this.playerContainer.setPosition(sitX, sitY);
        this.playerContainer.setDepth(chairDepth);
        this.player.setDepth(chairDepth);
        this.currentAnimKey = `sit_${sitDir}`;
        this.updatePlayerVisuals(sitDir, true, false);
      }
      if (this.player && this.player.body) {
        this.player.body.setVelocity(0, 0);
      }
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
   * 更新主角精靈幀、踏步動畫、衣服與髮型多層複合圖層
   */
  updatePlayerVisuals(dir, isSit = false, isWalk = false) {
    if (!this.player || !this.playerData) return;

    let frame = 0;
    if (isSit) {
      frame = 3;
    } else if (isWalk) {
      const tick = Math.floor(this.time.now / 140) % 2;
      frame = tick === 0 ? 1 : 2;
    }

    const rawSpecies = (this.playerData.avatarData && this.playerData.avatarData.species) || this.playerData.species || 'CAT';
    const species = ['CAT', 'BEAR', 'BUNNY', 'PUPPY'].includes(String(rawSpecies).toUpperCase()) ? String(rawSpecies).toUpperCase() : 'CAT';
    const hair = (this.playerData.avatarData && this.playerData.avatarData.hair) || 'spiky';
    const hairColor = (this.playerData.avatarData && this.playerData.avatarData.hairColor) || '#FFE66D';
    const outfit = (this.playerData.avatarData && this.playerData.avatarData.outfit) || 'hoodie';
    const outfitColor = (this.playerData.avatarData && this.playerData.avatarData.outfitColor) || this.playerData.shirtColor || '#4ECDC4';

    // 1. 底層身體與面部 (Base Body Frame)
    const baseKey = `avatar_base_${species}_${dir}_${frame}`;
    const fallbackKey = `avatar_${species}_${dir}_${frame}`;
    if (this.textures.exists(baseKey)) {
      this.player.setTexture(baseKey);
    } else if (this.textures.exists(fallbackKey)) {
      this.player.setTexture(fallbackKey);
    }

    // 2. 衣服款式 (Outfit Layer) 搭配色彩 Tint 濾鏡著色
    const outfitKey = `outfit_${outfit}_${dir}_${frame}`;
    if (this.playerOutfitSprite && this.textures.exists(outfitKey)) {
      this.playerOutfitSprite.setTexture(outfitKey);
      const hex = parseInt(outfitColor.replace('#', '0x'), 16);
      if (!isNaN(hex)) this.playerOutfitSprite.setTint(hex);
    }

    // 3. 髮型款式 (Hair Layer) 搭配色彩 Tint 濾鏡著色
    const hairKey = `hair_${hair}_${dir}`;
    if (this.playerHairSprite && this.textures.exists(hairKey)) {
      this.playerHairSprite.setTexture(hairKey);
      const hex = parseInt(hairColor.replace('#', '0x'), 16);
      if (!isNaN(hex)) this.playerHairSprite.setTint(hex);
    }

    // 4. 頭頂跟隨自訂狀態徽章/泡泡 (Overhead Tailing Bubble Badge)
    if (this.playerBubbleSprite && this.playerData.customBubble) {
      const bubbleKey = this.getOrCreateStatusBubbleTexture(this.playerData.customBubble);
      if (bubbleKey && this.textures.exists(bubbleKey)) {
        this.playerBubbleSprite.setTexture(bubbleKey);
      }
    }
  }

  /**
   * 複合角色外觀造型與頭頂泡泡更新應用 (Apply Custom Composite Avatar)
   */
  applyPlayerCustomAvatar(settings) {
    if (!this.playerData) return;

    if (settings.name) {
      this.playerData.name = settings.name;
      if (this.playerNameText) {
        this.playerNameText.setText(`★ ${settings.name}`);
      }
      const hudName = document.getElementById('hud-player-name');
      if (hudName) hudName.textContent = settings.name;
    }

    if (settings.species) {
      this.playerData.species = settings.species;
    }

    if (settings.avatarData) {
      this.playerData.avatarData = settings.avatarData;
      if (settings.avatarData.species) {
        this.playerData.species = settings.avatarData.species;
      }
      if (settings.avatarData.outfitColor) {
        this.playerData.shirtColor = settings.avatarData.outfitColor;
      }
    }

    if (settings.customBubble) {
      this.playerData.customBubble = settings.customBubble;
      const bubbleKey = this.getOrCreateStatusBubbleTexture(settings.customBubble);
      if (bubbleKey && this.textures.exists(bubbleKey)) {
        if (!this.playerBubbleSprite) {
          this.playerBubbleSprite = this.add.sprite(0, -52, bubbleKey);
          this.playerBubbleSprite.setScale(0.95);
          this.playerContainer.add(this.playerBubbleSprite);
          this.tweens.add({
            targets: this.playerBubbleSprite,
            y: -56,
            duration: 1200,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
          });
        } else {
          this.playerBubbleSprite.setTexture(bubbleKey);
        }
      }
    }

    // 立即刷新視覺渲染
    const lastDir = (this.currentAnimKey || 'idle_down').split('_')[1] || 'down';
    this.updatePlayerVisuals(lastDir, this.mutexMachine.isSitting, false);

    // 本地快取持久化存檔 (Persistent Local Storage)
    try {
      const payloadToSave = {
        name: this.playerData.name,
        species: this.playerData.species,
        avatarData: this.playerData.avatarData,
        customBubble: this.playerData.customBubble
      };
      localStorage.setItem('chubby_office_avatar', JSON.stringify(payloadToSave));
      this.savedAvatarConfig = payloadToSave;
    } catch (err) {
      console.warn('[Avatar] 寫入 localStorage 失敗:', err);
    }

    // 發送外觀造型更新至伺服器
    if (this.network && this.network.sendUpdateAvatar) {
      this.network.sendUpdateAvatar({
        name: this.playerData.name,
        species: this.playerData.species,
        avatarData: this.playerData.avatarData,
        customBubble: this.playerData.customBubble
      });
    }

    this.showSystemNotice('🎨 角色裝扮與頭頂氣泡已成功更新！');
  }

  // ==========================================================================
  // 6. 互動感測器與設施邏輯 (Interactive Proximity Engine)
  // ==========================================================================

  checkNearbyInteractives() {
    if (!this.player) return;
    const px = this.player.x;
    const py = this.player.y;

    // A. YouTube 控制棒感測判定 (嚴格 120-150px 範圍內顯示，超出強制隱藏)
    const mediaPos = GAME_CONFIG.ZONES.MEDIA_SCREEN;
    const distToScreen = Phaser.Math.Distance.Between(px, py, mediaPos.x, mediaPos.y);
    const controlStick = document.getElementById('youtube-control-stick');
    if (controlStick) {
      if (distToScreen <= mediaPos.controlStickRadius) {
        controlStick.classList.remove('hidden');
      } else {
        controlStick.classList.add('hidden');
      }
    }

    let closest = null;
    let minDistance = Infinity;

    // 1. 檢查一般設施 (Screen, Fridge, TV, Roulette)
    for (const obj of this.interactiveObjects) {
      const d = Phaser.Math.Distance.Between(px, py, obj.x, obj.y);
      if (d <= obj.radius && d < minDistance) {
        minDistance = d;
        closest = { type: obj.type, label: obj.label, data: obj };
      }

      // 多媒體投影音量隨距離衰減感測 (Proximity Audio Volume: 擴展至全辦公桌覆蓋半徑 750px)
      if (obj.type === 'SCREEN') {
        this.ui.updateProximityAudio(d, GAME_CONFIG.ZONES.MEDIA_SCREEN.audioRadius);
      }
    }

    // 2. 檢查椅子與馬桶交互 (Chairs & Toilets)
    if (!this.mutexMachine.isSitting) {
      for (const chair of this.chairs) {
        const d = Phaser.Math.Distance.Between(px, py, chair.x, chair.y);
        const radius = chair.radius || 35;
        if (d <= radius && d < minDistance) {
          minDistance = d;
          closest = {
            type: 'CHAIR',
            label: chair.label || '🪑 按 [E] 坐下 (Press [E] or Action to Sit)',
            data: chair
          };
        }
      }
    } else {
      const activeChair = this.mutexMachine.activeChair;
      closest = {
        type: 'SITTING',
        label: (activeChair && activeChair.standLabel) ? activeChair.standLabel : '🪑 按 [E] 站起 (Press [E] or STAND to stand up)',
        data: activeChair
      };
    }

    // 更新 UI 提示 Banner 與 Action 按鈕
    this.ui.setNearbyInteractive(closest);
  }

  // ==========================================================================
  // 7. 具體交互動作處置 (Interaction Action Handlers)
  // ==========================================================================

  /**
   * 統一互動動作路由器 (Unified Interactive Action Dispatcher)
   * 嚴格狀態互斥與冷卻邏輯:
   * 1. 坐姿狀態下 (isSitting === true) -> 僅允許觸發站起 (Only trigger stand when sitting)
   * 2. 站立狀態下 (isSitting === false) -> 絕對不可觸發站起！在椅子旁僅允許觸發坐下 (If standing, only trigger sit, never stand)
   * 3. 具備 300ms 冷卻防抖，杜絕同一幀/單次按鍵連鎖觸發坐下又立馬站起
   */
  handleInteractiveAction() {
    const now = Date.now();
    if (now - this.lastSitToggleTime < 300) {
      return;
    }

    const isSitting = this.mutexMachine && this.mutexMachine.isSitting;

    if (isSitting) {
      // 坐姿中 -> 唯一合法動作為站起
      this.lastSitToggleTime = now;
      this.performStandUp();
      return;
    }

    // 站立狀態中 -> 絕對不可執行站起動作！
    if (!this.ui || !this.ui.nearbyInteractive) {
      return;
    }

    const { type, data } = this.ui.nearbyInteractive;

    if (type === 'CHAIR') {
      // 站立狀態且在椅子旁 -> 唯一合法動作為坐下
      this.lastSitToggleTime = now;
      this.performSitDown(data);
      return;
    }

    if (type === 'SITTING') {
      // 狀態防禦: 站立時不允許執行 SITTING 指令
      return;
    }

    // 其他一般設施互動 (FRIDGE, TV, ROULETTE, SCREEN)
    this.lastSitToggleTime = now;
    if (type === 'FRIDGE') {
      this.ui.showFridgeMenu();
    } else if (type === 'TV') {
      this.launchArcadeSnake();
    } else if (type === 'ROULETTE') {
      if (this.network && this.network.sendRouletteSpin) {
        this.network.sendRouletteSpin();
      } else if (this.network && this.network.sendSpinRoulette) {
        this.network.sendSpinRoulette();
      }
    } else if (type === 'SCREEN') {
      this.ui.showMediaModal();
    }
  }

  /**
   * 坐下動作 (Sit Down Action)
   */
  performSitDown(chair) {
    if (!this.mutexMachine.canSit()) return;

    this.mutexMachine.enterSit(chair, this.player);

    if (this.playerShadow) {
      this.playerShadow.setVisible(false);
    }

    const sitX = chair.sitX !== undefined ? chair.sitX : chair.x;
    const sitY = chair.sitY !== undefined ? chair.sitY : (chair.y - 4);
    const sitDir = chair.dir || 'up';
    const chairDepth = chair.depth !== undefined ? chair.depth : (chair.y + 2);

    // 禁用物理實體碰撞分離，防止坐姿時被固態家具排擠偏移
    if (this.player && this.player.body) {
      this.player.body.enable = false;
      this.player.body.setVelocity(0, 0);
    }

    // 平滑瞬移坐入椅子精確位置
    this.player.setPosition(sitX, sitY);
    this.playerContainer.setPosition(sitX, sitY);
    this.playerContainer.setDepth(chairDepth);
    this.player.setDepth(chairDepth);

    this.currentAnimKey = `sit_${sitDir}`;
    this.updatePlayerVisuals(sitDir, true, false);

    // 發送坐下同步封包至伺服器
    this.network.sendChairInteract('sit', {
      chairId: chair.id,
      x: sitX,
      y: sitY,
      dir: sitDir,
      anim: `sit_${sitDir}`
    });

    if (this.ui) {
      this.ui.setNearbyInteractive({
        type: 'SITTING',
        label: chair.standLabel || '🪑 按 [E] 站起 (Press [E] or STAND to stand up)',
        data: chair
      });
    }
  }

  /**
   * 站起動作 (Stand Up Action)
   */
  performStandUp() {
    if (!this.mutexMachine.isSitting) return;

    const chair = this.mutexMachine.activeChair;
    const standX = chair && chair.standX !== undefined ? chair.standX : this.player.x;
    const standY = chair && chair.standY !== undefined ? chair.standY : (this.player.y + 26);

    this.mutexMachine.standUp(this.player);

    if (this.playerShadow) {
      this.playerShadow.setVisible(true);
    }

    // 恢復實體物理運動與碰撞檢測
    if (this.player && this.player.body) {
      this.player.body.enable = true;
      this.player.body.setVelocity(0, 0);
    }

    this.player.setPosition(standX, standY);
    this.playerContainer.setPosition(standX, standY);
    this.playerContainer.setDepth(standY);
    this.player.setDepth(standY);

    this.currentAnimKey = 'idle_down';
    this.updatePlayerVisuals('down', false, false);

    this.network.sendChairInteract('stand', {
      standX,
      standY
    });

    if (this.ui) {
      this.ui.setNearbyInteractive(null);
    }
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
  // 9. 多媒體投影區更新 (YouTube Player DOM Management & Multiplayer Audio Sync)
  // ==========================================================================
  updateMediaState(mediaData) {
    if (!mediaData) return;
    this.currentMediaData = mediaData;

    const banner = document.getElementById('media-now-playing');
    if (banner) {
      banner.textContent = `▶ Now Playing: ${mediaData.title || 'Multiplayer Video'}`;
    }

    const headerTitle = document.getElementById('youtube-header-title');
    if (headerTitle) {
      headerTitle.textContent = mediaData.title || 'EDM Club Mix 2026';
    }

    // 計算多人同步播放進度 (Elapsed Seconds from Server Started Timestamp)
    const serverTime = mediaData.serverTime || Date.now();
    const clockSkew = Date.now() - serverTime;
    const startedAt = mediaData.startedAt || serverTime;
    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - clockSkew - startedAt) / 1000));

    const content = document.getElementById('youtube-player-content');
    const existingIframe = document.getElementById('youtube-iframe');

    // 若當前已有 iframe 且為同一首影片，則使用 postMessage 直接對準秒數，避免 DOM 重繪刷新造成音訊斷續
    if (existingIframe && this.activeVideoId && this.activeVideoId === mediaData.videoId) {
      this.syncYouTubeAudio(elapsedSeconds);
      return;
    }

    this.activeVideoId = mediaData.videoId || 'GWn2Xe-t8DM';
    let embedUrl = mediaData.embedUrl || `https://www.youtube.com/embed/${this.activeVideoId}?autoplay=1&mute=0&loop=1&controls=1&enablejsapi=1`;
    if (!embedUrl.includes('enablejsapi=1')) {
      embedUrl += (embedUrl.includes('?') ? '&' : '?') + 'enablejsapi=1';
    }
    if (elapsedSeconds > 0 && !embedUrl.includes('start=')) {
      embedUrl += `&start=${elapsedSeconds}`;
    }

    if (content) {
      content.innerHTML = `
        <iframe 
          id="youtube-iframe"
          width="100%" 
          height="100%" 
          src="${embedUrl}" 
          frameborder="0" 
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
          allowfullscreen>
        </iframe>
      `;
    }
  }

  /**
   * 與全房同事同步音訊播放時間點 (Sync YouTube Audio with Room)
   */
  syncYouTubeAudio(forcedElapsed) {
    const iframe = document.getElementById('youtube-iframe');
    if (!iframe || !iframe.contentWindow) return;

    let elapsed = forcedElapsed;
    if (typeof elapsed !== 'number') {
      if (this.currentMediaData && this.currentMediaData.startedAt) {
        const serverTime = this.currentMediaData.serverTime || Date.now();
        const clockSkew = Date.now() - serverTime;
        elapsed = Math.max(0, Math.floor((Date.now() - clockSkew - this.currentMediaData.startedAt) / 1000));
      } else {
        elapsed = 0;
      }
    }

    try {
      iframe.contentWindow.postMessage(JSON.stringify({
        event: 'command',
        func: 'seekTo',
        args: [elapsed, true]
      }), '*');
      iframe.contentWindow.postMessage(JSON.stringify({
        event: 'command',
        func: 'playVideo',
        args: []
      }), '*');
    } catch (e) {
      console.warn('[YouTube Sync] 跨域通訊警告:', e);
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
