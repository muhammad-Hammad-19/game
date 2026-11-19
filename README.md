# Boundary Bash Cricket

A touch-first mini cricket batting game built with React, Vite, Phaser 3, and Tailwind CSS. React owns menus and the scoreboard; Phaser owns the pitch, delivery timing, animations, and input.

## Run locally

1. Install Node.js 18 or newer.
2. In this folder, run `npm install`.
3. Run `npm run dev` and open the local URL Vite prints.

## Build and deploy

- `npm run build` creates the static site in `dist/`.
- Deploy the repository to Vercel. Vercel detects Vite automatically; the default build command is `npm run build` and output directory is `dist`. No extra configuration is required.

## Controls

- Tap/click during the delivery to swing.
- Swipe left/right to aim toward leg/off side; a short tap aims straight.
- Keyboard: Space for straight, left/right arrows to aim.
- Let a delivery pass for a chance of a dot ball or wicket.
- Watch the live field map before playing a shot. The bowling side moves fielders between deliveries to cover repeated shots and protect the boundary.

Match settings and the best innings are saved in local storage. Sound feedback uses generated Web Audio tones, and hit/wicket events use mobile vibration where the browser supports it.

## Current prototype

The one-over batting loop is playable end to end, with selectable 1, 2, 5, or 10 over innings, timing grades, runs, wickets, a live scoreboard, pause, and a result screen. Computer chase and player bowling are planned follow-on phases.
