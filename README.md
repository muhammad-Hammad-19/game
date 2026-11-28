# Boundary Bash Cricket

A touch-first cricket game for phones and desktops, built with React, Vite and three.js. React owns the menus and the scoreboard; a small three.js scene draws the ground, players and ball.

## Run locally

1. Install Node.js 20 or newer.
2. In this folder, run `npm install`.
3. Run `npm run dev` and open the local URL Vite prints.

`npm test` runs the automated checks. `npm run build` creates the static site in `dist/`.

## What is in the game

- **Full matches.** Toss, two innings, an innings break with a full scorecard, and a chase. A tied match goes to a super over (one over each, two wickets).
- **Batting and bowling.** You bat one innings and bowl the other. If you would rather only bat, choose "Simulate" under "When you bowl" in match setup.
- **Eight clubs** with their own kits and rated squads, **three pitch types** (flat, green, dusty) and three opponent skill levels.
- **Champions Cup** (eight-team knockout) and a **career league** (seven-match season, then a final), both saved between sessions.
- **Online duel.** One player creates a room, the other joins with the five-character code. One bats while the other bowls, then you swap.
- **Progression.** XP and levels, coins, a kit room with bats and broadcast looks, 22 achievements and lifetime stats.
- **3D players** with team kits and animated batting, bowling, fielding, appeals and celebrations.
- **Presentation.** Moving camera, slow-motion replays of wickets and sixes, ball-by-ball commentary (text, and optionally spoken), crowd sound that swells with the action.
- **Installable.** The game is a PWA: it can be added to the home screen and plays offline after the first visit.

## Controls

### Batting
- The coloured mark on the pitch shows where the ball will land: orange favours a leg-side shot, yellow a straight one, blue an off-side one.
- Swipe left or right on the pitch to play to leg or off; a short tap plays straight. Release as the ball arrives. The timing bar shows how close you were.
- Choose **Drive** (along the ground) or **Loft** (in the air: more sixes, more catches). Fielders on the rope cut off fours and catch lofted hits, so check the field map.
- Keyboard: ← and → to place the shot, Space for straight, ↑ to switch drive/loft, ↓ to leave.

### Bowling
- Pick your bowler at the start of each over. Fast bowlers swing it; spinners turn it.
- Drag on the pitch to choose line and length, pick a delivery, then press **Bowl**. Press again to stop the release meter in the green zone. Releasing too late is a no-ball.
- Tap **Field** to cycle through field settings. Bowling the same ball repeatedly makes it easier for the batter to read.
- Keyboard: arrow keys to aim, 1–4 for the delivery, Space to bowl and release, F to change the field.

## Project layout

- `src/game/` — the match scene, scorebook (`innings.js`), quick simulator (`sim.js`), sound and rendering.
- `src/data/` — teams, pitches, shop items, achievements, competitions and the saved profile.
- `src/ui/` — React screens and the match HUD.
- `src/net/` — the link used by online duels.
- `static/` — web app manifest, service worker and icons (copied as-is into the build).
- `tests/` — rules tests plus a headless harness that plays whole innings with the real match scene.

## Online play

Online duels use WebRTC through [PeerJS](https://peerjs.com/). The two devices talk directly; the free public PeerJS service is only used to introduce them. For a public release you may want to run your own PeerJS server and pass its address in `src/net/transport.js`.

Adding `?net=local` to the URL swaps the link for a same-browser channel, which lets you test a duel in two tabs with no network.

## Deploy

Deploy the repository to Vercel. Vercel detects Vite automatically; the build command is `npm run build` and the output directory is `dist`.

## Players

Players are real-time 3D models. `src/game/assets/player.glb` holds one articulated cricketer with the gear for every role (helmet, cap, umpire's hat, pads, gloves, bat) and 30 animation clips (stance, swing, run, bowl, throw, dive, appeal, celebrate and more). The game clones it for each player, colours it in the team's kit and lights it.

The model is generated, not hand-sculpted: `node tools/build-player-model.mjs` rebuilds it from the pose data in `src/game/CricketActor.js`. To use an artist-made model instead, export it with the same part names and clip names (`role.pose`, for example `batter.swing`) and replace the file.

Settings → Players switches back to the painted sprites, which are also used on the "Low" graphics setting.
