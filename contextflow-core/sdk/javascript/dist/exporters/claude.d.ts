import { BaseExporter, ExporterConfig } from './base';
import { ContextFlowFile } from '../types';
export declare class ClaudeExporter extends BaseExporter {
    readonly name = "claude";
    readonly targetPlatform = "anthropic";
    export(contextflow: ContextFlowFile, config?: ExporterConfig): Promise<string>;
}
