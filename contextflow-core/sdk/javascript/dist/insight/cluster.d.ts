/**
 * Cosine-based greedy clustering. Deterministically assigns items to the first cluster
 * whose normalized centroid passes the similarity threshold; otherwise starts a new cluster.
 */
export interface ClusterInput {
    id: string;
    vector: number[];
}
export interface ClusterResult {
    clusterId: number;
    memberIds: string[];
}
export declare function greedyCluster(items: ClusterInput[], threshold?: number): ClusterResult[];
