/**
 * ContextFlow Schema Validator
 */

import * as fs from 'fs';
import * as path from 'path';
import Ajv from 'ajv';
import { registerDefaultFormats } from './utils/registerFormats';

export interface ValidationResult {
  valid: boolean;
  errors?: Array<{
    path: string;
    message: string;
  }>;
}

export class ContextFlowValidator {
  private ajv: Ajv;
  private validate: any;

  constructor() {
    this.ajv = new Ajv({ allErrors: true, strict: false });
    registerDefaultFormats(this.ajv);
    this.validate = this.ajv.compile(loadDefaultSchema());
  }

  validateContextFlow(data: any): ValidationResult {
    const valid = this.validate(data);

    if (valid) {
      return { valid: true };
    }

    const errors = (this.validate.errors || []).map((err: any) => ({
      path: err.instancePath || '/',
      message: err.message || 'Validation error',
    }));

    return {
      valid: false,
      errors,
    };
  }

  validateFile(filePath: string): ValidationResult {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return this.validateContextFlow(data);
  }
}

export function validate(data: any): ValidationResult {
  const validator = new ContextFlowValidator();
  return validator.validateContextFlow(data);
}

function loadDefaultSchema(): any {
  const candidates = [
    path.resolve(__dirname, 'schema/v1.0.json'),
    path.resolve(__dirname, '../../../schema/v1.0.json'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return JSON.parse(fs.readFileSync(candidate, 'utf8'));
    }
  }

  throw new Error(
    'ContextFlow schema not found. Ensure schema/v1.0.json is bundled or provide your own.'
  );
}
