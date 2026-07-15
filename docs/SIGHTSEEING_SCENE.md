# Sightseeing Scene — Architecture & Maintenance Guide

> Last updated: July 2026  
> Scene key: `'train'` → canvas mode `'train'`  
> Live URL: https://serenityradio.duckdns.org  
> Server: Hetzner 5.223.72.120 · `/var/www/serenityradio`

---

## Overview

The Sightseeing scene is a 2D canvas airplane-cabin overlay rendered on top of a live
Cesium 3D-globe iframe. Users look through portrait aircraft windows at a real 3D map
of any city in the world, with scroll-to-zoom and drag-to-pan controls.

```
z-index stack (highest wins)
────────────────────────────
12  #train-location-picker   destination search drawer
11  #lp-toggle               "Choose Destination" button
10  #train-mini-hud          play · scene-switcher · destination
 3  #train-frame-canvas      2D cabin overlay (pointer-events:none)
 1  #cesium-train iframe     Cesium 3D globe (pointer-events:none)
 0  #bg-canvas               normal scene canvas
```

---

## Key Files

| File | Purpose |
|------|---------|
| `frontend/pages/index.html` | Main page: CSS for all train-mode UI, location-picker IIFE, mini-HUD HTML |
| `frontend/js/canvas_scenes.js` | Canvas RAF loop; `_trainInteriorFrame()` draws the cabin |
| `frontend/pages/train-view.html` | Cesium iframe: 3D globe, orbit loop, zoom/pan message handlers |

---

## Cabin Canvas (`canvas_scenes.js`)

### Entry point
```
setScene('train')          → RAF loop → _trainInteriorFrame(t)
```
`_trainInteriorFrame` lazy-inits `#train-frame-canvas` (110% viewport, `-5%` offset for
rocking bleed), binds interaction listeners, then draws every RAF frame.

### Responsive window layout
```javascript
const isMobile = VPW < 640;   // VPW = logical viewport width

// Mobile: 1 large centred window (72% canvas width)
// Desktop: 3 portrait windows at 21%, 50%, 79% of canvas width
const winCXs = isMobile ? [W * 0.500] : [W * 0.210, W * 0.500, W * 0.790];
```
`wTop = H * 0.09`, `wBot = H * 0.82`.  
Corner radius `wR = wW * 0.38` (classic aircraft window shape, NOT an ellipse/porthole).

### Draw order inside `_trainInteriorFrame`
1. Dark background gradient (left-dark, centre-blue, right-dark)
2. Ceiling arch + LED warm strip + bloom
3. Wall panel (dark gradient behind window area)
4. Overhead bins — gaps auto-built from `winCXs`
5. Seat backs (row ahead) — zones auto-built from `winCXs`
6. Armrest (bottom-left foreground)
7. Windows — `_drawWindow(cx)` per centre: shadow halo → frame → sill → bevel → **`destination-out` cutout** → glass glare + DoF vignette
8. Flight status badge (top-right corner of canvas)
9. Edge vignettes (left/right/top/bottom)
10. Scroll hint (fades after ~100 frames, anchored to centre window)

### Window cutout technique
```javascript
c.globalCompositeOperation = 'destination-out';
c.beginPath(); c.roundRect(gx, gy, gw, gh, gr); c.fill();
// → pixels inside the rounded-rect become transparent
// → Cesium iframe (z:1) shows through
c.restore();  // back to 'source-over' for glass FX drawn with clip
```

### Interaction — scroll & drag
`_bindTrainInteract()` attaches to `window` (not the canvas):
- **Wheel** → `_trainScrollHandler` → skips if target is `#train-mini-hud` / picker / toggle → `e.preventDefault()` → posts `{type:'zoom', delta}` to Cesium iframe
- **Mouse/touch drag** → posts `{type:'pan', dx, dy}` to Cesium iframe

`_trainWinHit()` is kept but always returns `true` — scroll/drag works anywhere on the cabin.

### Cleanup on scene exit
```javascript
_unbindTrainInteract();          // removes all window listeners
_trainIntCtx.clearRect(...);     // clears the overlay canvas
canvas.style.transform = '';
_trainIntCtx = null;             // forces re-init on next entry
```

---

## Cesium Iframe (`train-view.html`)

### Camera behaviour
- **Default**: smooth parametric orbit (`animating = true`) around `_orbitCX/_orbitCY`
- **After fly-to**: `animating = false` — camera locks at destination
- **Orbit loop**: `LOOP_SECONDS = 480` (~8 min per revolution)

### Zoom (scroll)
```javascript
// Scroll DOWN (deltaY > 0) = zoom IN (lower altitude)
const factor = data.delta > 0 ? 0.88 : 1.14;
const newAlt = Math.max(400, Math.min(8000, curAlt * factor));
// Pitch locked to -40° after every zoom (prevents camera flip)
pitch: Cesium.Math.toRadians(-40)
```
Min altitude **400 m** — below this the camera can disort / look at sky.

### Messages accepted
```
{ type: 'fly-to',       lon, lat, alt, name }   → flyTo() then animating=false
{ type: 'zoom',         delta }                  → altitude ×0.88 or ×1.14
{ type: 'pan',          dx, dy }                 → shift _orbitCX/_orbitCY
{ type: 'cesium-pause'  }                        → animating=false
{ type: 'cesium-resume' }                        → animating=true
```

---

## Location Picker (`index.html` — IIFE at bottom)

### Structure
All picker code lives in a single `(function(){ ... })()` at the very end of `<body>`.
It exposes three globals: `window._lpToggle`, `window._lpSearch`, `window._initLocationPicker`.

`_initLocationPicker()` is called by `_applyScene('train')` — guarded:
```javascript
if (scene === 'train' && typeof window._initLocationPicker === 'function')
  window._initLocationPicker();
```

### Curated cities (instant, no API call)
London, Paris, Tokyo, New York, Dubai, Sydney, Singapore, Bangkok, Rome,
**Taipei, Seoul, Hong Kong, Amsterdam, Barcelona, Istanbul, Berlin, Kuala Lumpur, Los Angeles**

### Fallback for unknown cities
Uses the Nominatim **bounding box** from the city search result, then runs 3 bounded
queries (`tourist attraction`, `museum`, `landmark`) within that box:
```javascript
const url = `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=4${viewbox}`;
```
Returns up to 6 deduplicated POI chips. Works worldwide.

### ⚠️ String literal rule
All strings in the picker IIFE **must use plain ASCII single quotes `'`**.  
Smart/curly quotes (`'` U+2019) break the JS parser silently — the whole IIFE fails
and `window._lpToggle` is never defined. Check with:
```bash
python3 -c "
raw = open('frontend/pages/index.html','rb').read()
print('OK' if b'\xe2\x80\x99' not in raw else 'SMART QUOTE FOUND')
"
```

---

## Mini HUD (`#train-mini-hud`)

Compact frosted-glass strip at bottom of screen (`z-index:10`), only visible in train mode.
Contains:
- Track name (synced from `loadTrack()`)
- ▶/⏸ play-pause (calls `togglePlay()` + `_tmhSyncPlay()`)
- ✈️ Destination (opens `#train-location-picker`)
- Scene switcher row (🌊 Sea · 🌌 Space · 🌲 Forest · 🏔️ Snow · 🐠 Aquarium)

---

## On-load scene restore
```javascript
// canvas_scenes.js bootstrap (DOMContentLoaded)
const savedScene = localStorage.getItem('sr_scene') || 'sea';
// train/aquarium skipped — require 3D init that can fail cold
const restoreScene = ['train','aquarium'].includes(savedScene) ? 'sea' : savedScene;
CanvasScenes.setScene(restoreScene);
```
The inline starfield (`drawCanvas`) is suppressed immediately:
```javascript
window._activeScene = '__cs__';  // set before RAF starts
```

---

## Deploy

```bash
# On monetisation server (5.223.72.120):
cd /var/www/serenityradio && git pull origin main && systemctl reload nginx
```

Push files via GitHub API (no git clone needed on local machine):
```bash
TOKEN=$(gh auth token); REPO="mailts001/serenityradio"
SHA=$(curl -s -H "Authorization: token $TOKEN" \
  "https://api.github.com/repos/$REPO/contents/frontend/js/canvas_scenes.js" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['sha'])")
CONTENT=$(python3 -c "import base64; print(base64.b64encode(open('canvas_scenes.js','rb').read()).decode())")
curl -X PUT -H "Authorization: token $TOKEN" -H "Content-Type: application/json" \
  "https://api.github.com/repos/$REPO/contents/frontend/js/canvas_scenes.js" \
  -d "{\"message\":\"your commit message\",\"content\":\"$CONTENT\",\"sha\":\"$SHA\"}"
```

---

## Known gotchas

| Issue | Cause | Fix |
|-------|-------|-----|
| `window._lpToggle is not a function` | Smart quote in picker IIFE breaks parsing | Replace curly quotes with plain `'` in index.html |
| Cabin canvas blocks page scroll | `wheel` handler with `e.preventDefault()` | `_isUiTarget(e.target)` skips HUD/picker; scroll works on those |
| Camera looks at sky after zooming | Cesium pitch flipped at low alt | Pitch locked to `toRadians(-40)` + min alt 400 m |
| Space scene flashes on load | Inline starfield RAF started before canvas_scenes.js | `window._activeScene = '__cs__'` set immediately |
| Ghost `_trainInteractBound` state | Re-entering train without full cleanup | `_unbindTrainInteract()` resets flag; `_trainIntCtx = null` forces re-init |
| `9988 / 700` HK stock ghost | Pre-existing IBKR short positions | Unrelated to Serenity Radio — see trading CLAUDE.md |
