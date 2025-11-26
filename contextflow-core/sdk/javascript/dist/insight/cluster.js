"use strict";
/**
 * Cosine-based greedy clustering. Deterministically assigns items to the first cluster
 * whose normalized centroid passes the similarity threshold; otherwise starts a new cluster.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.greedyCluster = greedyCluster;
function greedyCluster(items, threshold = 0.8) {
    const clusters = [];
    let nextClusterId = 0;
    for (const item of items) {
        const vector = normalize(item.vector);
        if (vector.length === 0) {
            clusters.push({ id: nextClusterId, centroid: vector, memberIds: [item.id] });
            nextClusterId += 1;
            continue;
        }
        let best = null;
        let bestScore = -Infinity;
        for (const cluster of clusters) {
            if (cluster.centroid.length === 0)
                continue;
            const similarity = dotProduct(vector, cluster.centroid);
            if (similarity > bestScore) {
                bestScore = similarity;
                best = cluster;
            }
        }
        if (best && bestScore >= threshold) {
            best.memberIds.push(item.id);
            best.centroid = recomputeCentroid(best.centroid, vector, best.memberIds.length);
        }
        else {
            clusters.push({ id: nextClusterId, centroid: vector, memberIds: [item.id] });
            nextClusterId += 1;
        }
    }
    return clusters.map(cluster => ({
        clusterId: cluster.id,
        memberIds: cluster.memberIds.slice(),
    }));
}
function normalize(vector) {
    const norm = Math.sqrt(vector.reduce((acc, value) => acc + value * value, 0));
    if (!Number.isFinite(norm) || norm === 0)
        return [];
    return vector.map(value => value / norm);
}
function dotProduct(a, b) {
    const length = Math.min(a.length, b.length);
    let total = 0;
    for (let i = 0; i < length; i++) {
        total += a[i] * b[i];
    }
    return total;
}
function recomputeCentroid(current, incoming, size) {
    if (current.length === 0)
        return incoming.slice();
    const weightExisting = (size - 1) / size;
    const weightIncoming = 1 / size;
    const length = Math.min(current.length, incoming.length);
    const blended = [];
    for (let i = 0; i < length; i++) {
        blended.push(current[i] * weightExisting + incoming[i] * weightIncoming);
    }
    return normalize(blended);
}
