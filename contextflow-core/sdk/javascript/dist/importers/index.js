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
exports.ImporterRegistry = void 0;
const chatgpt_1 = require("./chatgpt");
__exportStar(require("./base"), exports);
__exportStar(require("./chatgpt"), exports);
/**
 * Registry for managing importers with auto-detection
 */
class ImporterRegistry {
    constructor() {
        this.importers = new Map();
        // Register built-in importers
        this.register(new chatgpt_1.ChatGPTImporter());
    }
    /**
     * Register a new importer
     */
    register(importer) {
        this.importers.set(importer.name, importer);
    }
    /**
     * Get importer by name
     */
    get(name) {
        return this.importers.get(name);
    }
    /**
     * Auto-detect importer based on input data
     */
    detect(input) {
        for (const importer of this.importers.values()) {
            if (importer.canImport(input)) {
                return importer;
            }
        }
        return null;
    }
    /**
     * List all registered importers
     */
    list() {
        return Array.from(this.importers.keys());
    }
    /**
     * Get all importers
     */
    getAll() {
        return Array.from(this.importers.values());
    }
}
exports.ImporterRegistry = ImporterRegistry;
