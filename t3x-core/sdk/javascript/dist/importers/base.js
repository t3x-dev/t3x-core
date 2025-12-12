"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseImporter = void 0;
class BaseImporter {
    /**
     * Get importer metadata
     */
    getMetadata() {
        return {
            name: this.name,
            supportedFormats: this.supportedFormats,
        };
    }
}
exports.BaseImporter = BaseImporter;
