"use strict";
/**
 * Hash utilities
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashText = hashText;
exports.sha256 = sha256;
const node_crypto_1 = __importDefault(require("node:crypto"));
const json_canonicalize_1 = require("json-canonicalize");
const canon_1 = require("./canon");
function hashText(input) {
    return sha256((0, canon_1.canonText)(input));
}
function sha256(payload) {
    const serialized = isBuffer(payload)
        ? payload
        : typeof payload === 'string'
            ? payload
            : (0, json_canonicalize_1.canonicalize)(payload);
    return node_crypto_1.default.createHash('sha256').update(serialized).digest('hex');
}
function isBuffer(value) {
    return typeof Buffer !== 'undefined' && Buffer.isBuffer(value);
}
//# sourceMappingURL=hash.js.map