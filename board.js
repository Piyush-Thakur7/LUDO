/* ═══════════════════════════════════════════════════════════
   board.js — Ludo Board Geometry & Canvas Rendering
   Standard 15×15 grid · 52-cell clockwise track · 4 quadrants
   Layout: Green=Top-Left, Yellow=Top-Right,
           Red=Bottom-Left, Blue=Bottom-Right
   ═══════════════════════════════════════════════════════════ */

const LudoBoard = (() => {

    let offscreenCanvas = null;
    let offscreenCtx = null;

    // ─── Track & Coordinate Data ──────────────────────────

    /** 52-cell clockwise outer track. (col, row) with (0,0) at top-left. */
    const TRACK = [
        {x:0,y:6},{x:1,y:6},{x:2,y:6},{x:3,y:6},{x:4,y:6},{x:5,y:6},     // 0–5   left arm →
        {x:6,y:5},{x:6,y:4},{x:6,y:3},{x:6,y:2},{x:6,y:1},{x:6,y:0},     // 6–11  top-left ↑
        {x:7,y:0},                                                          // 12    top center
        {x:8,y:0},{x:8,y:1},{x:8,y:2},{x:8,y:3},{x:8,y:4},{x:8,y:5},     // 13–18 top-right ↓
        {x:9,y:6},{x:10,y:6},{x:11,y:6},{x:12,y:6},{x:13,y:6},{x:14,y:6},// 19–24 right arm →
        {x:14,y:7},                                                         // 25    right center
        {x:14,y:8},{x:13,y:8},{x:12,y:8},{x:11,y:8},{x:10,y:8},{x:9,y:8},// 26–31 right arm ←
        {x:8,y:9},{x:8,y:10},{x:8,y:11},{x:8,y:12},{x:8,y:13},{x:8,y:14},// 32–37 bottom-right ↓
        {x:7,y:14},                                                         // 38    bottom center
        {x:6,y:14},{x:6,y:13},{x:6,y:12},{x:6,y:11},{x:6,y:10},{x:6,y:9},// 39–44 bottom-left ↑
        {x:5,y:8},{x:4,y:8},{x:3,y:8},{x:2,y:8},{x:1,y:8},{x:0,y:8},    // 45–50 left arm ←
        {x:0,y:7}                                                           // 51    left center
    ];

    /** Safe zone indices (star tiles — cannot be captured here) */
    const SAFE = [1, 9, 14, 22, 27, 35, 40, 48];

    /** Where each color enters the outer track (relative position 0) */
    const START = { red: 40, green: 1, yellow: 14, blue: 27 };

    /** 5-cell home stretch for each color (before center finish) */
    const HOME = {
        red:    [{x:7,y:13},{x:7,y:12},{x:7,y:11},{x:7,y:10},{x:7,y:9}],
        green:  [{x:1,y:7}, {x:2,y:7}, {x:3,y:7}, {x:4,y:7}, {x:5,y:7}],
        yellow: [{x:7,y:1}, {x:7,y:2}, {x:7,y:3}, {x:7,y:4}, {x:7,y:5}],
        blue:   [{x:13,y:7},{x:12,y:7},{x:11,y:7},{x:10,y:7},{x:9,y:7}]
    };

    /** 4 base pocket positions per color (center-point coords) */
    const YARD = {
        red:    [{x:1.75,y:10.75},{x:4.25,y:10.75},{x:1.75,y:13.25},{x:4.25,y:13.25}],
        green:  [{x:1.75,y:1.75}, {x:4.25,y:1.75}, {x:1.75,y:4.25}, {x:4.25,y:4.25}],
        yellow: [{x:10.75,y:1.75},{x:13.25,y:1.75},{x:10.75,y:4.25},{x:13.25,y:4.25}],
        blue:   [{x:10.75,y:10.75},{x:13.25,y:10.75},{x:10.75,y:13.25},{x:13.25,y:13.25}]
    };

    /** Center-point coords for finished tokens (triangle centroids) */
    const FINISH = {
        green:  {x:6.5,  y:7.5},   // left triangle centroid
        yellow: {x:7.5,  y:6.5},   // top triangle centroid
        blue:   {x:8.5,  y:7.5},   // right triangle centroid
        red:    {x:7.5,  y:8.5}    // bottom triangle centroid
    };

    /** Color palette */
    const COLORS = {
        red:    {fill:'#e74c3c', dark:'#c0392b', light:'#f1948a', bg:'#fdecea'},
        green:  {fill:'#2ecc71', dark:'#27ae60', light:'#82e0aa', bg:'#eafaf1'},
        yellow: {fill:'#f39c12', dark:'#d68910', light:'#f9e79f', bg:'#fef9e7'},
        blue:   {fill:'#3498db', dark:'#2980b9', light:'#85c1e9', bg:'#ebf5fb'}
    };

    /** Base quadrant grid positions */
    const BASES = [
        {gx:0, gy:0, color:'green'},   // top-left
        {gx:9, gy:0, color:'yellow'},   // top-right
        {gx:0, gy:9, color:'red'},      // bottom-left
        {gx:9, gy:9, color:'blue'}      // bottom-right
    ];

    // ─── Coordinate Helpers ───────────────────────────────

    /**
     * Get the grid coordinates for a token.
     * @param {string} player - 'red'|'green'|'yellow'|'blue'
     * @param {number} tokenId - 0..3
     * @param {number} pos - -1=yard, 0-50=track, 51-55=home, 56=finished
     * @returns {{x:number, y:number}}
     */
    function tokenCoord(player, tokenId, pos) {
        if (pos === -1) return YARD[player][tokenId];
        if (pos >= 0 && pos <= 50) return TRACK[(START[player] + pos) % 52];
        if (pos >= 51 && pos <= 55) return HOME[player][pos - 51];
        if (pos === 56) return FINISH[player];
        return {x: 7, y: 7};
    }

    /** Get absolute track index (0–51) for a player's relative position */
    function absIndex(player, pos) {
        if (pos < 0 || pos > 50) return -1;
        return (START[player] + pos) % 52;
    }

    /** Check if an absolute track index is a safe zone */
    function isSafe(absIdx) { return SAFE.includes(absIdx); }

    // ─── Drawing Helpers ──────────────────────────────────

    function drawStar(ctx, cx, cy, radius, fillColor) {
        ctx.save();
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
            const outer = (i * 72 - 90) * Math.PI / 180;
            const inner = ((i * 72) + 36 - 90) * Math.PI / 180;
            ctx.lineTo(cx + radius * Math.cos(outer), cy + radius * Math.sin(outer));
            ctx.lineTo(cx + radius * 0.42 * Math.cos(inner), cy + radius * 0.42 * Math.sin(inner));
        }
        ctx.closePath();
        ctx.fillStyle = fillColor;
        ctx.fill();
        ctx.strokeStyle = '#2c3e50';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
    }

    /** Convert token coordinates to pixel center, handling yard vs track/home vs finish */
    function toPixel(coord, pos, S) {
        if (pos === -1 || pos === 56) {
            // Yard & Finish coords are already center-points
            return { px: coord.x * S, py: coord.y * S };
        }
        // Track & Home coords are cell top-left corners; center them
        return { px: coord.x * S + S / 2, py: coord.y * S + S / 2 };
    }

    // ─── Main Render Function ─────────────────────────────

    /**
     * Draw the complete Ludo board with all tokens.
     * @param {HTMLCanvasElement} canvas
     * @param {Array} tokens - [{player, id, pos}]
     * @param {Array} movable - [{player, id}] tokens the current player can move
     * @returns {Array} hitboxes - [{player, id, x, y, r}] for click detection
     */
    function drawBoard(canvas, tokens, movable) {
        // 1. Batch all read operations BEFORE any write operations
        const width = canvas.width;
        const height = canvas.height;
        const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
        const S = (width / dpr) / 15;  // cell size
        const W = width / dpr;

        // 2. Initialize offscreen canvas if needed
        if (!offscreenCanvas) {
            offscreenCanvas = document.createElement('canvas');
        }
        if (offscreenCanvas.width !== width || offscreenCanvas.height !== height) {
            offscreenCanvas.width = width;
            offscreenCanvas.height = height;
            offscreenCtx = offscreenCanvas.getContext('2d');
        }

        const oCtx = offscreenCtx;
        oCtx.save();
        oCtx.scale(dpr, dpr);

        // ── 1. Background ──
        oCtx.fillStyle = '#ecf0f1';
        oCtx.fillRect(0, 0, W, W);

        // ── 2. Grid lines for track arms ──
        oCtx.strokeStyle = '#bdc3c7';
        oCtx.lineWidth = 1;
        for (let c = 0; c < 15; c++) {
            for (let r = 0; r < 15; r++) {
                const inBase = (c<6&&r<6)||(c>8&&r<6)||(c<6&&r>8)||(c>8&&r>8);
                const inCenter = c>=6&&c<=8&&r>=6&&r<=8;
                if (!inBase && !inCenter) {
                    oCtx.strokeRect(c * S, r * S, S, S);
                }
            }
        }

        // ── 3. Base quadrants ──
        BASES.forEach(b => {
            const col = COLORS[b.color];
            const bx = b.gx * S, by = b.gy * S, size = 6 * S;

            // Colored background
            oCtx.fillStyle = col.fill;
            oCtx.fillRect(bx, by, size, size);
            oCtx.strokeStyle = '#2c3e50';
            oCtx.lineWidth = 3;
            oCtx.strokeRect(bx, by, size, size);

            // Inner white card
            const p = S * 0.85;
            oCtx.fillStyle = '#fff';
            oCtx.fillRect(bx + p, by + p, size - 2*p, size - 2*p);
            oCtx.strokeStyle = '#2c3e50';
            oCtx.lineWidth = 2;
            oCtx.strokeRect(bx + p, by + p, size - 2*p, size - 2*p);

            // Pocket circles
            YARD[b.color].forEach(pocket => {
                oCtx.beginPath();
                oCtx.arc(pocket.x * S, pocket.y * S, S * 0.55, 0, Math.PI * 2);
                oCtx.fillStyle = col.bg;
                oCtx.fill();
                oCtx.strokeStyle = col.fill;
                oCtx.lineWidth = 2.5;
                oCtx.stroke();
            });
        });

        // ── 4. Colored start cells & home stretches ──
        ['red','green','yellow','blue'].forEach(color => {
            const col = COLORS[color];

            // Start cell
            const sc = TRACK[START[color]];
            oCtx.fillStyle = col.fill;
            oCtx.fillRect(sc.x * S, sc.y * S, S, S);
            oCtx.strokeStyle = '#2c3e50';
            oCtx.lineWidth = 1;
            oCtx.strokeRect(sc.x * S, sc.y * S, S, S);

            // Home stretch cells
            HOME[color].forEach(cell => {
                oCtx.fillStyle = col.fill;
                oCtx.fillRect(cell.x * S, cell.y * S, S, S);
                oCtx.strokeStyle = '#2c3e50';
                oCtx.lineWidth = 1;
                oCtx.strokeRect(cell.x * S, cell.y * S, S, S);
            });
        });

        // ── 5. Safe zone stars ──
        SAFE.forEach(idx => {
            const cell = TRACK[idx];
            const cx = (cell.x + 0.5) * S, cy = (cell.y + 0.5) * S;
            let isStart = Object.values(START).includes(idx);
            drawStar(oCtx, cx, cy, S * 0.32, isStart ? '#fff' : '#f1c40f');
        });

        // ── 6. Center home triangles (colors match home stretches) ──
        const cL = 6 * S, cT = 6 * S, cS = 3 * S;
        const mx = cL + cS / 2, my = cT + cS / 2;
        oCtx.strokeStyle = '#2c3e50';
        oCtx.lineWidth = 2.5;

        // Green = Left (green home stretch enters from left)
        oCtx.beginPath();
        oCtx.moveTo(cL, cT); oCtx.lineTo(mx, my); oCtx.lineTo(cL, cT + cS);
        oCtx.closePath(); oCtx.fillStyle = COLORS.green.fill; oCtx.fill(); oCtx.stroke();

        // Yellow = Top (yellow home stretch enters from top)
        oCtx.beginPath();
        oCtx.moveTo(cL, cT); oCtx.lineTo(mx, my); oCtx.lineTo(cL + cS, cT);
        oCtx.closePath(); oCtx.fillStyle = COLORS.yellow.fill; oCtx.fill(); oCtx.stroke();

        // Blue = Right (blue home stretch enters from right)
        oCtx.beginPath();
        oCtx.moveTo(cL + cS, cT); oCtx.lineTo(mx, my); oCtx.lineTo(cL + cS, cT + cS);
        oCtx.closePath(); oCtx.fillStyle = COLORS.blue.fill; oCtx.fill(); oCtx.stroke();

        // Red = Bottom (red home stretch enters from bottom)
        oCtx.beginPath();
        oCtx.moveTo(cL, cT + cS); oCtx.lineTo(mx, my); oCtx.lineTo(cL + cS, cT + cS);
        oCtx.closePath(); oCtx.fillStyle = COLORS.red.fill; oCtx.fill(); oCtx.stroke();

        // ── 7. Group tokens by cell for stacking ──
        const groups = {};
        tokens.forEach(t => {
            let key;
            if (t.pos === -1) key = `yard-${t.player}-${t.id}`;
            else if (t.pos <= 50) key = `track-${absIndex(t.player, t.pos)}`;
            else if (t.pos <= 55) key = `home-${t.player}-${t.pos}`;
            else key = `finish-${t.player}`;

            if (!groups[key]) groups[key] = [];
            groups[key].push(t);
        });

        // ── 8. Draw tokens ──
        const movSet = new Set((movable || []).map(m => `${m.player}-${m.id}`));
        const hitboxes = [];

        Object.values(groups).forEach(list => {
            const n = list.length;
            list.forEach((t, i) => {
                const gc = tokenCoord(t.player, t.id, t.pos);
                const { px, py } = toPixel(gc, t.pos, S);
                let dx = 0, dy = 0, rad = S * 0.35;

                // Stacking offsets for multiple tokens on same cell
                if (t.pos !== -1 && n > 1) {
                    const off = S * 0.22;
                    if (n === 2) {
                        dx = (i === 0 ? -1 : 1) * off;
                        rad = S * 0.26;
                    } else if (n === 3) {
                        const a = [-90, 150, 30][i] * Math.PI / 180;
                        dx = off * Math.cos(a);
                        dy = off * Math.sin(a);
                        rad = S * 0.22;
                    } else {
                        dx = (i % 2 === 0 ? -1 : 1) * off;
                        dy = (Math.floor(i / 2) === 0 ? -1 : 1) * off;
                        rad = S * 0.2;
                    }
                }
                if (t.pos === 56) rad = S * 0.2;

                const sx = px + dx, sy = py + dy;
                const isMovable = movSet.has(`${t.player}-${t.id}`);
                const col = COLORS[t.player];

                // Pulsing glow for movable tokens
                if (isMovable) {
                    const pulse = Math.sin(Date.now() / 200) * 3;
                    oCtx.beginPath();
                    oCtx.ellipse(sx, sy - rad * 0.05, rad * 0.85 + pulse, rad * 1.0 + pulse, 0, 0, Math.PI * 2);
                    oCtx.fillStyle = 'rgba(241, 196, 15, 0.4)';
                    oCtx.fill();
                    oCtx.strokeStyle = '#f1c40f';
                    oCtx.lineWidth = 2;
                    oCtx.stroke();
                }

                // 1. Drop shadow below to feel "lifted" off the board
                oCtx.beginPath();
                oCtx.ellipse(sx, sy + rad * 0.65, rad * 0.75, rad * 0.22, 0, 0, Math.PI * 2);
                oCtx.fillStyle = 'rgba(0, 0, 0, 0.22)';
                oCtx.fill();

                // 2. Base
                oCtx.beginPath();
                oCtx.ellipse(sx, sy + rad * 0.55, rad * 0.7, rad * 0.2, 0, 0, Math.PI * 2);
                const baseGrad = oCtx.createLinearGradient(sx - rad * 0.7, sy + rad * 0.35, sx + rad * 0.7, sy + rad * 0.75);
                baseGrad.addColorStop(0, col.light);
                baseGrad.addColorStop(0.3, col.fill);
                baseGrad.addColorStop(1, col.dark);
                oCtx.fillStyle = baseGrad;
                oCtx.fill();
                oCtx.strokeStyle = col.dark;
                oCtx.lineWidth = 1.5;
                oCtx.stroke();

                // 3. Body (narrow neck, flared bottom)
                oCtx.beginPath();
                oCtx.moveTo(sx - rad * 0.25, sy - rad * 0.1);
                oCtx.quadraticCurveTo(sx - rad * 0.3, sy + rad * 0.25, sx - rad * 0.65, sy + rad * 0.55);
                oCtx.lineTo(sx + rad * 0.65, sy + rad * 0.55);
                oCtx.quadraticCurveTo(sx + rad * 0.3, sy + rad * 0.25, sx + rad * 0.25, sy - rad * 0.1);
                oCtx.closePath();
                const bodyGrad = oCtx.createLinearGradient(sx - rad * 0.5, sy - rad * 0.1, sx + rad * 0.5, sy + rad * 0.55);
                bodyGrad.addColorStop(0, col.light);
                bodyGrad.addColorStop(0.3, col.fill);
                bodyGrad.addColorStop(1, col.dark);
                oCtx.fillStyle = bodyGrad;
                oCtx.fill();
                oCtx.strokeStyle = col.dark;
                oCtx.lineWidth = 1.5;
                oCtx.stroke();

                // 4. Collar (neck ring)
                oCtx.beginPath();
                oCtx.ellipse(sx, sy - rad * 0.1, rad * 0.3, rad * 0.08, 0, 0, Math.PI * 2);
                const collarGrad = oCtx.createLinearGradient(sx - rad * 0.3, sy - rad * 0.18, sx + rad * 0.3, sy - rad * 0.02);
                collarGrad.addColorStop(0, col.light);
                collarGrad.addColorStop(0.5, col.fill);
                collarGrad.addColorStop(1, col.dark);
                oCtx.fillStyle = collarGrad;
                oCtx.fill();
                oCtx.strokeStyle = col.dark;
                oCtx.lineWidth = 1.2;
                oCtx.stroke();

                // 5. Head (sphere)
                oCtx.beginPath();
                oCtx.arc(sx, sy - rad * 0.5, rad * 0.42, 0, Math.PI * 2);
                // Radial gradient for glossy 3D head: highlight at top-left
                const headGrad = oCtx.createRadialGradient(
                    sx - rad * 0.15, sy - rad * 0.65, 0,
                    sx, sy - rad * 0.5, rad * 0.42
                );
                headGrad.addColorStop(0, '#ffffff'); // bright highlight
                headGrad.addColorStop(0.2, col.light);
                headGrad.addColorStop(0.7, col.fill);
                headGrad.addColorStop(1, col.dark);
                oCtx.fillStyle = headGrad;
                oCtx.fill();
                oCtx.strokeStyle = col.dark;
                oCtx.lineWidth = 1.5;
                oCtx.stroke();

                // 6. Highlight Reflection (extra gloss 3D pop)
                oCtx.beginPath();
                oCtx.arc(sx - rad * 0.15, sy - rad * 0.65, rad * 0.08, 0, Math.PI * 2);
                oCtx.fillStyle = 'rgba(255, 255, 255, 0.75)';
                oCtx.fill();

                hitboxes.push({ player: t.player, id: t.id, x: sx, y: sy, r: rad });
            });
        });

        oCtx.restore();

        // 3. Write operation: single atomic transfer from offscreen to onscreen canvas
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(offscreenCanvas, 0, 0);

        return hitboxes;
    }

    // ─── Public API ───────────────────────────────────────

    return {
        TRACK, SAFE, START, HOME, YARD, FINISH, COLORS,
        tokenCoord, absIndex, isSafe, drawBoard
    };
})();

if (typeof window !== 'undefined') window.LudoBoard = LudoBoard;
