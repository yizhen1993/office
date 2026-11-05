/**
 * ============================================================================
 * 2D Multiplayer Virtual Office — 全局配置模組 (Game Config)
 * 定義 Phaser 3 引擎參數、世界座標邊界、圖層深度層次 (Z-Index Hierarchy) 與速度常數
 * ============================================================================
 */

export const GAME_CONFIG = {
  // 世界地圖實體寬高 (像素單位)
  WORLD_WIDTH: 1600,
  WORLD_HEIGHT: 1200,

  // 角色移動速度常數 (Pixels / Sec)
  SPEED_WALK: 160,
  SPEED_SPRINT_MULTIPLIER: 2.5, // 奔跑時 2.5 倍急速衝刺
  get SPEED_SPRINT() {
    return this.SPEED_WALK * this.SPEED_SPRINT_MULTIPLIER; // 400 px/s
  },

  // 深度排序層次 (Z-Index Hierarchy)
  // Layer 0: 地板材質 (Floor)
  // Layer 1: 家具底座與固態碰撞體 (Furniture Base)
  // Layer 2: 桌面交互覆蓋層 (Interactive Overlays)
  // Layer 3: Y軸動態深度排序實體層 (Y-Sorted Entities: Player, Remote Players, NPC DJ)
  // Layer 4: UI/DOM 頂層覆蓋層 (UI & Chat Bubbles)
  LAYERS: {
    FLOOR: 0,
    FURNITURE_BASE: 100,
    OVERLAYS: 200,
    ENTITIES_BASE: 1000, // 實體會依據其 Y 座標實時計算: depth = ENTITIES_BASE + Y
    UI_OVERLAY: 50000
  },

  // 網格空間分區佈局錨點 (Zone Coordinates)
  ZONES: {
    // 1. 主辦公區: 8個辦公桌矩陣 (2x2 兩大集群)
    OFFICE_CLUSTER_1: { x: 300, y: 380 },
    OFFICE_CLUSTER_2: { x: 740, y: 380 },

    // 2. 多媒體投影區 (北面大屏幕)
    MEDIA_SCREEN: { x: 520, y: 130, radius: 75 },

    // 3. 遊戲娛樂區 (L型沙發 + 復古CRT電視 + PS5)
    ARCADE_LOUNGE: { x: 1220, y: 380, tvPos: { x: 1220, y: 240 } },

    // 4. 茶水點心吧檯與雙門冰箱
    PANTRY_BAR: { x: 1220, y: 840, fridgePos: { x: 1400, y: 840 } },

    // 5. 衛生間隔間 (雙獨立馬桶與洗手台)
    RESTROOM_STALL_1: { x: 180, y: 860 },
    RESTROOM_STALL_2: { x: 360, y: 860 },

    // 6. 賽博輪盤區
    ROULETTE: { x: 780, y: 860 },

    // 7. 休息露台與 NPC DJ 音樂台
    DJ_BOOTH: { x: 1020, y: 150 }
  },

  // 溫馨動森黏土調色盤 (Animal Crossing Clay Palette)
  PALETTE: {
    FLOOR_WOOD_LIGHT: '#F4ECE1',
    FLOOR_WOOD_DARK: '#E2D3BE',
    FLOOR_LINOLEUM_MINT: '#C5E8D8',
    FLOOR_LINOLEUM_CREAM: '#FFFDF9',
    FLOOR_RESTROOM_TILE: '#D6EAF8',
    RUG_PEACH: '#FFD7C2',
    RUG_MINT: '#B8E1D9',
    RUG_LAVENDER: '#E2D9F3',
    DESK_WOOD: '#C99765',
    DESK_ACCENT: '#9C6635',
    CHAIR_CUSHION: '#7BC4B2',
    SOFA_SAGE: '#84A98C',
    WALL_BEIGE: '#FFF8E7',
    WALL_BORDER: '#D3C0A6'
  }
};
