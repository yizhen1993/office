/**
 * ============================================================================
 * 2D Multiplayer Virtual Office — 全局配置模組 (Game Config)
 * 規格依據: Specification Section 1 & 2 (Architecture, Layout, Proximity Rules)
 * ============================================================================
 */

export const GAME_CONFIG = {
  // 世界地圖實體寬高 (像素單位)
  WORLD_WIDTH: 1600,
  WORLD_HEIGHT: 1200,

  // 角色移動速度常數 (Pixels / Sec)
  SPEED_WALK: 160,
  SPEED_SPRINT_MULTIPLIER: 2.5, // 奔跑時 2.5 倍極速衝刺
  get SPEED_SPRINT() {
    return this.SPEED_WALK * this.SPEED_SPRINT_MULTIPLIER; // 400 px/s
  },

  // 深度排序層次 (Z-Index Hierarchy)
  LAYERS: {
    FLOOR: 0,
    FURNITURE_BASE: 100,
    OVERLAYS: 200,
    ENTITIES_BASE: 1000, // 實體依據 Y 座標動態排序: depth = ENTITIES_BASE + Y
    UI_OVERLAY: 50000
  },

  // 網格空間分區佈局錨點 (Zone Coordinates)
  ZONES: {
    // 1. 主辦公區: 8個辦公桌矩陣 (2x2 兩大集群)
    OFFICE_CLUSTER_1: { x: 300, y: 380 },
    OFFICE_CLUSTER_2: { x: 740, y: 380 },

    // 2. 多媒體投影區 (北面大屏幕 & 專屬 5 個沙發座)
    MEDIA_SCREEN: {
      x: 520,
      y: 130,
      controlStickRadius: 140, // 規範要求: 120-150px 近距離交互感應棒
      audioRadius: 380,
      // 正前方恰好 5 個獨立圓潤沙發座位 (Exactly 5 distinct sofa sitting nodes)
      sofaSeats: [
        { id: 'yt_sofa_1', x: 420, y: 220, label: 'Sofa Seat 1' },
        { id: 'yt_sofa_2', x: 470, y: 220, label: 'Sofa Seat 2' },
        { id: 'yt_sofa_3', x: 520, y: 220, label: 'Sofa Seat 3' },
        { id: 'yt_sofa_4', x: 570, y: 220, label: 'Sofa Seat 4' },
        { id: 'yt_sofa_5', x: 620, y: 220, label: 'Sofa Seat 5' }
      ]
    },

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

  // 複合角色裝扮樣式選項 (Composite Avatar Customization Options)
  AVATAR_OPTIONS: {
    SPECIES: ['CAT', 'BEAR', 'BUNNY', 'PUPPY'],
    HAIR_STYLES: [
      { id: 'spiky', name: '俐落刺蝟頭' },
      { id: 'bob', name: '可愛波波頭' },
      { id: 'ponytail', name: '元氣馬尾' },
      { id: 'cap', name: '棒球休閒帽' }
    ],
    OUTFIT_STYLES: [
      { id: 'hoodie', name: '寬鬆連帽衫' },
      { id: 'suit', name: '商務精英西裝' },
      { id: 'apron', name: '咖啡師圍裙' },
      { id: 'sweater', name: '溫暖麻花毛衣' }
    ],
    COLOR_PRESETS: [
      '#FF6B6B', '#4ECDC4', '#FFE66D', '#1A535C',
      '#F7B267', '#A8DADC', '#E63946', '#9B5DE5',
      '#00BBF9', '#3A86FF', '#FB5607', '#38B000'
    ],
    // 頭頂跟隨自訂狀態徽章/泡泡 (Customizable Overhead Tailing Bubbles)
    TAILING_BUBBLES: [
      { id: 'code', icon: '💻', text: 'Coding' },
      { id: 'coffee', icon: '☕', text: 'Coffee Time' },
      { id: 'rocket', icon: '🚀', text: 'Ship It!' },
      { id: 'sleep', icon: '💤', text: 'Power Nap' },
      { id: 'star', icon: '🌟', text: 'VIP Star' },
      { id: 'leaf', icon: '🍃', text: 'Cozy Mood' },
      { id: 'fire', icon: '🔥', text: 'On Fire' }
    ]
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
    SOFA_PLUSH: '#A3B18A',
    SOFA_BASE: '#588157'
  }
};
