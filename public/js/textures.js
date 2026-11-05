/**
 * ============================================================================
 * 2D Multiplayer Virtual Office — 程式化材質與精靈生成器 (Procedural Textures)
 * 技術: HTML5 2D Canvas 程式化繪圖 -> 動態注入 Phaser.Textures.TextureManager
 * 特點: 100% 零外部圖片資源相依、零 404 網路錯誤、極致動森黏土療癒風 (Chubby Clay Style)
 * ============================================================================
 */

import { GAME_CONFIG } from './config.js';

export class TextureGenerator {
  /**
   * 批次生成所有遊戲材質並註冊進 Phaser TextureManager
   * @param {Phaser.Scene} scene 
   */
  static generateAll(scene) {
    const tm = scene.textures;

    this.createFloorTextures(tm);
    this.createOfficeFurnitureTextures(tm);
    this.createProjectionScreenTextures(tm);
    this.createArcadeLoungeTextures(tm);
    this.createPantryTextures(tm);
    this.createSanitaryTextures(tm);
    this.createRouletteTextures(tm);
    this.createCharacterAvatars(tm);
    this.createCompositeAvatarParts(tm);
    this.createNpcDjTextures(tm);
  }

  /**
   * 輔助函式: 建立離屏 Canvas 並取得 2D 上下文
   */
  static createCanvas(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    return { canvas, ctx };
  }

  /**
   * 輔助函式: 繪製帶圓角的矩形 (Rounded Rectangle)
   */
  static roundRect(ctx, x, y, width, height, radius, fill = true, stroke = false) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
  }

  // ==========================================================================
  // 1. 地板與地毯材質生成
  // ==========================================================================
  static createFloorTextures(tm) {
    // A. 溫暖白樺木人字拼木地板 (Herringbone Parquet)
    {
      const { canvas, ctx } = this.createCanvas(128, 128);
      ctx.fillStyle = GAME_CONFIG.PALETTE.FLOOR_WOOD_LIGHT;
      ctx.fillRect(0, 0, 128, 128);

      ctx.fillStyle = GAME_CONFIG.PALETTE.FLOOR_WOOD_DARK;
      // 交替木紋條
      for (let y = 0; y < 128; y += 32) {
        for (let x = 0; x < 128; x += 64) {
          ctx.strokeStyle = '#D8C6AE';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(x, y, 64, 32);
          
          // 微細木質肌理
          ctx.beginPath();
          ctx.strokeStyle = 'rgba(190, 170, 145, 0.4)';
          ctx.moveTo(x + 8, y + 10); ctx.lineTo(x + 56, y + 10);
          ctx.moveTo(x + 14, y + 22); ctx.lineTo(x + 48, y + 22);
          ctx.stroke();
        }
      }
      tm.addCanvas('floor_wood', canvas);
    }

    // B. 茶水區薄荷白棋盤格地磚 (Checkerboard Linoleum)
    {
      const { canvas, ctx } = this.createCanvas(64, 64);
      const size = 32;
      ctx.fillStyle = GAME_CONFIG.PALETTE.FLOOR_LINOLEUM_CREAM;
      ctx.fillRect(0, 0, 64, 64);

      ctx.fillStyle = GAME_CONFIG.PALETTE.FLOOR_LINOLEUM_MINT;
      ctx.fillRect(0, 0, size, size);
      ctx.fillRect(size, size, size, size);

      // 細緻柔和接縫
      ctx.strokeStyle = '#95D5B2';
      ctx.lineWidth = 1;
      ctx.strokeRect(0, 0, 64, 64);
      tm.addCanvas('floor_linoleum', canvas);
    }

    // C. 衛生間清爽淡藍磁磚 (Sanitary Restroom Tile)
    {
      const { canvas, ctx } = this.createCanvas(64, 64);
      ctx.fillStyle = '#EBF5FB';
      ctx.fillRect(0, 0, 64, 64);
      ctx.strokeStyle = '#AED6F1';
      ctx.lineWidth = 2;
      ctx.strokeRect(0, 0, 32, 32);
      ctx.strokeRect(32, 0, 32, 32);
      ctx.strokeRect(0, 32, 32, 32);
      ctx.strokeRect(32, 32, 32, 32);
      tm.addCanvas('floor_restroom', canvas);
    }

    // D. 主辦公區大圓角薄荷綠地毯 (Office Pastel Rug)
    {
      const { canvas, ctx } = this.createCanvas(320, 240);
      ctx.fillStyle = '#C8E6C9';
      this.roundRect(ctx, 4, 4, 312, 232, 24, true, false);

      ctx.strokeStyle = '#81C784';
      ctx.lineWidth = 4;
      ctx.setLineDash([8, 6]);
      this.roundRect(ctx, 12, 12, 296, 216, 18, false, true);
      tm.addCanvas('rug_office', canvas);
    }

    // E. 休息客廳溫馨珊瑚粉圓角地毯 (Lounge Rug)
    {
      const { canvas, ctx } = this.createCanvas(260, 200);
      ctx.fillStyle = '#FFE0B2';
      this.roundRect(ctx, 4, 4, 252, 192, 24, true, false);

      ctx.strokeStyle = '#FFB74D';
      ctx.lineWidth = 4;
      ctx.setLineDash([6, 6]);
      this.roundRect(ctx, 12, 12, 236, 176, 18, false, true);
      tm.addCanvas('rug_lounge', canvas);
    }
  }

  // ==========================================================================
  // 2. 辦公區 8 桌矩陣與桌面配件 (Office Desk Node & Devices)
  // ==========================================================================
  static createOfficeFurnitureTextures(tm) {
    // 辦公桌單元 (Chubby Clay Desk: 96 x 60 px)
    {
      const { canvas, ctx } = this.createCanvas(96, 60);
      // 底部陰影
      ctx.fillStyle = 'rgba(70, 50, 30, 0.18)';
      this.roundRect(ctx, 4, 8, 88, 52, 12, true);

      // 溫潤木面
      ctx.fillStyle = '#E0A96D';
      this.roundRect(ctx, 4, 4, 88, 50, 10, true);

      // 桌面高光倒角邊緣
      ctx.strokeStyle = '#FFF1D0';
      ctx.lineWidth = 2;
      this.roundRect(ctx, 6, 6, 84, 46, 8, false, true);

      // 桌面辦公墊 (Desk Pad)
      ctx.fillStyle = '#778DA9';
      this.roundRect(ctx, 18, 14, 60, 32, 4, true);

      tm.addCanvas('desk_single', canvas);
    }

    // 圓角桌上型螢幕 (Rounded Monitor: 32 x 24 px)
    {
      const { canvas, ctx } = this.createCanvas(36, 26);
      // 螢幕支架
      ctx.fillStyle = '#94A3B8';
      ctx.fillRect(14, 20, 8, 4);
      ctx.fillRect(10, 23, 16, 3);

      // 邊框
      ctx.fillStyle = '#334155';
      this.roundRect(ctx, 2, 2, 32, 20, 4, true);

      // 發光彩色程式碼螢幕 (Glowing IDE Display)
      ctx.fillStyle = '#0F172A';
      this.roundRect(ctx, 4, 4, 28, 16, 2, true);

      // 模擬彩色代碼行
      ctx.fillStyle = '#38BDF8'; ctx.fillRect(6, 6, 12, 2);
      ctx.fillStyle = '#4ADE80'; ctx.fillRect(6, 9, 18, 2);
      ctx.fillStyle = '#F472B6'; ctx.fillRect(6, 12, 10, 2);
      ctx.fillStyle = '#FBBF24'; ctx.fillRect(6, 15, 14, 2);

      tm.addCanvas('prop_monitor', canvas);
    }

    // 緊湊型機械鍵盤 (Compact Keyboard: 24 x 10 px)
    {
      const { canvas, ctx } = this.createCanvas(24, 12);
      ctx.fillStyle = '#E2E8F0';
      this.roundRect(ctx, 2, 2, 20, 8, 2, true);
      // 鍵帽點陣
      ctx.fillStyle = '#64748B';
      for (let x = 4; x <= 18; x += 3) {
        ctx.fillRect(x, 4, 2, 1);
        ctx.fillRect(x, 7, 2, 1);
      }
      tm.addCanvas('prop_keyboard', canvas);
    }

    // 可愛輕薄筆電 (Cute Pastel Laptop: 22 x 18 px)
    {
      const { canvas, ctx } = this.createCanvas(26, 20);
      ctx.fillStyle = '#F472B6'; // 櫻花粉機身
      this.roundRect(ctx, 3, 2, 20, 14, 3, true);

      ctx.fillStyle = '#1E293B';
      this.roundRect(ctx, 5, 4, 16, 10, 2, true);

      // 蘋果/發光小圖標
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(13, 9, 2, 0, Math.PI * 2);
      ctx.fill();

      tm.addCanvas('prop_laptop', canvas);
    }

    // 迷你桌上型電腦主機 (Mini CPU Chassis: 14 x 26 px)
    {
      const { canvas, ctx } = this.createCanvas(16, 28);
      ctx.fillStyle = '#1E293B';
      this.roundRect(ctx, 2, 2, 12, 24, 3, true);

      // 電源呼吸燈與散熱孔
      ctx.fillStyle = '#38BDF8';
      ctx.beginPath();
      ctx.arc(8, 6, 1.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#475569';
      ctx.fillRect(5, 12, 6, 1);
      ctx.fillRect(5, 15, 6, 1);
      ctx.fillRect(5, 18, 6, 1);

      tm.addCanvas('prop_cpu', canvas);
    }

    // 辦公人體工學旋轉椅 (Chubby Swivel Office Chair: 32 x 32 px)
    {
      const { canvas, ctx } = this.createCanvas(34, 34);
      // 五星輪底座
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(17, 17); ctx.lineTo(7, 27);
      ctx.moveTo(17, 17); ctx.lineTo(27, 27);
      ctx.moveTo(17, 17); ctx.lineTo(17, 7);
      ctx.stroke();

      // 湖水綠厚實軟墊 (Plush Teal Cushion)
      ctx.fillStyle = '#48CAE4';
      this.roundRect(ctx, 6, 8, 22, 18, 8, true);

      // 椅背
      ctx.fillStyle = '#0096C7';
      this.roundRect(ctx, 8, 4, 18, 8, 4, true);

      tm.addCanvas('office_chair', canvas);
    }
  }

  // ==========================================================================
  // 3. 多媒體北面大投影屏 (Multimedia Projection Screen)
  // ==========================================================================
  static createProjectionScreenTextures(tm) {
    const { canvas, ctx } = this.createCanvas(240, 130);

    // 外框架金屬鋁框 (Metallic Frame)
    ctx.fillStyle = '#475569';
    this.roundRect(ctx, 4, 4, 232, 122, 10, true);

    // 內幕黑色高對比邊界
    ctx.fillStyle = '#0F172A';
    this.roundRect(ctx, 10, 10, 220, 110, 6, true);

    // 屏幕中央漸層與 YouTube 圖標
    const grad = ctx.createLinearGradient(10, 10, 230, 120);
    grad.addColorStop(0, '#1E293B');
    grad.addColorStop(1, '#0F172A');
    ctx.fillStyle = grad;
    this.roundRect(ctx, 12, 12, 216, 106, 4, true);

    // YouTube 紅色播放按鈕裝飾
    ctx.fillStyle = '#FF0000';
    this.roundRect(ctx, 100, 48, 40, 28, 8, true);
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.moveTo(116, 56);
    ctx.lineTo(128, 62);
    ctx.lineTo(116, 68);
    ctx.closePath();
    ctx.fill();

    // 提示文字
    ctx.fillStyle = '#94A3B8';
    ctx.font = 'bold 11px Quicksand, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('📺 MULTIMEDIA STAGE (APPROACH TO PLAY)', 120, 100);

    tm.addCanvas('prop_projector_screen', canvas);

    // 圓潤單人沙發 (Chubby Single Sofa Seat for YouTube Screen: 44 x 44 px)
    {
      const sofa = this.createCanvas(44, 44);
      // 陰影
      sofa.ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
      this.roundRect(sofa.ctx, 4, 6, 36, 34, 10, true);

      // 沙發主體
      sofa.ctx.fillStyle = '#6B9080';
      this.roundRect(sofa.ctx, 2, 2, 40, 36, 10, true);

      // 厚實圓潤坐墊 (Plush Cushion)
      sofa.ctx.fillStyle = '#A4C3B2';
      this.roundRect(sofa.ctx, 6, 8, 32, 26, 8, true);

      // 高光靠背
      sofa.ctx.fillStyle = '#CCE3DE';
      this.roundRect(sofa.ctx, 8, 4, 28, 8, 4, true);

      tm.addCanvas('sofa_single_seat', sofa.canvas);
    }
  }

  // ==========================================================================
  // 4. 遊戲娛樂區 (L型厚實沙發 + 復古 CRT 電視 + PS5)
  // ==========================================================================
  static createArcadeLoungeTextures(tm) {
    // 鼠尾草綠 L型沙發 (Cozy Sage L-Couch: 160 x 140 px)
    {
      const { canvas, ctx } = this.createCanvas(160, 140);
      // 陰影
      ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
      this.roundRect(ctx, 6, 8, 148, 126, 18, true);

      // 主座身
      ctx.fillStyle = '#588157';
      this.roundRect(ctx, 4, 4, 148, 52, 16, true); // 橫向主體
      this.roundRect(ctx, 4, 4, 52, 124, 16, true); // 縱向翼展

      // 蓬鬆軟墊 (Plump Cushions)
      ctx.fillStyle = '#A3B18A';
      this.roundRect(ctx, 8, 8, 44, 44, 12, true);
      this.roundRect(ctx, 56, 8, 44, 44, 12, true);
      this.roundRect(ctx, 104, 8, 44, 44, 12, true);
      this.roundRect(ctx, 8, 56, 44, 44, 12, true);
      this.roundRect(ctx, 8, 104, 44, 44, 12, true);

      // 靠枕裝飾 (Accent Pillows: 奶黃色與珊瑚粉)
      ctx.fillStyle = '#FFE6A7';
      this.roundRect(ctx, 12, 12, 20, 20, 6, true);
      ctx.fillStyle = '#FFB4A2';
      this.roundRect(ctx, 114, 12, 20, 20, 6, true);

      tm.addCanvas('lounge_couch', canvas);
    }

    // 復古木紋 CRT 電視機 (Retro CRT Television: 64 x 50 px)
    {
      const { canvas, ctx } = this.createCanvas(64, 54);
      // 兔耳天線 (Rabbit Ear Antennas)
      ctx.strokeStyle = '#64748B';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(32, 14); ctx.lineTo(16, 2);
      ctx.moveTo(32, 14); ctx.lineTo(48, 2);
      ctx.stroke();

      // 木質機身
      ctx.fillStyle = '#8B5A2B';
      this.roundRect(ctx, 4, 14, 56, 36, 8, true);

      // 凸面發光顯像管屏幕 (Curved Cathode Ray Tube)
      ctx.fillStyle = '#10B981'; // 貪吃蛇翡翠綠光
      this.roundRect(ctx, 8, 18, 38, 28, 6, true);

      // 旋鈕與喇叭柵格
      ctx.fillStyle = '#4A2810';
      ctx.fillRect(49, 20, 8, 8);
      ctx.fillRect(49, 32, 8, 10);

      // 螢幕上的像素小蛇點綴
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(14, 30, 4, 4);
      ctx.fillRect(18, 30, 4, 4);
      ctx.fillRect(22, 30, 4, 4);
      ctx.fillRect(22, 26, 4, 4);

      tm.addCanvas('prop_crt_tv', canvas);
    }

    // 現代純白 PS5 底座主機 (PS5 Base Stand: 20 x 36 px)
    {
      const { canvas, ctx } = this.createCanvas(22, 38);
      // 黑色核心內膽
      ctx.fillStyle = '#0F172A';
      this.roundRect(ctx, 6, 4, 10, 30, 4, true);

      // 兩側優雅白色外殼夾層
      ctx.fillStyle = '#F8FAFC';
      this.roundRect(ctx, 3, 2, 4, 34, 3, true);
      this.roundRect(ctx, 15, 2, 4, 34, 3, true);

      // 標誌性蔚藍 LED 光條
      ctx.fillStyle = '#38BDF8';
      ctx.fillRect(7, 5, 2, 26);

      tm.addCanvas('prop_ps5', canvas);
    }
  }

  // ==========================================================================
  // 5. 茶水吧檯與雙門冰箱 (Pantry Bar & Dual Refrigerator)
  // ==========================================================================
  static createPantryTextures(tm) {
    // 圓弧木質吧檯長桌 (Bar Counter: 180 x 48 px)
    {
      const { canvas, ctx } = this.createCanvas(184, 52);
      // 陰影
      ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
      this.roundRect(ctx, 4, 6, 176, 44, 14, true);

      // 檯面實木色調
      ctx.fillStyle = '#D4A373';
      this.roundRect(ctx, 2, 2, 176, 44, 14, true);

      // 白色大理石拋光鑲邊
      ctx.strokeStyle = '#FAEDCD';
      ctx.lineWidth = 3;
      this.roundRect(ctx, 4, 4, 172, 40, 12, false, true);

      tm.addCanvas('bar_counter', canvas);
    }

    // 吧檯圓形高腳凳 (Bar Stool: 28 x 28 px)
    {
      const { canvas, ctx } = this.createCanvas(30, 30);
      // 底座腳架
      ctx.fillStyle = '#5A3E1B';
      ctx.beginPath();
      ctx.arc(15, 15, 6, 0, Math.PI * 2);
      ctx.fill();

      // 皮革厚座墊
      ctx.fillStyle = '#CCD5AE';
      ctx.beginPath();
      ctx.arc(15, 15, 12, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#E9EDC9';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(15, 15, 9, 0, Math.PI * 2);
      ctx.stroke();

      tm.addCanvas('bar_stool', canvas);
    }

    // 復古雙門淡奶油色冰箱 (Double-Door Retro Refrigerator: 54 x 84 px)
    {
      const { canvas, ctx } = this.createCanvas(58, 88);
      // 陰影
      ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
      this.roundRect(ctx, 4, 6, 50, 78, 12, true);

      // 奶白色冰箱本體
      ctx.fillStyle = '#FEFAE0';
      this.roundRect(ctx, 2, 2, 50, 78, 12, true);

      // 上下雙門分界縫
      ctx.strokeStyle = '#D4A373';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(2, 32); ctx.lineTo(52, 32);
      ctx.stroke();

      // 圓潤鍍鉻把手
      ctx.fillStyle = '#94A3B8';
      this.roundRect(ctx, 8, 12, 4, 14, 2, true);
      this.roundRect(ctx, 8, 38, 4, 22, 2, true);

      // 動森綠葉冰箱磁鐵 (Cute Animal Crossing Leaf Magnet)
      ctx.fillStyle = '#52B788';
      ctx.beginPath();
      ctx.ellipse(36, 18, 6, 9, Math.PI / 4, 0, Math.PI * 2);
      ctx.fill();

      tm.addCanvas('prop_fridge', canvas);
    }

    // 點心與飲料圖標 (Item Sprites: Coke, Snack, Pizza)
    {
      // 1. Coke 可樂罐
      const { canvas: cokeCanvas, ctx: cokeCtx } = this.createCanvas(24, 24);
      cokeCtx.fillStyle = '#E63946';
      this.roundRect(cokeCtx, 6, 4, 12, 16, 4, true);
      cokeCtx.fillStyle = '#FFFFFF';
      cokeCtx.fillRect(8, 10, 8, 3);
      tm.addCanvas('item_coke', cokeCanvas);

      // 2. Snack 脆脆薯片包
      const { canvas: snackCanvas, ctx: snackCtx } = this.createCanvas(24, 24);
      snackCtx.fillStyle = '#FFB703';
      this.roundRect(snackCtx, 4, 4, 16, 16, 4, true);
      snackCtx.fillStyle = '#FB8500';
      snackCtx.fillRect(7, 10, 10, 4);
      tm.addCanvas('item_snack', snackCanvas);

      // 3. Pizza 香濃披薩切片
      const { canvas: pizzaCanvas, ctx: pizzaCtx } = this.createCanvas(24, 24);
      pizzaCtx.fillStyle = '#F4A261';
      pizzaCtx.beginPath();
      pizzaCtx.moveTo(12, 3);
      pizzaCtx.lineTo(21, 20);
      pizzaCtx.lineTo(3, 20);
      pizzaCtx.closePath();
      pizzaCtx.fill();
      // 義大利臘腸配料
      pizzaCtx.fillStyle = '#E76F51';
      pizzaCtx.beginPath();
      pizzaCtx.arc(12, 14, 2.5, 0, Math.PI * 2);
      pizzaCtx.arc(8, 17, 2, 0, Math.PI * 2);
      pizzaCtx.arc(16, 17, 2, 0, Math.PI * 2);
      pizzaCtx.fill();
      tm.addCanvas('item_pizza', pizzaCanvas);
    }
  }

  // ==========================================================================
  // 6. 衛生間隔間與衛浴設備 (Sanitary Stalls & Wash Sinks)
  // ==========================================================================
  static createSanitaryTextures(tm) {
    // 隔間牆 (Stall Boundary Wall: 140 x 14 px)
    {
      const { canvas, ctx } = this.createCanvas(140, 16);
      ctx.fillStyle = '#B0C4DE';
      this.roundRect(ctx, 2, 2, 136, 12, 4, true);
      tm.addCanvas('stall_wall_h', canvas);
    }
    {
      const { canvas, ctx } = this.createCanvas(16, 140);
      ctx.fillStyle = '#B0C4DE';
      this.roundRect(ctx, 2, 2, 12, 136, 4, true);
      tm.addCanvas('stall_wall_v', canvas);
    }

    // 陶瓷圓潤馬桶 (Round Toilet Fixture: 32 x 44 px)
    {
      const { canvas, ctx } = this.createCanvas(34, 46);
      // 水箱 (Water Tank)
      ctx.fillStyle = '#F8FAFC';
      this.roundRect(ctx, 4, 4, 26, 12, 4, true);
      ctx.strokeStyle = '#CBD5E1';
      ctx.lineWidth = 1.5;
      this.roundRect(ctx, 4, 4, 26, 12, 4, false, true);

      // 馬桶座圈 (Oval Bowl)
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.ellipse(17, 28, 12, 14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // 馬桶蓋內圈
      ctx.fillStyle = '#E2E8F0';
      ctx.beginPath();
      ctx.ellipse(17, 29, 8, 10, 0, 0, Math.PI * 2);
      ctx.fill();

      tm.addCanvas('prop_toilet', canvas);
    }

    // 洗手台與梳妝鏡 (Vanity Wash Sink: 36 x 36 px)
    {
      const { canvas, ctx } = this.createCanvas(38, 38);
      // 大理石檯面
      ctx.fillStyle = '#E2E8F0';
      this.roundRect(ctx, 2, 2, 34, 34, 6, true);

      // 水槽 (Oval Basin)
      ctx.fillStyle = '#38BDF8';
      ctx.beginPath();
      ctx.ellipse(19, 21, 11, 9, 0, 0, Math.PI * 2);
      ctx.fill();

      // 鍍鉻水龍頭 (Chrome Faucet)
      ctx.fillStyle = '#64748B';
      this.roundRect(ctx, 16, 4, 6, 8, 2, true);

      tm.addCanvas('prop_sink', canvas);
    }
  }

  // ==========================================================================
  // 7. 賽博大輪盤 (Cyber Roulette 8-Sector Wheel & Pointer Needle)
  // ==========================================================================
  static createRouletteTextures(tm) {
    // 輪盤本體 (Roulette Wheel: 直徑 120 px)
    {
      const size = 130;
      const radius = 60;
      const center = size / 2;
      const { canvas, ctx } = this.createCanvas(size, size);

      // 外圍黃金外框與鉚釘
      ctx.fillStyle = '#B38300';
      ctx.beginPath();
      ctx.arc(center, center, radius + 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#FFD166';
      ctx.beginPath();
      ctx.arc(center, center, radius, 0, Math.PI * 2);
      ctx.fill();

      // 繪製 8 塊繽紛扇區 (8 Sectors)
      const colors = ['#EF476F', '#F78C6B', '#FFD166', '#06D6A0', '#118AB2', '#073B4C', '#8338EC', '#3A86FF'];
      const sliceAngle = (Math.PI * 2) / 8;

      for (let i = 0; i < 8; i++) {
        const start = i * sliceAngle;
        const end = start + sliceAngle;

        ctx.fillStyle = colors[i];
        ctx.beginPath();
        ctx.moveTo(center, center);
        ctx.arc(center, center, radius - 4, start, end);
        ctx.closePath();
        ctx.fill();

        // 扇區分隔金線
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // 扇區小數字/星點標記
        const mid = start + sliceAngle / 2;
        const dotX = center + Math.cos(mid) * (radius - 18);
        const dotY = center + Math.sin(mid) * (radius - 18);
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(dotX, dotY, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      // 輪盤中心黃金徽章 (Golden Hub)
      ctx.fillStyle = '#FFD166';
      ctx.beginPath();
      ctx.arc(center, center, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#B38300';
      ctx.lineWidth = 3;
      ctx.stroke();

      // 中心五角星
      ctx.fillStyle = '#FFF';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('★', center, center);

      tm.addCanvas('roulette_wheel', canvas);
    }

    // 輪盤金色指針 (Golden Pointer Needle)
    {
      const { canvas, ctx } = this.createCanvas(24, 32);
      ctx.fillStyle = '#E63946';
      ctx.beginPath();
      ctx.moveTo(12, 28); // 箭頭指下
      ctx.lineTo(2, 6);
      ctx.lineTo(22, 6);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#FFD166';
      ctx.beginPath();
      ctx.arc(12, 8, 6, 0, Math.PI * 2);
      ctx.fill();

      tm.addCanvas('roulette_needle', canvas);
    }
  }

  // ==========================================================================
  // 8. 動森風格可愛動物角色精靈 (Animal Crossing Chubby Avatars)
  // ==========================================================================
  static createCharacterAvatars(tm) {
    const SPECIES = ['CAT', 'BEAR', 'BUNNY', 'PUPPY'];
    const DIRECTIONS = ['down', 'up', 'left', 'right'];

    SPECIES.forEach(species => {
      DIRECTIONS.forEach(dir => {
        // 為每種方向建立 3 幀動作: 0 = Idle, 1 = Walk Left Foot, 2 = Walk Right Foot, 3 = Sit
        for (let frame = 0; frame <= 3; frame++) {
          const key = `avatar_${species}_${dir}_${frame}`;
          const { canvas, ctx } = this.createCanvas(48, 56);

          const skinColor =
            species === 'CAT' ? '#FED7AA' :
            species === 'BEAR' ? '#DDA15E' :
            species === 'BUNNY' ? '#FDE2E4' : '#F5CD79';

          const isSit = frame === 3;
          const walkOffset = (frame === 1) ? -2 : (frame === 2) ? 2 : 0;
          const bob = (frame === 1 || frame === 2) ? -2 : 0;

          // A. 腳步 (Feet)
          ctx.fillStyle = skinColor;
          if (!isSit) {
            ctx.beginPath();
            ctx.ellipse(18 + walkOffset, 50, 4, 3, 0, 0, Math.PI * 2);
            ctx.ellipse(30 - walkOffset, 50, 4, 3, 0, 0, Math.PI * 2);
            ctx.fill();
          }

          // B. 圓滾滾黏土身體 (Chubby Clay Torso)
          ctx.fillStyle = '#4ECDC4'; // 預設衣服顏色 (渲染時可由 Tint 動態疊加)
          const torsoY = isSit ? 34 : (32 + bob);
          this.roundRect(ctx, 14, torsoY, 20, isSit ? 16 : 18, 8, true);

          // C. 圓潤大頭 (Large Spherical Head)
          ctx.fillStyle = skinColor;
          const headY = isSit ? 20 : (18 + bob);
          ctx.beginPath();
          ctx.ellipse(24, headY, 15, 13, 0, 0, Math.PI * 2);
          ctx.fill();

          // D. 動物專屬耳朵 (Species Distinct Ears)
          if (species === 'CAT') {
            ctx.fillStyle = skinColor;
            ctx.beginPath();
            ctx.moveTo(13, headY - 8); ctx.lineTo(10, headY - 18); ctx.lineTo(19, headY - 11);
            ctx.moveTo(35, headY - 8); ctx.lineTo(38, headY - 18); ctx.lineTo(29, headY - 11);
            ctx.fill();
            // 耳內粉色
            ctx.fillStyle = '#FFAAA6';
            ctx.beginPath();
            ctx.moveTo(13, headY - 9); ctx.lineTo(11, headY - 16); ctx.lineTo(17, headY - 11);
            ctx.moveTo(35, headY - 9); ctx.lineTo(37, headY - 16); ctx.lineTo(31, headY - 11);
            ctx.fill();
          } else if (species === 'BEAR') {
            ctx.fillStyle = skinColor;
            ctx.beginPath();
            ctx.arc(12, headY - 10, 5, 0, Math.PI * 2);
            ctx.arc(36, headY - 10, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#BC6C25';
            ctx.beginPath();
            ctx.arc(12, headY - 10, 2.5, 0, Math.PI * 2);
            ctx.arc(36, headY - 10, 2.5, 0, Math.PI * 2);
            ctx.fill();
          } else if (species === 'BUNNY') {
            ctx.fillStyle = skinColor;
            this.roundRect(ctx, 14, headY - 24, 6, 16, 3, true);
            this.roundRect(ctx, 28, headY - 24, 6, 16, 3, true);
            ctx.fillStyle = '#FFB5A7';
            this.roundRect(ctx, 15.5, headY - 22, 3, 12, 1.5, true);
            this.roundRect(ctx, 29.5, headY - 22, 3, 12, 1.5, true);
          } else if (species === 'PUPPY') {
            // 垂耳狗 (Drooping Floppy Ears)
            ctx.fillStyle = '#E59866';
            this.roundRect(ctx, 7, headY - 6, 6, 14, 3, true);
            this.roundRect(ctx, 35, headY - 6, 6, 14, 3, true);
          }

          // E. 面部五官 (Facial Features)
          if (dir === 'down') {
            // 黑色無辜大眼
            ctx.fillStyle = '#2D3748';
            ctx.beginPath();
            ctx.arc(19, headY, 2.5, 0, Math.PI * 2);
            ctx.arc(29, headY, 2.5, 0, Math.PI * 2);
            ctx.fill();
            // 眼睛高光
            ctx.fillStyle = '#FFF';
            ctx.beginPath();
            ctx.arc(18.2, headY - 0.8, 1, 0, Math.PI * 2);
            ctx.arc(28.2, headY - 0.8, 1, 0, Math.PI * 2);
            ctx.fill();

            // 可愛腮紅 (Blushing Cheeks)
            ctx.fillStyle = 'rgba(255, 107, 107, 0.55)';
            ctx.beginPath();
            ctx.arc(16, headY + 3.5, 2.5, 0, Math.PI * 2);
            ctx.arc(32, headY + 3.5, 2.5, 0, Math.PI * 2);
            ctx.fill();

            // 小巧黑鼻
            ctx.fillStyle = '#2D3748';
            ctx.beginPath();
            ctx.arc(24, headY + 2, 1.5, 0, Math.PI * 2);
            ctx.fill();
          } else if (dir === 'left') {
            ctx.fillStyle = '#2D3748';
            ctx.beginPath();
            ctx.arc(16, headY, 2.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#FFF';
            ctx.beginPath();
            ctx.arc(15.2, headY - 0.8, 1, 0, Math.PI * 2);
            ctx.fill();
            // 腮紅
            ctx.fillStyle = 'rgba(255, 107, 107, 0.55)';
            ctx.beginPath();
            ctx.arc(14, headY + 3.5, 2.5, 0, Math.PI * 2);
            ctx.fill();
          } else if (dir === 'right') {
            ctx.fillStyle = '#2D3748';
            ctx.beginPath();
            ctx.arc(32, headY, 2.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#FFF';
            ctx.beginPath();
            ctx.arc(31.2, headY - 0.8, 1, 0, Math.PI * 2);
            ctx.fill();
            // 腮紅
            ctx.fillStyle = 'rgba(255, 107, 107, 0.55)';
            ctx.beginPath();
            ctx.arc(34, headY + 3.5, 2.5, 0, Math.PI * 2);
            ctx.fill();
          }

          tm.addCanvas(key, canvas);
        }
      });
    });
  }

  // ==========================================================================
  // 9. 複合角色自訂裝扮範本 (Composite Avatar Template Generator)
  //  - 底層身體 (Base Body Frame)
  //  - 髮型範本 (Grayscale Hair Texture Layers)
  //  - 衣服範本 (Grayscale Outfit Texture Layers)
  //  - 頭頂跟隨自訂狀態徽章/泡泡 (Overhead Tailing Bubble Badges)
  // ==========================================================================
  static createCompositeAvatarParts(tm) {
    const SPECIES = ['CAT', 'BEAR', 'BUNNY', 'PUPPY'];
    const DIRECTIONS = ['down', 'up', 'left', 'right'];

    // A. 底層身體 (Base Body Frame: 48 x 56 px)
    SPECIES.forEach(species => {
      DIRECTIONS.forEach(dir => {
        for (let frame = 0; frame <= 3; frame++) {
          const key = `avatar_base_${species}_${dir}_${frame}`;
          const { canvas, ctx } = this.createCanvas(48, 56);

          const skinColor =
            species === 'CAT' ? '#FED7AA' :
            species === 'BEAR' ? '#DDA15E' :
            species === 'BUNNY' ? '#FDE2E4' : '#F5CD79';

          const isSit = frame === 3;
          const walkOffset = (frame === 1) ? -2 : (frame === 2) ? 2 : 0;
          const bob = (frame === 1 || frame === 2) ? -2 : 0;

          // 腳步
          ctx.fillStyle = skinColor;
          if (!isSit) {
            ctx.beginPath();
            ctx.ellipse(18 + walkOffset, 50, 4, 3, 0, 0, Math.PI * 2);
            ctx.ellipse(30 - walkOffset, 50, 4, 3, 0, 0, Math.PI * 2);
            ctx.fill();
          }

          // 軀幹基底 (純白襯底供 outfit 疊加覆蓋)
          ctx.fillStyle = '#FFFFFF';
          const torsoY = isSit ? 34 : (32 + bob);
          this.roundRect(ctx, 14, torsoY, 20, isSit ? 16 : 18, 8, true);

          // 圓潤大頭
          ctx.fillStyle = skinColor;
          const headY = isSit ? 20 : (18 + bob);
          ctx.beginPath();
          ctx.ellipse(24, headY, 15, 13, 0, 0, Math.PI * 2);
          ctx.fill();

          // 耳朵造型
          if (species === 'CAT') {
            ctx.fillStyle = skinColor;
            ctx.beginPath();
            ctx.moveTo(13, headY - 8); ctx.lineTo(10, headY - 18); ctx.lineTo(19, headY - 11);
            ctx.moveTo(35, headY - 8); ctx.lineTo(38, headY - 18); ctx.lineTo(29, headY - 11);
            ctx.fill();
            ctx.fillStyle = '#FFAAA6';
            ctx.beginPath();
            ctx.moveTo(13, headY - 9); ctx.lineTo(11, headY - 16); ctx.lineTo(17, headY - 11);
            ctx.moveTo(35, headY - 9); ctx.lineTo(37, headY - 16); ctx.lineTo(31, headY - 11);
            ctx.fill();
          } else if (species === 'BEAR') {
            ctx.fillStyle = skinColor;
            ctx.beginPath();
            ctx.arc(12, headY - 10, 5, 0, Math.PI * 2);
            ctx.arc(36, headY - 10, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#BC6C25';
            ctx.beginPath();
            ctx.arc(12, headY - 10, 2.5, 0, Math.PI * 2);
            ctx.arc(36, headY - 10, 2.5, 0, Math.PI * 2);
            ctx.fill();
          } else if (species === 'BUNNY') {
            ctx.fillStyle = skinColor;
            this.roundRect(ctx, 14, headY - 24, 6, 16, 3, true);
            this.roundRect(ctx, 28, headY - 24, 6, 16, 3, true);
            ctx.fillStyle = '#FFB5A7';
            this.roundRect(ctx, 15.5, headY - 22, 3, 12, 1.5, true);
            this.roundRect(ctx, 29.5, headY - 22, 3, 12, 1.5, true);
          } else if (species === 'PUPPY') {
            ctx.fillStyle = '#E59866';
            this.roundRect(ctx, 7, headY - 6, 6, 14, 3, true);
            this.roundRect(ctx, 35, headY - 6, 6, 14, 3, true);
          }

          // 面部五官
          if (dir === 'down') {
            ctx.fillStyle = '#2D3748';
            ctx.beginPath();
            ctx.arc(19, headY, 2.5, 0, Math.PI * 2);
            ctx.arc(29, headY, 2.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#FFF';
            ctx.beginPath();
            ctx.arc(18.2, headY - 0.8, 1, 0, Math.PI * 2);
            ctx.arc(28.2, headY - 0.8, 1, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(255, 107, 107, 0.55)';
            ctx.beginPath();
            ctx.arc(16, headY + 3.5, 2.5, 0, Math.PI * 2);
            ctx.arc(32, headY + 3.5, 2.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#2D3748';
            ctx.beginPath();
            ctx.arc(24, headY + 2, 1.5, 0, Math.PI * 2);
            ctx.fill();
          } else if (dir === 'left') {
            ctx.fillStyle = '#2D3748';
            ctx.beginPath();
            ctx.arc(16, headY, 2.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#FFF';
            ctx.beginPath();
            ctx.arc(15.2, headY - 0.8, 1, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(255, 107, 107, 0.55)';
            ctx.beginPath();
            ctx.arc(14, headY + 3.5, 2.5, 0, Math.PI * 2);
            ctx.fill();
          } else if (dir === 'right') {
            ctx.fillStyle = '#2D3748';
            ctx.beginPath();
            ctx.arc(32, headY, 2.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#FFF';
            ctx.beginPath();
            ctx.arc(31.2, headY - 0.8, 1, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(255, 107, 107, 0.55)';
            ctx.beginPath();
            ctx.arc(34, headY + 3.5, 2.5, 0, Math.PI * 2);
            ctx.fill();
          }

          tm.addCanvas(key, canvas);
        }
      });
    });

    // B. 髮型款式 (Grayscale Hair Texture Layers - 灰階純白範本供 setTint 著色)
    const HAIR_STYLES = ['spiky', 'bob', 'ponytail', 'cap'];
    HAIR_STYLES.forEach(style => {
      DIRECTIONS.forEach(dir => {
        const key = `hair_${style}_${dir}`;
        const { canvas, ctx } = this.createCanvas(48, 56);
        ctx.fillStyle = '#FFFFFF';

        if (style === 'spiky') {
          // 俐落刺蝟頭
          ctx.beginPath();
          ctx.moveTo(14, 14); ctx.lineTo(16, 4); ctx.lineTo(21, 10);
          ctx.lineTo(24, 2); ctx.lineTo(27, 10); ctx.lineTo(32, 4);
          ctx.lineTo(34, 14);
          ctx.closePath();
          ctx.fill();
        } else if (style === 'bob') {
          // 可愛波波頭
          ctx.beginPath();
          ctx.arc(24, 16, 16, Math.PI, 0, false);
          ctx.lineTo(39, 24);
          ctx.quadraticCurveTo(36, 28, 33, 20);
          ctx.lineTo(15, 20);
          ctx.quadraticCurveTo(12, 28, 9, 24);
          ctx.closePath();
          ctx.fill();
        } else if (style === 'ponytail') {
          // 瀏海 + 高馬尾
          ctx.beginPath();
          ctx.arc(24, 15, 15, Math.PI, 0, false);
          ctx.fill();
          ctx.beginPath();
          ctx.ellipse(dir === 'left' ? 32 : (dir === 'right' ? 16 : 24), 6, 6, 9, 0.2, 0, Math.PI * 2);
          ctx.fill();
        } else if (style === 'cap') {
          // 棒球休閒帽 (Visor Cap)
          ctx.beginPath();
          ctx.arc(24, 15, 14, Math.PI, 0, false);
          ctx.fill();
          ctx.fillStyle = '#E2E8F0';
          if (dir === 'down') {
            this.roundRect(ctx, 15, 13, 18, 5, 2, true);
          } else if (dir === 'left') {
            this.roundRect(ctx, 10, 13, 16, 5, 2, true);
          } else if (dir === 'right') {
            this.roundRect(ctx, 22, 13, 16, 5, 2, true);
          }
        }

        tm.addCanvas(key, canvas);
      });
    });

    // C. 衣服款式 (Grayscale Outfit Texture Layers - 灰階純白範本供 setTint 著色)
    const OUTFIT_STYLES = ['hoodie', 'suit', 'apron', 'sweater'];
    OUTFIT_STYLES.forEach(style => {
      DIRECTIONS.forEach(dir => {
        for (let frame = 0; frame <= 3; frame++) {
          const key = `outfit_${style}_${dir}_${frame}`;
          const { canvas, ctx } = this.createCanvas(48, 56);
          const isSit = frame === 3;
          const bob = (frame === 1 || frame === 2) ? -2 : 0;
          const torsoY = isSit ? 34 : (32 + bob);

          ctx.fillStyle = '#FFFFFF';
          this.roundRect(ctx, 14, torsoY, 20, isSit ? 16 : 18, 8, true);

          if (style === 'hoodie') {
            // 連帽抽繩與袋鼠口袋
            ctx.fillStyle = '#E2E8F0';
            this.roundRect(ctx, 18, torsoY + 8, 12, 6, 2, true);
            ctx.fillStyle = '#CBD5E1';
            ctx.fillRect(20, torsoY + 2, 2, 5);
            ctx.fillRect(26, torsoY + 2, 2, 5);
          } else if (style === 'suit') {
            // 西裝領與小領帶
            ctx.fillStyle = '#CBD5E1';
            ctx.beginPath();
            ctx.moveTo(20, torsoY); ctx.lineTo(24, torsoY + 8); ctx.lineTo(28, torsoY);
            ctx.fill();
            ctx.fillStyle = '#94A3B8';
            ctx.fillRect(23, torsoY + 2, 2, 8);
          } else if (style === 'apron') {
            // 圍裙雙帶與大口袋
            ctx.fillStyle = '#E2E8F0';
            ctx.fillRect(16, torsoY + 1, 3, 12);
            ctx.fillRect(29, torsoY + 1, 3, 12);
            ctx.fillStyle = '#CBD5E1';
            this.roundRect(ctx, 17, torsoY + 9, 14, 6, 2, true);
          } else if (style === 'sweater') {
            // 針織毛衣橫條紋
            ctx.fillStyle = '#E2E8F0';
            ctx.fillRect(15, torsoY + 4, 18, 2);
            ctx.fillRect(15, torsoY + 9, 18, 2);
            ctx.fillRect(15, torsoY + 14, 18, 2);
          }

          tm.addCanvas(key, canvas);
        }
      });
    });

    // D. 頭頂跟隨自訂狀態徽章/泡泡 (Customizable Overhead Tailing Bubble Badges)
    const BUBBLES = [
      { id: 'code', icon: '💻' },
      { id: 'coffee', icon: '☕' },
      { id: 'rocket', icon: '🚀' },
      { id: 'sleep', icon: '💤' },
      { id: 'star', icon: '🌟' },
      { id: 'leaf', icon: '🍃' },
      { id: 'fire', icon: '🔥' }
    ];

    BUBBLES.forEach(b => {
      const { canvas, ctx } = this.createCanvas(32, 32);
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(16, 16, 14, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#78C0A8';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.font = '16px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(b.icon, 16, 17);

      tm.addCanvas(`bubble_badge_${b.id}`, canvas);
    });
  }

  // ==========================================================================
  // 10. NPC DJ (K.K. Slider 音樂狗與 DJ 台)
  // ==========================================================================
  static createNpcDjTextures(tm) {
    // DJ 混音控制台與黑膠唱盤 (DJ Turntable Booth: 96 x 48 px)
    {
      const { canvas, ctx } = this.createCanvas(100, 52);
      ctx.fillStyle = '#1E293B';
      this.roundRect(ctx, 4, 4, 92, 44, 8, true);

      // 雙黑膠唱盤 (Dual Vinyl Decks)
      ctx.fillStyle = '#0F172A';
      ctx.beginPath();
      ctx.arc(28, 26, 15, 0, Math.PI * 2);
      ctx.arc(72, 26, 15, 0, Math.PI * 2);
      ctx.fill();

      // 黑膠金屬中心標籤
      ctx.fillStyle = '#FFD166';
      ctx.beginPath();
      ctx.arc(28, 26, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#EF476F';
      ctx.beginPath();
      ctx.arc(72, 26, 5, 0, Math.PI * 2);
      ctx.fill();

      // 中央調音台推桿 (Mixer Sliders & EQ LEDs)
      ctx.fillStyle = '#38BDF8';
      ctx.fillRect(48, 14, 4, 2);
      ctx.fillRect(48, 20, 4, 2);
      ctx.fillStyle = '#4ADE80';
      ctx.fillRect(48, 26, 4, 2);
      ctx.fillRect(48, 32, 4, 2);

      tm.addCanvas('dj_booth', canvas);
    }
  }
}
