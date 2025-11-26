"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const cluster_1 = require("../../insight/cluster");
describe("greedyCluster", () => {
    it("clusters vectors above threshold into same group", () => {
        const items = [
            { id: "a", vector: [1, 0, 0] },
            { id: "b", vector: [0.99, 0.01, 0] },
            { id: "c", vector: [0, 1, 0] },
        ];
        const clusters = (0, cluster_1.greedyCluster)(items, 0.95);
        const clusterMembers = clusters.map(cluster => cluster.memberIds.sort());
        expect(clusterMembers).toContainEqual(["a", "b"]);
        expect(clusterMembers).toContainEqual(["c"]);
    });
    it("creates singleton clusters for zero vectors", () => {
        const items = [
            { id: "empty", vector: [] },
            { id: "non-empty", vector: [0, 1, 0] },
        ];
        const clusters = (0, cluster_1.greedyCluster)(items, 0.8);
        const memberSets = clusters.map(cluster => cluster.memberIds);
        expect(memberSets).toContainEqual(["empty"]);
        expect(memberSets).toContainEqual(["non-empty"]);
    });
});
