"use strict";
/**
 * Role weight lookup.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultRoleWeights = void 0;
exports.getRoleWeight = getRoleWeight;
exports.defaultRoleWeights = {
    user: 1,
    tool: 0.9,
    assistant: 0.6,
    system: 0.5,
};
function getRoleWeight(role) {
    if (!role)
        return 1;
    return exports.defaultRoleWeights[role.toLowerCase()] ?? 1;
}
