"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExporterRegistry = void 0;
const claude_1 = require("./claude");
const openai_1 = require("./openai");
__exportStar(require("./base"), exports);
__exportStar(require("./claude"), exports);
__exportStar(require("./openai"), exports);
/**
 * Registry for managing exporters
 */
class ExporterRegistry {
    constructor() {
        this.exporters = new Map();
        // Register built-in exporters
        this.register(new claude_1.ClaudeExporter());
        this.register(new openai_1.OpenAIExporter());
    }
    /**
     * Register a new exporter
     */
    register(exporter) {
        this.exporters.set(exporter.name, exporter);
    }
    /**
     * Get exporter by name
     */
    get(name) {
        return this.exporters.get(name);
    }
    /**
     * List all registered exporters
     */
    list() {
        return Array.from(this.exporters.keys());
    }
    /**
     * Get all exporters
     */
    getAll() {
        return Array.from(this.exporters.values());
    }
}
exports.ExporterRegistry = ExporterRegistry;
