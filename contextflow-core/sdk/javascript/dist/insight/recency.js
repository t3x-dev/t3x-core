"use strict";
/**
 * Recency utilities.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.scoreRecency = scoreRecency;
function scoreRecency(turnTimestamp, referenceTimestamp = new Date(), halfLifeHours = 48) {
    const elapsedMs = referenceTimestamp.getTime() - turnTimestamp.getTime();
    if (elapsedMs <= 0) {
        return 1;
    }
    const halfLifeMs = halfLifeHours * 60 * 60 * 1000;
    const decay = Math.pow(0.5, elapsedMs / halfLifeMs);
    return Math.max(0, Math.min(1, decay));
}
