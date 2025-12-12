"use strict";
/**
 * ContextFlow Schema Validator
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContextFlowValidator = void 0;
exports.validate = validate;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const ajv_1 = __importDefault(require("ajv"));
const registerFormats_1 = require("./utils/registerFormats");
class ContextFlowValidator {
    constructor() {
        this.ajv = new ajv_1.default({ allErrors: true, strict: false });
        (0, registerFormats_1.registerDefaultFormats)(this.ajv);
        this.validate = this.ajv.compile(loadDefaultSchema());
    }
    validateContextFlow(data) {
        const valid = this.validate(data);
        if (valid) {
            return { valid: true };
        }
        const errors = (this.validate.errors || []).map((err) => ({
            path: err.instancePath || '/',
            message: err.message || 'Validation error',
        }));
        return {
            valid: false,
            errors,
        };
    }
    validateFile(filePath) {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        return this.validateContextFlow(data);
    }
}
exports.ContextFlowValidator = ContextFlowValidator;
function validate(data) {
    const validator = new ContextFlowValidator();
    return validator.validateContextFlow(data);
}
function loadDefaultSchema() {
    const candidates = [
        path.resolve(__dirname, 'schema/v1.0.json'),
        path.resolve(__dirname, '../../../schema/v1.0.json'),
    ];
    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            return JSON.parse(fs.readFileSync(candidate, 'utf8'));
        }
    }
    throw new Error('ContextFlow schema not found. Ensure schema/v1.0.json is bundled or provide your own.');
}
