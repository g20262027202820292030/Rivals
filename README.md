# 🔫 Roblox Rivals Style 1v1 Shooter (Robotics Edition)

A high-fidelity, polished, 3D 1v1 Arena Shooter inspired by Roblox Rivals! Built with React, Three.js (via raw WebGL wrappers for extreme performance), and Tailwind CSS. Engage in tactical 1v1 combat against elite robotic dummy bots on multiple immersive maps.

---

## 🎮 Game Controls & Techniques

| Key / Action | Control Function |
| :--- | :--- |
| **W, A, S, D** | Character Movement |
| **Mouse Move** | Aim Camera (First Person) |
| **Left Click** | Fire Weapon |
| **Right Click** | Aim Down Sights (ADS) for increased accuracy |
| **R** | Reload Weapon |
| **Space** | Jump |
| **C / Shift** | **Slide** (Maintains high-speed horizontal momentum, shrinks your hit box, and makes you harder to target) |
| **Slide + Jump** | **Slide-Jump / Long-Jump** (Boosts your speed and launches you forward across gap lanes!) |

---

## 🚀 Newly Added Features

### 💥 RPG Projectile & Rocket Jumping (로켓 점프)
- **Slow Projectiles**: The RPG fires slow-moving, visible 3D rockets that travel through space.
- **Micro Blast Radius (2.0 Units)**: Scaled down by 75% for extremely tactical, precision-focused play! On impact, the rocket detonates in a dense, compact explosion dealing up to 100 direct damage and 50 splash damage.
- **Precision Rocket Jump**: Triggering an explosion directly underneath your feet launches you into the air with balanced, 75% scaled-down vertical thrust (and horizontal momentum) for controlled, fast-paced trick shots without dealing critical self-damage.
- **Bot Launch Physics**: Detonations physically toss enemy bots in the air and push them backward inside the 2-unit blast circle!

### 👹 Nightmare Difficulty Bots (지옥 난이도 로봇 AI & 무기 다양화)
- **Randomized Armaments**: Bots now spawn carrying one of three weapon setups randomly:
  - **돌격소총 (Assault Rifle)**: Steel blue-gray rifle model. Rapid-fire orange-yellow laser tracers (350ms - 450ms intervals) dealing quick chip damage.
  - **저격소총 (Sniper Rifle)**: Stealth black long-barrel sniper rifle with scope model. Shoots high-intensity cyan lasers at slower intervals (1.6s - 2.0s) dealing massive damage (50 HP).
  - **RPG (Rocket Launcher)**: Military green launcher tube with a protruding red-tipped rocket. Fires actual physical 3D rocket projectiles that travel towards you and explode on impact, enabling bots to rocket-jump you!
- **Lethal Accuracy**: Robotic bots track your position with extreme precision, suffering almost zero spread error.
- **Relentless Pursuit & Dodge**: Bots react within fractions of a second, sprinting and side-strafing relative to your position.
- **Enhanced Durability**: Bot HP has been elevated to **200 HP**, requiring precise direct hits to destroy them.

---

## 📂 How to Export and Open on GitHub (깃허브 연동 방법)

You can easily sync, open, and share this repository directly on your GitHub account using the built-in AI Studio Build export utility:

1. **Locate Settings**:
   - In the top-right corner of the **Google AI Studio Build** interface, click on the **Settings (Gear Icon)** or **Export** option.
2. **Export to GitHub**:
   - Select **Export to GitHub** (or choose **Download ZIP** to save it locally).
   - If prompted, authorize Google AI Studio with your GitHub account.
3. **Repository Setup**:
   - Choose whether you want to create a **New Repository** (public or private) or update an existing one.
   - Click **Export** to push all of the source code, configs, and assets directly to your GitHub repository!
4. **Locally Running**:
   - Clone your new repository:
     ```bash
     git clone <your-github-repo-url>
     cd <your-repo-folder>
     ```
   - Install dependencies and start the local development server:
     ```bash
     npm install
     npm run dev
     ```
   - Build for production:
     ```bash
     npm run build
     npm run start
     ```

---

## 🛠️ Tech Stack & Key Modules

- **React & TypeScript**: Interactive state, custom HUD, weapon selector overlays, and score tallying.
- **Three.js**: Lightweight 3D rendering pipeline with hardware-accelerated shadows, customized materials, and low-latency physics.
- **Tailwind CSS**: Sleek cyber-aesthetic gaming HUD overlays, health bars, and floating damage numbers.
- **Motion**: Fluid UI state animations and menu transitions.
