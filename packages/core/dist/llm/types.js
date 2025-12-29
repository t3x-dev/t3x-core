"use strict";
/**
 * LLM Provider Types
 *
 * Interfaces for LLM providers used in draft generation and conflict resolution.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.LLMProviderError = void 0;
/**
 * LLM Provider error
 */
class LLMProviderError extends Error {
    constructor(providerId, statusCode, message) {
        super(`[${providerId}] ${message}`);
        this.providerId = providerId;
        this.statusCode = statusCode;
        this.name = 'LLMProviderError';
    }
}
exports.LLMProviderError = LLMProviderError;
//# sourceMappingURL=types.js.map