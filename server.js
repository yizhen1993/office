/**
 * ============================================================================
 * 2D Multiplayer Virtual Office — Authoritative Game Server (Stage 2)
 * 技術棧: Node.js (ES6+), Express, Socket.io
 * 架構規範: Stage 2 伺服器權威狀態機 (Authoritative Backend Server Interface)
 * 核心功能:
 *  - 全局房間狀態樹 (Global In-Memory State Database: rooms.office)
 *  - 嚴格 CORS 跨域設定與 HTTP / WebSocket 雙通道通訊
 *  - 核心事件監聽與廣播協議:
 *      * connection: 初始化玩家預設座標與唯一 ID
 *      * join_room: 回傳 current_players 狀態快照，並廣播 new_player 給其他用戶
 *      * player_move: 即時更新內存數據庫並低延遲廣播 player_moved 遙測數據
 *      * roulette_spin: 權威隨機生成 0~36 中獎扇區，廣播 roulette_started 並設置 4 秒防重入鎖
 *      * chat_message: XSS 惡意字元過濾並廣播 chat_broadcast
 *      * disconnect: 狀態清理並廣播 player_disconnected
 * ============================================================================
 */

const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// 嚴格 CORS 與中間件配置 (支援跨域開發與反向代理)
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST']
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 初始化權威 WebSocket 伺服器
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  pingInterval: 10000,
  pingTimeout: 5000,
  transports: ['websocket', 'polling']
});

const PORT = process.env.PORT || 3000;

// ============================================================================
// 1. 全局記憶體資料庫 (Global In-Memory State Database)
// ============================================================================
const rooms = {
  office: {
    players: {}, // key: socket.id -> { id, x, y, anim, heldItem, isSprinting, isSitting, species, shirtColor, name }
    roulette: {
      active: false,
      resultIndex: -1,
      lastWinner: null
    },
    media: {
      videoUrl: 'https://www.youtube.com/watch?v=5qap5aO4i9A',
      embedUrl: 'https://www.youtube.com/embed/5qap5aO4i9A?autoplay=1&mute=0&loop=1&playlist=5qap5aO4i9A&controls=1',
      title: 'Cozy Lofi Hip Hop Beats to Relax/Work',
      setBy: 'System'
    },
    clubMode: false // 🪩 TOGGLE CLUB 夜店模式全房同步
  }
};

/**
 * 可愛動森風格外觀隨機配置生成器
 */
const SPECIES_LIST = ['CAT', 'BEAR', 'BUNNY', 'PUPPY'];
const SHIRT_COLORS = [
  '#FF6B6B', '#4ECDC4', '#FFE66D', '#1A535C',
  '#F7B267', '#A8DADC', '#E63946', '#9B5DE5', '#00BBF9'
];
const NAME_PREFIXES = ['Kopi', 'Mochi', 'Pudding', 'Boba', 'Matcha', 'Cookie', 'Cocoa', 'Latte'];

function generateAvatarConfig() {
  const species = SPECIES_LIST[Math.floor(Math.random() * SPECIES_LIST.length)];
  const shirtColor = SHIRT_COLORS[Math.floor(Math.random() * SHIRT_COLORS.length)];
  const name = NAME_PREFIXES[Math.floor(Math.random() * NAME_PREFIXES.length)] + '_' + Math.floor(100 + Math.random() * 900);
  return { species, shirtColor, name };
}

/**
 * 安全過濾 XSS 惡意腳本字符
 */
function sanitizeString(str) {
  if (typeof str !== 'string') return '';
  return str
    .slice(0, 120)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * YouTube 網址正規化清洗
 */
function sanitizeYouTubeEmbedUrl(inputUrl) {
  if (!inputUrl || typeof inputUrl !== 'string') return null;
  let videoId = null;

  const watchMatch = inputUrl.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (watchMatch) videoId = watchMatch[1];

  if (!videoId) {
    const shortMatch = inputUrl.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
    if (shortMatch) videoId = shortMatch[1];
  }

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
// 2. SOCKET.IO 核心事件路由 (Authoritative Socket.io Event Router)
// ============================================================================

io.on('connection', (socket) => {
  console.log(`[Socket.io] 🟢 偵測到新連接: ID = ${socket.id}`);

  const avatar = generateAvatarConfig();

  // 1. 初始化預設玩家狀態 (滿足規範: id, x: 400, y: 300, anim: 'idle', heldItem: 'none', isSprinting: false)
  const defaultPlayer = {
    id: socket.id,
    name: avatar.name,
    species: avatar.species,
    shirtColor: avatar.shirtColor,
    avatarData: {
      species: avatar.species,
      hair: 'spiky',
      hairColor: '#FFE66D',
      outfit: 'hoodie',
      outfitColor: avatar.shirtColor
    },
    customBubble: 'code',
    x: 400,
    y: 300,
    anim: 'idle',
    heldItem: 'none',
    isSprinting: false,
    isSitting: false,
    chairId: null,
    joinedAt: Date.now()
  };

  // ==========================================================================
  // 事件 A: 加入房間 (join_room)
  // ==========================================================================
  const handleJoinRoom = (roomName = 'office') => {
    socket.join(roomName);

    // 儲存進入全局內存資料庫
    rooms.office.players[socket.id] = defaultPlayer;

    console.log(`[Socket.io] 🚪 玩家 ${defaultPlayer.name} (${socket.id}) 正式加入房間: ${roomName}`);

    // A1: 立即將房間現存所有玩家狀態字典回傳給新客戶端 (current_players)
    socket.emit('current_players', {
      selfId: socket.id,
      players: rooms.office.players,
      roulette: rooms.office.roulette,
      currentMedia: rooms.office.media,
      clubMode: rooms.office.clubMode
    });

    // A2: 向其他所有在線 Socket 廣播新玩家加入事件套件 (new_player)
    socket.to(roomName).emit('new_player', defaultPlayer);
  };

  // 支援客戶端明確發送 join_room，或連接即時自動登記
  socket.on('join_room', (data) => {
    const roomName = (data && data.room) || 'office';
    handleJoinRoom(roomName);
  });

  // 自動登記加入 office 房間，杜絕漏觸發
  handleJoinRoom('office');

  // ==========================================================================
  // 事件 B: 玩家移動與遙測同步 (player_move)
  // ==========================================================================
  socket.on('player_move', (payload) => {
    const player = rooms.office.players[socket.id];
    if (!player) return;

    // 嚴格狀態檢查: 若處於坐姿且無站起請求，鎖死位置
    if (player.isSitting && payload.isSitting) {
      payload.x = player.x;
      payload.y = player.y;
    }

    // 立即更新伺服器內存狀態庫
    player.x = typeof payload.x === 'number' ? payload.x : player.x;
    player.y = typeof payload.y === 'number' ? payload.y : player.y;
    player.anim = payload.anim || player.anim;
    player.heldItem = payload.heldItem !== undefined ? payload.heldItem : player.heldItem;
    player.isSprinting = Boolean(payload.isSprinting);
    player.isSitting = Boolean(payload.isSitting);
    player.chairId = payload.chairId || null;
    if (payload.avatarData) player.avatarData = payload.avatarData;
    if (payload.customBubble !== undefined) player.customBubble = payload.customBubble;

    // 低延遲廣播 player_moved 封包至同房間其他成員
    socket.to('office').emit('player_moved', {
      id: socket.id,
      x: player.x,
      y: player.y,
      anim: player.anim,
      heldItem: player.heldItem,
      avatarData: player.avatarData,
      customBubble: player.customBubble,
      isSprinting: player.isSprinting,
      isSitting: player.isSitting,
      chairId: player.chairId,
      timestamp: Date.now()
    });
  });

  // ==========================================================================
  // 事件 B2: 玩家外觀造型自訂更新 (player_update_avatar)
  // ==========================================================================
  socket.on('player_update_avatar', (payload) => {
    const player = rooms.office.players[socket.id];
    if (!player) return;

    if (payload.avatarData) player.avatarData = payload.avatarData;
    if (payload.customBubble !== undefined) player.customBubble = payload.customBubble;
    if (payload.name) player.name = sanitizeString(payload.name);

    console.log(`[Avatar] 🎨 玩家 ${player.name} 更新了裝扮設定:`, player.avatarData, player.customBubble);

    io.to('office').emit('player_avatar_updated', {
      id: socket.id,
      name: player.name,
      avatarData: player.avatarData,
      customBubble: player.customBubble
    });
  });

  // ==========================================================================
  // 事件 C: 賽博輪盤權威伺服器抽獎 (roulette_spin)
  // ==========================================================================
  socket.on('roulette_spin', () => {
    const rouletteState = rooms.office.roulette;

    // 權威防重入互斥鎖: 若正在旋轉中，嚴格拒絕重複觸發
    if (rouletteState.active) {
      console.warn(`[Roulette] ⚠️ 輪盤正處於旋轉中，拒絕重入觸發 (發起者: ${socket.id})`);
      return;
    }

    // 生成真正隨機中獎扇區 (0 到 36 經典輪盤索引)
    const winningIndex = Math.floor(Math.random() * 37); // 0 ~ 36
    rouletteState.active = true;
    rouletteState.resultIndex = winningIndex;
    const player = rooms.office.players[socket.id];
    const playerName = player ? player.name : 'Colleague';
    rouletteState.lastWinner = playerName;

    console.log(`[Roulette] 🎯 權威伺服器開獎! 玩家: ${playerName} -> 扇區號碼: [${winningIndex}]`);

    // 向所有客戶端廣播 roulette_started 指令保證同步旋轉
    io.to('office').emit('roulette_started', {
      winningIndex: winningIndex,
      durationMs: 4000,
      spunById: socket.id,
      spunByName: playerName,
      timestamp: Date.now()
    });

    // 4秒旋轉緩動結束後，權威解鎖 roulette.active = false
    setTimeout(() => {
      rouletteState.active = false;
      console.log('[Roulette] ✅ 4秒旋轉期滿，輪盤冷卻解鎖，恢復待機狀態。');
      io.to('office').emit('roulette_ended', {
        resultIndex: winningIndex,
        winner: playerName
      });
    }, 4000);
  });

  // ==========================================================================
  // 事件 D: 聊天廣播與惡意代碼過濾 (chat_message)
  // ==========================================================================
  socket.on('chat_message', (payload) => {
    const player = rooms.office.players[socket.id];
    if (!player) return;

    const rawMsg = typeof payload === 'string' ? payload : (payload.message || '');
    const cleanMsg = sanitizeString(rawMsg).trim();

    if (!cleanMsg) return;

    // 廣播 chat_broadcast 包含 { id, message } 與玩家姓名和時間戳
    io.to('office').emit('chat_broadcast', {
      id: socket.id,
      name: player.name,
      message: cleanMsg,
      timestamp: Date.now()
    });
  });

  // ==========================================================================
  // 事件 E: 🪩 夜店派對模式全房同步 (toggle_club_mode)
  // ==========================================================================
  socket.on('toggle_club_mode', () => {
    rooms.office.clubMode = !rooms.office.clubMode;
    const player = rooms.office.players[socket.id];
    const triggerName = player ? player.name : 'Someone';

    console.log(`[ClubMode] 🪩 派對夜店模式變更: ${rooms.office.clubMode} (操作者: ${triggerName})`);
    io.to('office').emit('club_mode_changed', {
      active: rooms.office.clubMode,
      triggeredBy: triggerName
    });
  });

  // ==========================================================================
  // 事件 F: 茶水間物品拾取 / 享用 (item_action)
  // ==========================================================================
  socket.on('item_action', (data) => {
    const player = rooms.office.players[socket.id];
    if (!player) return;

    if (data.action === 'pickup') {
      player.heldItem = data.item || 'none';
    } else if (data.action === 'consume') {
      player.heldItem = 'none';
    }

    io.to('office').emit('item_state_changed', {
      id: socket.id,
      heldItem: player.heldItem,
      action: data.action,
      item: data.item
    });
  });

  // ==========================================================================
  // 事件 G: 椅子交互 (chair_interact)
  // ==========================================================================
  socket.on('chair_interact', (data) => {
    const player = rooms.office.players[socket.id];
    if (!player) return;

    if (data.action === 'sit') {
      player.isSitting = true;
      player.chairId = data.chairId;
      player.x = data.x;
      player.y = data.y;
      player.anim = 'sit_down';
    } else {
      player.isSitting = false;
      player.chairId = null;
      player.x = data.standX || player.x;
      player.y = data.standY || (player.y + 24);
      player.anim = 'idle';
    }

    io.to('office').emit('player_moved', {
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
  // 事件 H: 多媒體 YouTube 網址設定 (submit_youtube_url)
  // ==========================================================================
  socket.on('submit_youtube_url', (data) => {
    const player = rooms.office.players[socket.id];
    if (!player) return;

    const sanitized = sanitizeYouTubeEmbedUrl(data.url);
    if (sanitized) {
      rooms.office.media = {
        videoUrl: data.url,
        embedUrl: sanitized.embedUrl,
        title: data.title || 'Shared YouTube Stream',
        setBy: player.name
      };

      console.log(`[Media] 📺 玩家 ${player.name} 更新了投影螢幕: ${sanitized.embedUrl}`);
      io.to('office').emit('media_state_changed', rooms.office.media);
    } else {
      socket.emit('media_error', { message: '請輸入有效的 YouTube 影片網址！' });
    }
  });

  // ==========================================================================
  // 事件 I: 斷線清理 (disconnect)
  // ==========================================================================
  socket.on('disconnect', () => {
    console.log(`[Socket.io] 🔴 玩家已斷開: ID = ${socket.id}`);

    // 從全局記憶體字典中刪除該玩家節點
    delete rooms.office.players[socket.id];

    // 廣播 player_disconnected 事件通知所有前端清除遠端精靈實體
    io.to('office').emit('player_disconnected', { id: socket.id });
  });
});

// 健康檢查與除錯端點
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    room: 'office',
    onlinePlayers: Object.keys(rooms.office.players).length,
    rouletteActive: rooms.office.roulette.active,
    clubMode: rooms.office.clubMode,
    uptime: process.uptime()
  });
});

// 啟動伺服器
server.listen(PORT, '0.0.0.0', () => {
  console.log(`
  =============================================================
  🏢 2D Multiplayer Virtual Office — Authoritative Server (Stage 2)
  🔗 伺服器監聽: http://0.0.0.0:${PORT}
  🎨 視覺主題: Animal Crossing Cozy Clay + Temple Glassmorphism
  🕹️ 核心協議: Socket.io Low-Latency Authoritative Broadcasts
  =============================================================
  `);
});
