/* ═══════════════════════════════════════════════════════════
   ai.js — Ludo AI Decision Engine
   Supports Easy (random), Medium (balanced), Hard (strategic).
   ═══════════════════════════════════════════════════════════ */

const LudoAI = (() => {

    const OFFSETS = { red: 40, green: 1, yellow: 14, blue: 27 };

    /** Get absolute track index for a player's relative position */
    function absIdx(player, pos) {
        if (pos < 0 || pos > 50) return -1;
        return (OFFSETS[player] + pos) % 52;
    }

    /** Check if landing on destPos would capture an opponent */
    function wouldCapture(player, destPos, allTokens) {
        if (destPos < 0 || destPos > 50) return false;
        const myAbs = absIdx(player, destPos);
        if (LudoBoard.isSafe(myAbs)) return false;

        return allTokens.some(t =>
            t.player !== player &&
            t.pos >= 0 && t.pos <= 50 &&
            absIdx(t.player, t.pos) === myAbs
        );
    }

    /** Check if a token at the given position is in danger of being captured */
    function isInDanger(player, pos, allTokens) {
        if (pos < 0 || pos > 50) return false;
        const myAbs = absIdx(player, pos);
        if (LudoBoard.isSafe(myAbs)) return false;

        for (const t of allTokens) {
            if (t.player === player || t.pos < 0 || t.pos > 50) continue;
            // Can this opponent reach our cell with a roll of 1–6?
            for (let d = 1; d <= 6; d++) {
                const oppDest = t.pos + d;
                if (oppDest > 50) continue;
                if (absIdx(t.player, oppDest) === myAbs) return true;
            }
        }
        return false;
    }

    /** Would landing here put the token on a safe cell? */
    function landsSafe(player, destPos) {
        if (destPos < 0 || destPos > 50) return false;
        return LudoBoard.isSafe(absIdx(player, destPos));
    }

    /** How far along is this token? Higher = closer to home */
    function progress(tok) { return tok.pos; }

    /**
     * Choose the best move for an AI player.
     * @param {string} player - Color
     * @param {Array} validMoves - [{player, id}]
     * @param {number} dice - Current dice value
     * @param {Array} allTokens - All 16 tokens
     * @param {string} difficulty - 'easy'|'medium'|'hard'
     * @returns {{player, id}|null}
     */
    function chooseMove(player, validMoves, dice, allTokens, difficulty) {
        if (!validMoves || validMoves.length === 0) return null;
        if (validMoves.length === 1) return validMoves[0];

        // Easy: random choice
        if (difficulty === 'easy') {
            return validMoves[Math.floor(Math.random() * validMoves.length)];
        }

        // Helper to evaluate a move
        function getMoveDetails(m) {
            const tok = allTokens.find(t => t.player === m.player && t.id === m.id);
            if (!tok) return null;
            const destPos = tok.pos === -1 ? 0 : tok.pos + dice;
            return { move: m, tok, destPos };
        }

        // Logic for Hard AI decision
        function getHardChoice() {
            const moveDetails = validMoves.map(getMoveDetails).filter(Boolean);

            // 1. Capture priority: Always capture an opponent's token if available
            const captureMoves = moveDetails.filter(d => wouldCapture(player, d.destPos, allTokens));
            if (captureMoves.length > 0) {
                captureMoves.sort((a, b) => b.tok.pos - a.tok.pos);
                return captureMoves[0].move;
            }

            // 2. Home column / Finish priority: Always move a token into the home stretch/finish
            const homeMoves = moveDetails.filter(d => d.tok.pos <= 50 && d.destPos >= 51);
            if (homeMoves.length > 0) {
                homeMoves.sort((a, b) => b.tok.pos - a.tok.pos);
                return homeMoves[0].move;
            }

            // 3. Unlock priority: Prefer moving a token out of the yard when a 6 is rolled
            if (dice === 6) {
                const unlockMoves = moveDetails.filter(d => d.tok.pos === -1);
                if (unlockMoves.length > 0) {
                    return unlockMoves[0].move;
                }
            }

            // 4. Danger avoidance: Avoid moving a token onto a square where it would be immediately capturable, if a safer move exists
            const safeMoves = moveDetails.filter(d => {
                if (d.destPos >= 51) return true; // Home stretch and finish are safe
                return !isInDanger(player, d.destPos, allTokens);
            });

            // Use safe moves if any exist; otherwise fallback to all moves
            const choices = safeMoves.length > 0 ? safeMoves : moveDetails;

            // 5. Progress priority: Move the token that is furthest along its path
            choices.sort((a, b) => b.tok.pos - a.tok.pos);
            return choices[0].move;
        }

        // Medium: 70% smart (Hard decision), 30% random
        if (difficulty === 'medium') {
            if (Math.random() < 0.7) {
                return getHardChoice();
            } else {
                return validMoves[Math.floor(Math.random() * validMoves.length)];
            }
        }

        // Hard AI: 100% smart decision
        return getHardChoice();
    }

    return { chooseMove };
})();

if (typeof window !== 'undefined') window.LudoAI = LudoAI;
