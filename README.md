# Crashflock — Rebuild V3

A complete static HTML5 slingshot-destruction game for GitHub Pages.

## Campaign
- Bird Side: 10 stories × 20 levels = 200 levels.
- Pig Side: 10 stories × 20 levels = 200 levels.
- 400 campaign levels total.
- Every story: bosses on 5 and 15, major boss on 10, final boss on 20.
- 21 playable characters per side (42 total).
- 20 block/material systems with unique durability and behaviors.

## V3 rebuild fixes
- Reworked structure physics: unsupported blocks fall, supports can break, structures can collapse, and targets fall when their support is destroyed.
- Added structural supports to generated layouts so structures do not begin the level floating in midair.
- Rebalanced every 2-star and 3-star score threshold from each level's actual goals and available shots.
- Level Certification now checks 3-star reachability in addition to trajectory solvability.
- Added visible 2-star and 3-star targets to the gameplay HUD.
- Added procedural non-chiptune menu/game music using layered sine/triangle tones.
- Added full Settings screen: music, SFX, volume, aim guide, reduced motion, physics debug, export/reset save.
- Added Owner Menu with campaign unlocks, currency tools, character unlock tools, a 3-star test shortcut, and full QA shortcut.
- Owner access code for this local/dev build: `CRASHFLOCKDEV`.
- Added Daily Contracts and eight permanent achievements with claimable rewards.
- Rebuilt bird/pig sprite sheets with shading, texture, and stronger visual variation.
- Rebuilt all six environment backgrounds with themed detail and texture.
- Added a dedicated launcher asset.
- Replaced the old app icon with a custom Crashflock icon.
- Updated offline cache to include the new launcher asset.

## Modes
- Bird Campaign
- Pig Campaign
- Endless Run
- Boss Rush
- Daily Challenge
- Capsule Lab
- Daily Contracts + Achievements
- Character Roster / Infinite Unlocks
- Level Certification

## Run
Upload every file in this ZIP directly to the repository root. No folders are required.

For local testing, any static server works, for example:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## QA
The built-in Level Certification tests all 400 campaign levels. V3 certification verifies:
- unique structure fingerprints
- all 20 block systems represented
- bounded launch speed
- collision-clear certified trajectories
- enough shots for required goals
- minimum target size
- 3-star thresholds that do not exceed a certified clean-clear score

Five runtime screenshots from the rebuilt game are included separately with the delivery.
