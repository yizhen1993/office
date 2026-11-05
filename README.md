# KopiPeng 2D Multiplayer Virtual Office — Animal Crossing Cozy Edition

Production-ready, highly accurate, and fully detailed 2D multiplayer virtual office platform built with the **HTML5 Phaser 3 game engine** and **Node.js Socket.io**. Features a charming, Animal Crossing-inspired "chubby/rounded clay-like" cozy art style.

🌐 **Live Production Deployment:** [**https://office.kopipeng.online/**](https://office.kopipeng.online/)

---

## ✦ 1. Software Architecture & Phaser 3 Setup

- **Renderer:** `Phaser.AUTO` with canvas container bound to `#game-container`, responsive sizing with `Phaser.Scale.RESIZE` and `Phaser.Scale.CENTER_BOTH`.
- **Physics Engine:** `Arcade Physics` system enabled with zero gravity `(x: 0, y: 0)` and toggleable debug mode (Press `F2` to toggle collider hitboxes).
- **Layers & Depth Sorting (Z-Index Hierarchy):**
  - **`Layer 0: Floor`**: Ground texture tilemaps (warm birch herringbone parquet, checkerboard mint linoleum, restroom ceramic tiles, and rounded pastel rugs).
  - **`Layer 1: Furniture Base`**: Desks, refrigerator, toilets, partition walls, and bar counter with Arcade static colliders.
  - **`Layer 2: Interactive Overlays`**: Desktop monitors, compact keyboards, laptops, mini CPU towers, food items, and the cyber roulette wheel.
  - **`Layer 3: Y-Sorted Entity Layer`**: Player avatar, remote multiplayer sprites, and the NPC DJ. Configured with `this.cameras.main.startFollow(player)` and per-frame dynamic depth sorting based on Y-coordinate (`sprite.depth = sprite.y`) to prevent rendering artifacts when walking behind or in front of furniture.
  - **`Layer 4: UI / DOM Overlay`**: Overhead reactive chat bubbles, floating mobile virtual joycon, transparent action buttons, and embedded iframe video player.

---

## ✦ 2. Exhaustive Space Map Design & Programmatic Generation

All graphics and textures are programmatically synthesized via HTML5 2D Canvas methods into Phaser's Texture Manager (100% self-contained, zero external image files, zero network 404s):

### 1. Main Virtual Office Zone (8-Set Multi-Cluster Matrix)
- 8 distinct office desk nodes clustered into two separate 2×2 grids (4 desks interconnected per cluster).
- Each desk unit programmatically renders:
  - 1 rounded monitor with colorful IDE code lines
  - 1 compact keyboard with key dots
  - 1 cute pastel laptop with glowing logo
  - 1 mini desktop CPU chassis with LED power indicator
- Solid physics boundaries prevent walking through desks.
- Swivel ergonomic office chairs allow players to sit down and work.

### 2. Multimedia Projection Area (YouTube Proximity Player)
- Dedicated zone on the north wall with a 240×130px projection screen sprite.
- Real-time proximity tracker in the update loop: `Phaser.Math.Distance.Between(player.x, player.y, screen.x, screen.y)`.
- When within a 65px radius, prompts the player to watch or submit a YouTube URL.
- Integrates an absolute-positioned HTML `<iframe>` on top of the canvas via the DOM game object layer.
- Accepts standard YouTube Watch links (`youtube.com/watch?v=...`, `youtu.be/...`), sanitizes them into embed links, and synchronizes playback across all connected clients.
- **Proximity Audio Attenuation:** Dynamically scales audio volume down linearly as the player walks further away from the screen's center coordinate.

### 3. Gaming Arcade Zone (Chubby Lounge & Embedded Snake Game)
- Thick sage-green L-shaped cozy couch group with plump cushions and accent pillows.
- Retro wood-grain CRT television with curved cathode tube screen and rabbit-ear antennas.
- Sleek miniature white PS5 base stand with glowing blue LED light.
- **Embedded 2D Snake Arcade Engine:**
  - Interacting with the TV blocks player movement, toggles `isMiniGaming = true`, and spawns a retro CRT sub-canvas overlay.
  - 16×16px grid matrix with a fixed 150ms frame ticker.
  - Arrow keys / WASD directional controls.
  - Random food generation, current score, and local high score tracking.
  - Screen boundary and self-tail collision detection.
  - Clean "Exit Game" DOM handle that returns focus back to the virtual office.

### 4. Pantry & Fridge Refreshment System
- Long rounded wooden bar counter with polished brass trim and high round leather stools.
- Retro cream/mint double-door refrigerator with chrome handles and an Animal Crossing leaf magnet.
- Clicking the fridge opens a styled DOM dropdown menu: **"Coke"**, **"Snack"**, **"Pizza"**.
- Selecting an item sets `player.heldItem = selectedItem` and displays a floating food icon over the avatar's hand.
- Clicking the **"🍽️ EAT"** floating button triggers a scale-bounce eating animation and clears the held item.

### 5. Sanitary Zone
- 2 private restroom stalls partitioned with physical boundary walls.
- Inside each stall: round ceramic toilet fixture with oval bowl and water tank, and a marble vanity wash sink with chrome faucet.

### 6. Cyber Roulette Zone
- 8-sector colorful prize wheel with a golden riveted rim and gold triangle pointer needle.
- Clicking the wheel sends an interaction packet to the authoritative server.
- The server computes the random winning sector index (0 to 7) and broadcasts it to all players.
- On receiving the event, a decelerating `Cubic.easeOut` Tween animation spins the wheel over 4000ms, halting precisely on the server-voted sector, followed by a celebratory banner.

### 7. NPC DJ (K.K. Slider Dog)
- White puppy DJ with headphones and shades behind a dual vinyl turntable mixer booth playing floating music notes.

---

## ✦ 3. Multiplayer WebSocket Network Layer (Socket.io)

### Position & Sprite State Synchronization
- Local coordinate throttling (25Hz) emits `player_move`:
  ```json
  {
    "id": "socket_id",
    "x": 640.5,
    "y": 720.0,
    "vx": 160,
    "vy": 0,
    "anim": "walk_right",
    "heldItem": "Coke",
    "isSprinting": false,
    "isSitting": false
  }
  ```
- Local Map `remotePlayers` manages all connected peers.
- **Linear Interpolation (`Phaser.Math.Linear`):** Smoothly interpolates remote sprite nodes towards target coordinates every frame to eliminate network jitter.

### Overhead Reactive Chat Bubbles
- Outer DOM chat submission bar with quick emoji reaction buttons (`👋`, `☕`, `🎉`, `💤`, `⚡`).
- Submitting a message broadcasts `chat_broadcast` to all players.
- Renders a stylized speech bubble floating above the avatar (`avatar.y - 56`) with a rounded rectangular backdrop dynamically sized to fit word wrapping.
- An animated upward float is paired with a `this.time.delayedCall(5000)` event to fade out and destroy the bubble.

---

## ✦ 4. Mobile Overlays & Strict Mutex Lock Machine

### Mobile Virtual Touch Joystick
- On-screen virtual trackpad on the bottom-left quadrant.
- Pointer delta tracker maps touch vector displacements to `player.body.setVelocity(vx, vy)` with clamped boundary radius.

### Temple-Style Transparent Floating Action Overlays
Positioned in the bottom-right quadrant with frosted glass aesthetics:
- **Button 1 (🏃 RUN):** Pointer-down / pointer-up handlers. Holding activates `isSprinting = true` and applies a **2.5× velocity multiplier** (`400 px/s`).
- **Button 2 (🧍 STAND UP):** Conditionally rendered only when `isSitting == true`. Tapping resets character position to adjacent coordinates and unlocks movement.
- **Button 3 (🍽️ EAT):** Conditionally rendered when `heldItem !== null` to consume snacks.
- **Button 4 (⚡ ACTION):** Pulses and illuminates when near interactive objects (TV, Fridge, Roulette, Screen, Chairs).

### Strict Mutex Lock Machine (Rule Engine)
1. `if (isSprinting)`: Blocks sitting interactions; prevents launching mini-games.
2. `if (isSitting)`: Kills all velocities (`setVelocity(0, 0)`); locks joycon inputs; freezes run buttons (`opacity: 0.35`, `pointer-events: none`).
3. `if (isMiniGaming)`: Intercepts all keyboard events to route solely to Snake logic; pauses outbound player move packets.

---

## ✦ 5. Project Structure

```
/home/ubuntu/office/
├── package.json
├── package-lock.json
├── server.js               # Authoritative Socket.io game server & state store
├── Dockerfile              # Production Node.js container build
├── docker-compose.yml      # Service definition connected to kopipeng-net
├── README.md               # Architecture documentation
└── public/
    ├── index.html          # Responsive HTML5 layout, HUD, modals & chat
    ├── css/
    │   └── style.css       # Animal Crossing clay theme & transparent buttons
    └── js/
        ├── config.js       # World dimensions, layers, zones, and speeds
        ├── textures.js     # 100% procedural Canvas 2D texture generator
        ├── stateMachine.js # Strict Mutex Lock Machine
        ├── snakeGame.js    # Embedded 2D arcade Snake mini-game engine
        ├── network.js      # Socket.io client manager & linear interpolation
        ├── uiManager.js    # Virtual joystick, action buttons & YouTube proximity
        ├── mainScene.js    # Phaser 3 Scene, map builder, and Y-depth sorting
        └── game.js         # Game bootstrap & F2 debug toggle
```

---

## ✦ 6. Deployment & Local Development

### Run with Docker Compose
```bash
cd /home/ubuntu/office
docker compose up -d --build
```

### Run Locally with Node.js
```bash
cd /home/ubuntu/office
npm install
npm start
```
Open `http://localhost:3000` or visit [**https://office.kopipeng.online/**](https://office.kopipeng.online/).
