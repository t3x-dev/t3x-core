"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClaudeExporter = void 0;
const base_1 = require("./base");
class ClaudeExporter extends base_1.BaseExporter {
    constructor() {
        super(...arguments);
        this.name = 'claude';
        this.targetPlatform = 'anthropic';
    }
    async export(contextflow, config = {}) {
        const parts = [];
        // Add preferences
        if (contextflow.preferences) {
            parts.push('# User Preferences');
            if (contextflow.preferences.languages) {
                parts.push(`Languages: ${contextflow.preferences.languages.join(', ')}`);
            }
            if (contextflow.preferences.frameworks) {
                parts.push(`Frameworks: ${contextflow.preferences.frameworks.join(', ')}`);
            }
            if (contextflow.preferences.style) {
                parts.push(`Style: ${contextflow.preferences.style}`);
            }
            if (contextflow.preferences.tone) {
                parts.push(`Tone: ${contextflow.preferences.tone}`);
            }
            parts.push('');
        }
        // Add notes
        if (contextflow.notes && contextflow.notes.length > 0) {
            for (const note of contextflow.notes) {
                parts.push(`## ${note.title || 'Note'}`);
                parts.push(note.content);
                parts.push('');
            }
        }
        // Optionally add recent conversation context
        if (contextflow.conversations && contextflow.conversations.length > 0) {
            const recentConvos = contextflow.conversations.slice(-3); // Last 3
            parts.push('# Recent Context');
            for (const conv of recentConvos) {
                parts.push(`- ${conv.title || 'Untitled Conversation'}`);
            }
            parts.push('');
        }
        return parts.join('\n');
    }
}
exports.ClaudeExporter = ClaudeExporter;
