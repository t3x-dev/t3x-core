"use strict";
/**
 * Merge Type Definitions
 *
 * Types for three-way merge operations.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConflictType = void 0;
/**
 * Conflict type enumeration
 */
var ConflictType;
(function (ConflictType) {
    /** Both sides edited the same facet with different values */
    ConflictType["DIVERGENT_EDIT"] = "divergent_edit";
    /** Source deleted, target modified */
    ConflictType["DELETE_MODIFY"] = "delete_modify";
    /** Source modified, target deleted */
    ConflictType["MODIFY_DELETE"] = "modify_delete";
})(ConflictType || (exports.ConflictType = ConflictType = {}));
//# sourceMappingURL=types.js.map