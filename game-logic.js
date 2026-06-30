/* ═══════════════════════════════════════════════════════════
   game-logic.js — Ludo Game State Machine
   Manages turns, dice rolls, token movement, captures, and AI.
   
   States: idle → waitRoll → rolling → waitMove → moving → (repeat)
   ═══════════════════════════════════════════════════════════ */

const LudoGame = (() => {

    const OFFSETS = { red: 40, green: 1, yellow: 14, blue: 27 };

    // ─── Game State ───────────────────────────────────────
    let playerNames = { red: 'Red', green: 'Green', yellow: 'Yellow', blue: 'Blue' };
    let players = [];       // Active player colors in turn order
    let types = {};         // { red:'human', green:'ai', ... }
    let difficulty = 'medium';
    let turnIdx = 0;        // Index into players array
    let diceVal = 0;        // Current dice value
    let sixCount = 0;       // Consecutive sixes counter
    let grantExtra = false; // Whether current player gets another roll
    let tokens = [];        // [{player, id, pos}] — all 16 tokens
    let state = 'idle';     // idle|waitRoll|rolling|waitMove|moving|over
    let validMoves = [];    // [{player, id}] current valid moves
    let canvas = null;
    let hitboxes = [];      // [{player, id, x, y, r}] from last render
    let animFrame = null;   // Animation loop handle
    let aiTimer = null;     // AI delay timer
    let yardRollsCount = { red: 0, green: 0, yellow: 0, blue: 0 };

    // ─── Helpers ──────────────────────────────────────────

    function curPlayer() { return players[turnIdx]; }

    function initTokens(activePlayers) {
        tokens = [];
        activePlayers.forEach(p => {
            for (let i = 0; i < 4; i++) {
                tokens.push({ player: p, id: i, pos: -1 });
            }
        });
    }

    function getValidMoves(player, roll) {
        return tokens
            .filter(t => t.player === player && t.pos !== 56)
            .filter(t => {
                if (t.pos === -1) return roll === 6; // Need 6 to unlock
                const dest = t.pos + roll;
                return dest <= 56; // Cannot overshoot home
            })
            .map(t => ({ player: t.player, id: t.id }));
    }

    // ─── Turn Management ──────────────────────────────────

    function nextTurn() {
        if (state === 'idle' || state === 'over') return;

        // Extra turn (from rolling 6 or capturing)
        if (grantExtra && sixCount < 3) {
            grantExtra = false;
            diceVal = 0;
            state = 'waitRoll';
            validMoves = [];
            render();
            scheduleAI();
            return;
        }

        // Move to next player
        sixCount = 0;
        grantExtra = false;
        diceVal = 0;
        validMoves = [];
        turnIdx = (turnIdx + 1) % players.length;
        state = 'waitRoll';
        render();
        scheduleAI();
    }

    function scheduleAI() {
        if (state === 'over') return;
        const p = curPlayer();
        if (types[p] !== 'ai') return;

        LudoDice.setClickable(false);

        if (state === 'waitRoll') {
            clearTimeout(aiTimer);
            aiTimer = setTimeout(() => {
                if (state === 'waitRoll' && types[curPlayer()] === 'ai') doRoll();
            }, 600 + Math.random() * 400);
        } else if (state === 'waitMove') {
            clearTimeout(aiTimer);
            aiTimer = setTimeout(() => {
                if (state !== 'waitMove') return;
                const choice = LudoAI.chooseMove(p, validMoves, diceVal, tokens, difficulty);
                if (choice) doMove(choice.id);
                else nextTurn();
            }, 500 + Math.random() * 500);
        }
    }

    // ─── Dice Roll ────────────────────────────────────────

    function doRoll() {
        if (state !== 'waitRoll') return;
        state = 'rolling';
        LudoDice.setClickable(false);

        const p = curPlayer();
        const activeOnBoard = tokens.filter(t => t.player === p && t.pos >= 0 && t.pos < 56).length;

        let value;
        // Pity rule: If a player has all active tokens in the yard and rolls 3 times without a 6,
        // guarantee a 6 on the 4th roll so they aren't stuck forever.
        if (activeOnBoard === 0 && yardRollsCount[p] >= 3) {
            value = 6;
            yardRollsCount[p] = 0;
        } else {
            value = Math.floor(Math.random() * 6) + 1;
            if (activeOnBoard === 0) {
                if (value === 6) {
                    yardRollsCount[p] = 0;
                } else {
                    yardRollsCount[p]++;
                }
            } else {
                yardRollsCount[p] = 0;
            }
        }
        diceVal = value;

        LudoDice.animateRoll(value, () => {
            if (state !== 'rolling') return;

            // Track consecutive sixes
            if (value === 6) {
                sixCount++;
                grantExtra = true;
            } else {
                sixCount = 0;
            }

            // Three sixes = forfeit turn
            if (sixCount >= 3) {
                showNotice('Three 6s! Turn forfeited 🚫');
                if (window.LudoSounds) LudoSounds.playError();
                grantExtra = false;
                setTimeout(nextTurn, 1200);
                return;
            }

            // Find valid moves
            validMoves = getValidMoves(curPlayer(), value);

            if (validMoves.length === 0) {
                showNotice('No valid moves ⊘');
                grantExtra = false;
                setTimeout(nextTurn, 900);
                return;
            }

            // If only one valid move, auto-select it
            if (validMoves.length === 1) {
                state = 'waitMove';
                render();
                setTimeout(() => {
                    if (state === 'waitMove') doMove(validMoves[0].id);
                }, types[curPlayer()] === 'ai' ? 300 : 400);
                return;
            }

            state = 'waitMove';
            render();
            scheduleAI();
        });
    }

    // ─── Token Movement ───────────────────────────────────

    function doMove(tokenId) {
        if (state !== 'waitMove') return;
        state = 'moving';
        validMoves = [];
        render();

        const tok = tokens.find(t => t.player === curPlayer() && t.id === tokenId);
        if (!tok) { nextTurn(); return; }

        const destPos = tok.pos === -1 ? 0 : tok.pos + diceVal;

        // Hop animation: move one cell at a time
        function hop() {
            if (state !== 'moving') return;
            if (tok.pos === -1) {
                tok.pos = 0;
            } else {
                tok.pos++;
            }

            render();
            if (window.LudoSounds) LudoSounds.playTokenMove();

            if (tok.pos < destPos) {
                setTimeout(hop, 140);
            } else {
                onLand(tok);
            }
        }
        hop();
    }

    function onLand(tok) {
        let captured = false;

        // ── Capture check (only on common track, non-safe cells) ──
        if (tok.pos >= 0 && tok.pos <= 50) {
            const myAbs = (OFFSETS[tok.player] + tok.pos) % 52;

            if (!LudoBoard.isSafe(myAbs)) {
                tokens.forEach(opp => {
                    if (opp.player === tok.player) return;
                    if (opp.pos < 0 || opp.pos > 50) return;
                    const oppAbs = (OFFSETS[opp.player] + opp.pos) % 52;
                    if (oppAbs === myAbs) {
                        opp.pos = -1; // Send back to base
                        captured = true;
                    }
                });
            }
        }

        if (captured) {
            showNotice('Captured! 💥');
            if (window.LudoSounds) LudoSounds.playCapture();
            grantExtra = true; // Extra turn for capturing
        }

        // ── Home entry ──
        if (tok.pos === 56) {
            showNotice('Token home! 🏠');
            if (window.LudoSounds) LudoSounds.playTokenHome();
            grantExtra = true; // Extra turn for reaching home
        }

        // ── Win check ──
        const allHome = tokens
            .filter(t => t.player === tok.player)
            .every(t => t.pos === 56);

        if (allHome) {
            state = 'over';
            render();
            if (window.LudoSounds) LudoSounds.playVictory();
            if (window.LudoUI) LudoUI.showWin(tok.player);
            return;
        }

        render();
        setTimeout(nextTurn, 250);
    }

    // ─── Rendering ────────────────────────────────────────

    function render() {
        if (!canvas) return;

        const highlighted = (state === 'waitMove') ? validMoves : [];
        hitboxes = LudoBoard.drawBoard(canvas, tokens, highlighted);

        updateTurnBanner();

        // Enable dice click for human waiting to roll
        const p = curPlayer();
        if (types[p] === 'human' && state === 'waitRoll') {
            LudoDice.setClickable(true);
        } else {
            LudoDice.setClickable(false);
        }
    }

    function updateTurnBanner() {
        const dot = document.getElementById('turn-dot');
        const txt = document.getElementById('turn-text');
        if (!dot || !txt) return;

        const p = curPlayer();
        const customName = playerNames[p] || (p.charAt(0).toUpperCase() + p.slice(1));

        const diceContainer = document.querySelector('.dice-container');
        if (diceContainer) {
            diceContainer.className = 'dice-container ' + p;
        }

        if (state === 'over') {
            txt.textContent = 'Game Over!';
            txt.style.color = '#f1c40f';
        } else {
            txt.textContent = `${customName}'s Turn`;
            txt.style.color = '#fff';
        }

        dot.style.background = LudoBoard.COLORS[p].fill;
        dot.style.boxShadow = `0 0 10px ${LudoBoard.COLORS[p].light}`;
    }

    function showNotice(msg) {
        const el = document.getElementById('turn-text');
        if (!el) return;
        const prev = el.textContent;
        el.textContent = msg;
        el.style.color = '#f39c12';
        setTimeout(() => {
            if (el.textContent === msg) {
                el.textContent = prev;
                el.style.color = '#fff';
            }
        }, 1100);
    }

    // ─── Animation Loop (pulsing glow) ───────────────────

    function animLoop() {
        if (state === 'waitMove' && canvas) {
            const highlighted = validMoves;
            hitboxes = LudoBoard.drawBoard(canvas, tokens, highlighted);
        }
        animFrame = requestAnimationFrame(animLoop);
    }

    // ─── Canvas Click Handling ────────────────────────────

    function handleCanvasInput(clientX, clientY) {
        if (state !== 'waitMove') return;
        const p = curPlayer();
        if (types[p] !== 'human') return;

        const rect = canvas.getBoundingClientRect();
        const mx = clientX - rect.left;
        const my = clientY - rect.top;

        // Check hitboxes in reverse order (top-most token first)
        for (let i = hitboxes.length - 1; i >= 0; i--) {
            const h = hitboxes[i];
            if (h.player !== p) continue;

            const dx = mx - h.x, dy = my - h.y;
            const hitRadius = Math.max(h.r, rect.width / 15 * 0.5);
            if (dx * dx + dy * dy <= hitRadius * hitRadius) {
                if (validMoves.some(m => m.id === h.id)) {
                    doMove(h.id);
                    return;
                }
            }
        }
    }

    // ─── Public API ───────────────────────────────────────

    return {
        /**
         * Start a new Ludo game.
         * @param {string} mode - 'ai' or 'local'
         * @param {string} diff - 'easy'|'medium'|'hard'
         * @param {number} count - Number of players (2–4)
         * @param {object} names - Optional player name mappings
         */
        start(mode, diff, count, names) {
            // Clean up previous game
            clearTimeout(aiTimer);
            if (animFrame) cancelAnimationFrame(animFrame);

            canvas = document.getElementById('ludo-board');

            playerNames = names || { red: 'Red', green: 'Green', yellow: 'Yellow', blue: 'Blue' };

            difficulty = diff || 'medium';

            count = parseInt(count) || 4;
            if (count === 2) players = ['red', 'yellow'];
            else if (count === 3) players = ['red', 'green', 'yellow'];
            else players = ['red', 'green', 'yellow', 'blue'];

            initTokens(players);

            types = {};
            players.forEach(p => {
                types[p] = (mode === 'ai' && p !== 'red') ? 'ai' : 'human';
            });

            turnIdx = 0;
            diceVal = 0;
            sixCount = 0;
            grantExtra = false;
            yardRollsCount = { red: 0, green: 0, yellow: 0, blue: 0 };
            state = 'waitRoll';
            validMoves = [];

            // Chunk 2: Resize canvas on next event loop tick
            setTimeout(() => {
                if (canvas) {
                    const rect = canvas.getBoundingClientRect();
                    const size = Math.round(Math.min(rect.width, rect.height));
                    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
                    canvas.width = size * dpr;
                    canvas.height = size * dpr;
                }

                if (window.LudoDice) LudoDice.setValue(6);

                // Chunk 3: Render and run AI / animation loops on next tick
                setTimeout(() => {
                    render();
                    scheduleAI();
                    animLoop();
                }, 0);
            }, 0);
        },

        /** Stop the active game, cancel all timers and animation frames */
        stop() {
            clearTimeout(aiTimer);
            if (animFrame) cancelAnimationFrame(animFrame);
            state = 'idle';
            tokens = [];
            validMoves = [];
            if (window.LudoDice) window.LudoDice.setClickable(false);
        },

        /** Human player rolls the dice */
        humanRoll() {
            if (state !== 'waitRoll') return;
            if (types[curPlayer()] !== 'human') return;
            doRoll();
        },

        /** Forward canvas click coordinates */
        canvasClick(cx, cy) {
            handleCanvasInput(cx, cy);
        },

        /** Resize canvas and redraw */
        resize() {
            if (!canvas || state === 'idle') return;
            const rect = canvas.getBoundingClientRect();
            const size = Math.round(Math.min(rect.width, rect.height));
            const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
            canvas.width = size * dpr;
            canvas.height = size * dpr;
            render();
        },

        getState() { return state; },
        getTokens() { return tokens; },
        getCurrentPlayer() { return curPlayer(); },
        getPlayerNames() { return playerNames; }
    };
})();

if (typeof window !== 'undefined') window.LudoGame = LudoGame;
