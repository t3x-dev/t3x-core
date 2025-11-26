"use strict";
/**
 * ContextFlow SDK - Official JavaScript/TypeScript SDK for the ContextFlow specification.
 */
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
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.save = exports.load = exports.ContextFlow = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const importers_1 = require("./importers");
const exporters_1 = require("./exporters");
__exportStar(require("./types"), exports);
__exportStar(require("./importers"), exports);
__exportStar(require("./exporters"), exports);
/**
 * Main ContextFlow class for reading, writing, and transforming ContextFlow files.
 */
class ContextFlow {
    constructor() {
        this.importers = new importers_1.ImporterRegistry();
        this.exporters = new exporters_1.ExporterRegistry();
    }
    /**
     * Load a ContextFlow file from disk.
     */
    static async load(filePath) {
        const content = await fs.promises.readFile(filePath, 'utf8');
        return JSON.parse(content);
    }
    /**
     * Save a ContextFlow file to disk.
     */
    static async save(filePath, contextflow) {
        const dir = path.dirname(filePath);
        await fs.promises.mkdir(dir, { recursive: true });
        await fs.promises.writeFile(filePath, JSON.stringify(contextflow, null, 2), 'utf8');
    }
    /**
     * Import from external format.
     */
    async import(input, options) {
        let importer;
        const importerName = options?.importerName;
        if (importerName) {
            importer = this.importers.get(importerName);
            if (!importer) {
                throw new Error(`Importer not found: ${importerName}`);
            }
        }
        else {
            // Auto-detect
            const data = typeof input === 'string' ? JSON.parse(input) : JSON.parse(input.toString());
            importer = this.importers.detect(data);
            if (!importer) {
                throw new Error('Could not detect importer for input format');
            }
        }
        return await importer.import(input, options?.config);
    }
    /**
     * Export to external format.
     */
    async export(contextflow, exporterName, config) {
        const exporter = this.exporters.get(exporterName);
        if (!exporter) {
            throw new Error(`Exporter not found: ${exporterName}`);
        }
        return await exporter.export(contextflow, config);
    }
    /**
     * List available importers.
     */
    listImporters() {
        return this.importers.list();
    }
    /**
     * List available exporters.
     */
    listExporters() {
        return this.exporters.list();
    }
    /**
     * Get importer registry (for registering custom importers).
     */
    getImporterRegistry() {
        return this.importers;
    }
    /**
     * Get exporter registry (for registering custom exporters).
     */
    getExporterRegistry() {
        return this.exporters;
    }
}
exports.ContextFlow = ContextFlow;
// Convenience exports
exports.load = ContextFlow.load;
exports.save = ContextFlow.save;
