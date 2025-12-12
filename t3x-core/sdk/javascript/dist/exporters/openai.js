"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenAIExporter = void 0;
const base_1 = require("./base");
class OpenAIExporter extends base_1.BaseExporter {
    constructor() {
        super(...arguments);
        this.name = 'openai';
        this.targetPlatform = 'openai';
    }
    async export(contextflow, config = {}) {
        const systemParts = [];
        // Build system message from preferences and notes
        if (contextflow.preferences) {
            if (contextflow.preferences.languages) {
                systemParts.push(`User prefers: ${contextflow.preferences.languages.join(', ')}`);
            }
            if (contextflow.preferences.style) {
                systemParts.push(`Code style: ${contextflow.preferences.style}`);
            }
            if (contextflow.preferences.tone) {
                systemParts.push(`Communication tone: ${contextflow.preferences.tone}`);
            }
        }
        // Add notes (truncated if necessary)
        if (contextflow.notes && contextflow.notes.length > 0) {
            for (const note of contextflow.notes) {
                const title = note.title || 'Note';
                const content = note.content.substring(0, 500); // Truncate long notes
                systemParts.push(`${title}: ${content}`);
            }
        }
        return {
            model: 'gpt-4-turbo',
            messages: [
                {
                    role: 'system',
                    content: systemParts.join('\n\n'),
                },
                // User adds their message here
            ],
            temperature: 0.7,
            max_tokens: config.maxTokens || 4000,
        };
    }
}
exports.OpenAIExporter = OpenAIExporter;
