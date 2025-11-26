"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseExporter = void 0;
class BaseExporter {
    /**
     * Get exporter metadata
     */
    getMetadata() {
        return {
            name: this.name,
            targetPlatform: this.targetPlatform,
        };
    }
}
exports.BaseExporter = BaseExporter;
