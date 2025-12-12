import { BaseExporter, ExporterConfig } from './base';
import { ContextFlowFile } from '../types';
export declare class OpenAIExporter extends BaseExporter {
    readonly name = "openai";
    readonly targetPlatform = "openai";
    export(contextflow: ContextFlowFile, config?: ExporterConfig): Promise<object>;
}
