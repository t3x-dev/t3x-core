/**
 * ContextFlow Type Definitions
 */
export interface ContextFlowMetadata {
    id?: string;
    created: string;
    modified?: string;
    name?: string;
    description?: string;
    tags?: string[];
    version?: string;
}
export interface Message {
    role: 'system' | 'user' | 'assistant';
    content: string;
    timestamp?: string;
    api_call?: APICallMetadata;
}
export interface APICallMetadata {
    provider: string;
    model: string;
    request_id?: string;
    parameters?: {
        temperature?: number;
        max_tokens?: number;
        top_p?: number;
        frequency_penalty?: number;
        presence_penalty?: number;
        [key: string]: any;
    };
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
    cost?: {
        input_cost: number;
        output_cost: number;
        total_cost: number;
        currency?: string;
    };
    latency_ms?: number;
    finish_reason?: string;
}
export interface Conversation {
    id?: string;
    title?: string;
    created?: string;
    source?: string;
    messages: Message[];
    tags?: string[];
}
export interface Note {
    id?: string;
    title?: string;
    content: string;
    type?: 'text/plain' | 'text/markdown' | 'text/html';
    created?: string;
    modified?: string;
    tags?: string[];
}
export interface Preferences {
    languages?: string[];
    frameworks?: string[];
    style?: string;
    tone?: string;
    [key: string]: any;
}
export interface FileReference {
    id?: string;
    path: string;
    name?: string;
    type: string;
    content?: string;
    description?: string;
    tags?: string[];
}
export interface Prompt {
    id?: string;
    version?: number;
    name?: string;
    description?: string;
    content: string;
    target?: string;
    task?: string;
    created?: string;
    based_on?: string[];
    performance?: {
        used_count?: number;
        avg_rating?: number;
        feedback?: string[];
    };
    parent_version?: number;
    changes?: string;
}
export interface UsageSummary {
    total_conversations?: number;
    total_messages?: number;
    total_cost?: number;
    currency?: string;
    by_provider?: Record<string, {
        conversations?: number;
        total_tokens?: number;
        total_cost?: number;
    }>;
    by_model?: Record<string, {
        calls?: number;
        avg_latency_ms?: number;
        total_cost?: number;
    }>;
}
export interface ContextFlowFile {
    contextflow_version: string;
    $schema?: string;
    metadata: ContextFlowMetadata;
    conversations?: Conversation[];
    notes?: Note[];
    preferences?: Preferences;
    files?: FileReference[];
    prompts?: Prompt[];
    usage_summary?: UsageSummary;
    _tooling?: {
        context_type?: 'source' | 'derived' | 'materialized' | 'snapshot';
        lineage?: any;
        snapshot?: any;
        [key: string]: any;
    };
}
