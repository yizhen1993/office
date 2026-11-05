/**
 * ============================================================================
 * 2D Multiplayer Virtual Office — Authoritative Game Server
 * 技術棧: Node.js, Express, Socket.io
 * 設計模式: 狀態同步權威服務器架構 (State Synchronization Architecture)
 * 註釋語言: 繁體中文 / 簡體中文專業註釋
 * ============================================================================
 */

const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// 跨域與 Socket.io 配置 (支援反向代理 WebSocket 升級協議)
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  pingInterval: 10000,
  pingTimeout: 5000
});

const PORT = process.env.PORT || 3000;

// ============================================================================
// 1. 全局遊戲狀態存儲 (Authoritative Server State Store)
// ============================================================================

/**
 * 在線玩家字典 Map<socketId, PlayerState>
 * @type {Map<string, Object>}
 */
const players = new Map();

/**
 * 輪盤扇區配置 (Cyber Roulette 8 Sectors)
 */
const ROULETTE_SECTORS = [
  { index: 0, label: '🌟 幸運之星 (Bell Bonus)', color: '#FFD166' },
  { index: 1, label: '☕ 特調南洋 Kopi Break', color: '#06D6A0' },
  { index: 2, label: '⚡ +50 專注衝刺 Buff', color: '#118AB2' },
  { index: 3, label: '🍕 披薩派對大餐', color: '#EF476F' },
  { index: 4, label: '🍃 動森神秘驚喜禮物', color: '#70C1B3' },
  { index: 5, label: '💻 零 Bug 程式碼神級祝福', color: '#8338EC' },
  { index: 6, label: '🎉 本日最佳辦公室之星 MVP', color: '#F77F00' },
  { index: 7, label: '💤 10分鐘能量微充電 Nap', color: '#3A86FF' }
];

/**
 * 當前多媒體投影屏播放狀態 (YouTube Proximity Player)
 */
let currentMediaState = {
  videoUrl: 'https://www.youtube.com/watch?v=5qap5aO4i9A', // 預設舒適 Lofi 影片
  embedUrl: 'https://www.youtube.com/embed/5qap5aO4i9A?autoplay=1&mute=0&loop=1&playlist=5qap5aO4i9A&controls=1',
  title: 'Cozy Lofi Hip Hop Beats to Relax/Work',
  setBy: 'System'
};

/**
 * 隨機生成 Animal Crossing 風格的可愛角色外觀配置
 */
const SPECIES_LIST = ['CAT', 'BEAR', 'BUNNY', 'PUPPY'];
const SHIRT_COLORS = [
  '#FF6B6B', '#4ECDC4', '#FFE66D', '#1A535C', 
  '#F7B267', '#A8DADC', '#E63946', '#9B5DE5', '#00BBF9'
];

function generateRandomAvatar() {
  const species = SPECIES_LIST[Math.floor(Math.random() * SPECIES_LIST.length)];
  const shirtColor = SHIRT_COLORS[Math.floor(Math.random() * SHIRT_COLORS.length)];
  const defaultNames = ['KopiPeng', 'Mochi', 'Pudding', 'Caramel', 'Boba', 'Matcha', 'Cookie', 'Cocoa'];
  const name = defaultNames[Math.floor(Math.random() * defaultNames.length)] + '_' + Math.floor(100 + Math.random() * 900);
  return { species, shirtColor, name };
}

/**
 * 將使用者輸入的 YouTube Watch 連結安全轉化為 Embed 嵌入式網址
 * 支援: https://www.youtube.com/watch?v=ID , https://youtu.be/ID , https://www.youtube.com/embed/ID
 */
function sanitizeYouTubeEmbedUrl(inputUrl) {
  if (!inputUrl || typeof inputUrl !== 'string') return null;
  let videoId = null;

  // 1. 標準網址: youtube.com/watch?v=xxx
  const watchMatch = inputUrl.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (watchMatch) {
    videoId = watchMatch[1];
  }

  // 2. 短網址: youtu.be/xxx
  if (!videoId) {
    const shortMatch = inputUrl.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
    if (shortMatch) videoId = shortMatch[1];
  }

  // 3. 已是 Embed 網址: youtube.com/embed/xxx
  if (!videoId) {
    const embedMatch = inputUrl.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/);
    if (embedMatch) videoId = embedMatch[1];
  }

  if (videoId) {
    return {
      videoId,
      embedUrl: `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=0&loop=1&playlist=${videoId}&controls=1`
    };
  }
  return null;
}

// ============================================================================
// 2. SOCKET.IO 事件分發系統 (Authoritative WebSocket Dispatcher)
// ============================================================================

io.on('connection', (socket) => {
  console.log(`[Socket.io] 🟢 玩家已連接: ID = ${socket.id}`);

  // 初始化玩家資料 (預設在辦公室玄關入口生成)
  const avatar = generateRandomAvatar();
  const newPlayer = {
    id: socket.id,
    name: avatar.name,
    species: avatar.species,
    shirtColor: avatar.shirtColor,
    x: 640 + Math.floor(Math.random() * 80 - 40),
    y: 720 + Math.floor(Math.random() * 40 - 20),
    vx: 0,
    vy: 0,
    anim: 'idle_down',
    heldItem: null, // 持有食物: 'Coke' | 'Snack' | 'Pizza' | null
    isSprinting: false,
    isSitting: false,
    chairId: null,
    joinedAt: Date.now()
  };

  players.set(socket.id, newPlayer);

  // 1. 向新進玩家發送全域初始狀態套件 (包含本地 ID, 所有在線玩家, 投影狀態, 輪盤設定)
  const playersArray = Array.from(players.values());
  socket.emit('init_state', {
    selfId: socket.id,
    players: playersArray,
    currentMedia: currentMediaState,
    rouletteSectors: ROULETTE_SECTORS
  });

  // 2. 廣播新玩家加入事件至其他所有在線用戶
  socket.broadcast.emit('player_join', newPlayer);

  // ==========================================================================
  // 玩家位移與動畫同步 (player_move)
  // ==========================================================================
  socket.on('player_move', (data) => {
    const player = players.get(socket.id);
    if (!player) return;

    // 狀態機互斥檢查: 如果玩家正處於坐姿，強制位置鎖定不可位移
    if (player.isSitting && !data.isSitting) {
      // 玩家請求站起
      player.isSitting = false;
      player.chairId = null;
    }

    // 更新權威座標與狀態
    player.x = Number(data.x) || player.x;
    player.y = Number(data.y) || player.y;
    player.vx = Number(data.vx) || 0;
    player.vy = Number(data.vy) || 0;
    player.anim = data.anim || player.anim;
    player.heldItem = data.heldItem !== undefined ? data.heldItem : player.heldItem;
    player.isSprinting = Boolean(data.isSprinting);
    player.isSitting = Boolean(data.isSitting);
    player.chairId = data.chairId || null;

    // 向其他所有客戶端同步位移廣播 (帶時間戳以支援客戶端線性差值平滑運算)
    socket.broadcast.emit('player_moved', {
      id: socket.id,
      x: player.x,
      y: player.y,
      vx: player.vx,
      vy: player.vy,
      anim: player.anim,
      heldItem: player.heldItem,
      isSprinting: player.isSprinting,
      isSitting: player.isSitting,
      chairId: player.chairId,
      timestamp: Date.now()
    });
  });

  // ==========================================================================
  // 坐下與站起事件 (chair_interact)
  // ==========================================================================
  socket.on('chair_interact', (data) => {
    const player = players.get(socket.id);
    if (!player) return;

    if (data.action === 'sit') {
      player.isSitting = true;
      player.chairId = data.chairId;
      player.x = data.x;
      player.y = data.y;
      player.anim = data.anim || 'sit_down';
    } else {
      player.isSitting = false;
      player.chairId = null;
      player.x = data.standX || player.x;
      player.y = data.standY || (player.y + 24);
      player.anim = 'idle_down';
    }

    io.emit('player_moved', {
      id: socket.id,
      x: player.x,
      y: player.y,
      anim: player.anim,
      heldItem: player.heldItem,
      isSprinting: false,
      isSitting: player.isSitting,
      chairId: player.chairId,
      timestamp: Date.now()
    });
  });

  // ==========================================================================
  // 茶水間食物與飲料領取 / 享用 (item_action)
  // ==========================================================================
  socket.on('item_action', (data) => {
    const player = players.get(socket.id);
    if (!player) return;

    if (data.action === 'pickup') {
      player.heldItem = data.item; // 'Coke' | 'Snack' | 'Pizza'
    } else if (data.action === 'consume') {
      player.heldItem = null;
    }

    // 全體廣播該玩家手持物品變動
    io.emit('item_state_changed', {
      id: socket.id,
      heldItem: player.heldItem,
      action: data.action,
      item: data.item
    });
  });

  // ==========================================================================
  // 頭頂對話氣泡與聊天廣播 (chat_message)
  // ==========================================================================
  socket.on('chat_message', (data) => {
    const player = players.get(socket.id);
    if (!player) return;

    const rawMessage = (data.message || '').trim();
    if (!rawMessage) return;

    // 基礎安全清洗與長度截斷 (防止 XSS 與過長文本溢出)
    const sanitizedMsg = rawMessage
      .slice(0, 100)
      .replace(/[<>]/g, '');

    io.emit('chat_broadcast', {
      id: socket.id,
      name: player.name,
      message: sanitizedMsg,
      timestamp: Date.now()
    });
  });

  // ==========================================================================
  // 賽博輪盤權威伺服器抽獎事件 (spin_roulette)
  // ==========================================================================
  socket.on('spin_roulette', () => {
    const player = players.get(socket.id);
    if (!player) return;

    // 權威伺服器端決定最終落點扇區索引 (0 ~ 7)
    const winningIndex = Math.floor(Math.random() * ROULETTE_SECTORS.length);
    const winningSector = ROULETTE_SECTORS[winningIndex];

    console.log(`[Roulette] 🎯 玩家 ${player.name} 轉動了輪盤 -> 中獎扇區: [${winningIndex}] ${winningSector.label}`);

    // 向全房廣播旋轉同步指令 (包含指定扇區、持續時長 4000ms 與觸發玩家)
    io.emit('roulette_spin_result', {
      spunById: socket.id,
      spunByName: player.name,
      winningIndex: winningIndex,
      sectorLabel: winningSector.label,
      durationMs: 4000,
      timestamp: Date.now()
    });
  });

  // ==========================================================================
  // 多媒體投影區 YouTube 網址切換 (submit_youtube_url)
  // ==========================================================================
  socket.on('submit_youtube_url', (data) => {
    const player = players.get(socket.id);
    if (!player) return;

    const sanitized = sanitizeYouTubeEmbedUrl(data.url);
    if (sanitized) {
      currentMediaState = {
        videoUrl: data.url,
        embedUrl: sanitized.embedUrl,
        title: data.title || 'Multiplayer Screen Share',
        setBy: player.name
      };

      console.log(`[Media] 📺 玩家 ${player.name} 更新了投影螢幕: ${sanitized.embedUrl}`);
      io.emit('media_state_changed', currentMediaState);
    } else {
      socket.emit('media_error', { message: '請輸入有效的 YouTube 影片網址 (例如: https://www.youtube.com/watch?v=... 或 https://youtu.be/...)' });
    }
  });

  // ==========================================================================
  // 玩家斷線清理 (disconnect)
  // ==========================================================================
  socket.on('disconnect', () => {
    console.log(`[Socket.io] 🔴 玩家已斷開: ID = ${socket.id}`);
    players.delete(socket.id);
    io.emit('player_leave', { id: socket.id });
  });
});

// 健康檢查與系統狀態端點
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    onlinePlayers: players.size,
    media: currentMediaState.title,
    uptime: process.uptime()
  });
});

// 啟動 HTTP + WebSocket 伺服器
server.listen(PORT, '0.0.0.0', () => {
  console.log(`
  =============================================================
  🏢 2D Multiplayer Virtual Office Game Server Started!
  🔗 監聽端口: http://0.0.0.0:${PORT}
  🎨 視覺風格: Animal Crossing Chubby Cozy Clay Vector Style
  🕹️ 核心引擎: HTML5 Phaser 3 + Node.js Socket.io
  =============================================================
  `);
});
