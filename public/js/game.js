/**
 * ============================================================================
 * 2D Multiplayer Virtual Office — 遊戲入口啟動器 (Game Bootstrap)
 * 規格依據: Specification Section 1 (Architecture & Phaser 3 Setup)
 * 核心參數:
 *  - 渲染器: Phaser.AUTO
 *  - 容器綁定: HTML 容器 #game-container
 *  - 響應式模式: Phaser.Scale.RESIZE + CENTER_BOTH
 *  - 物理引擎: Arcade Physics (Gravity x:0, y:0, debug mode 可切換)
 * ============================================================================
 */

import { MainScene } from './mainScene.js';

window.addEventListener('DOMContentLoaded', () => {
  const config = {
    type: Phaser.AUTO,
    parent: 'game-container',
    width: window.innerWidth,
    height: window.innerHeight,
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH
    },
    physics: {
      default: 'arcade',
      arcade: {
        gravity: { x: 0, y: 0 },
        debug: false // 預設關閉除錯網格，按下 F2 可即時切換
      }
    },
    dom: {
      createContainer: true
    },
    render: {
      antialias: true,
      pixelArt: false,
      roundPixels: true
    },
    scene: [MainScene]
  };

  const game = new Phaser.Game(config);

  // 鍵盤 F2 切換 Arcade 物理調試模式
  window.addEventListener('keydown', (e) => {
    if (e.key === 'F2') {
      const scene = game.scene.getScene('MainScene');
      if (scene && scene.physics && scene.physics.world) {
        const debug = !scene.physics.world.drawDebug;
        scene.physics.world.drawDebug = debug;
        if (scene.physics.world.debugGraphic) {
          scene.physics.world.debugGraphic.clear();
        }
        console.log(`[Debug] 🛠️ 物理偵錯碰撞盒模式: ${debug ? '開啟' : '關閉'}`);
      }
    }
  });

  // 暴露全域調試實例
  window.__OFFICE_GAME__ = game;
});
