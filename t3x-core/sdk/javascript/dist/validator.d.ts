/**
 * ContextFlow Schema Validator
 */
export interface ValidationResult {
    valid: boolean;
    errors?: Array<{
        path: string;
        message: string;
    }>;
}
export declare class ContextFlowValidator {
    private ajv;
    private validate;
    constructor();
    validateContextFlow(data: any): ValidationResult;
    validateFile(filePath: string): ValidationResult;
}
export declare function validate(data: any): ValidationResult;
