import { BaseImporter, ImporterConfig } from './base';
import { ContextFlowFile } from '../types';
export declare class ChatGPTImporter extends BaseImporter {
    readonly name = "chatgpt";
    readonly supportedFormats: string[];
    canImport(input: any): boolean;
    import(input: string | Buffer, config?: ImporterConfig): Promise<ContextFlowFile>;
    private extractMessages;
}
