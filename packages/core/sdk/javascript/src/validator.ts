/**
 * T3X Schema Validator
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

export class T3XValidator {
  private ajv: Ajv;
  private validate: any;

  constructor() {
    this.ajv = new Ajv({ allErrors: true, strict: false });
    registerDefaultFormats(this.ajv);
    this.validate = this.ajv.compile(loadDefaultSchema());
  }

  validateT3X(data: any): ValidationResult {
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
    return this.validateT3X(data);
  }
}

export function validate(data: any): ValidationResult {
  const validator = new T3XValidator();
  return validator.validateT3X(data);
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
    'T3X schema not found. Ensure schema/v1.0.json is bundled or provide your own.'
  );
}
