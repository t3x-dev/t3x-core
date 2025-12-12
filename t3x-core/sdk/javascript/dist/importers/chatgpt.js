"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatGPTImporter = void 0;
const base_1 = require("./base");
const uuid_1 = require("uuid");
class ChatGPTImporter extends base_1.BaseImporter {
    constructor() {
        super(...arguments);
        this.name = 'chatgpt';
        this.supportedFormats = ['application/json'];
    }
    canImport(input) {
        if (Array.isArray(input)) {
            return input.some((item) => item.mapping && item.title !== undefined && item.create_time);
        }
        return false;
    }
    async import(input, config = {}) {
        const data = typeof input === 'string' ? JSON.parse(input) : JSON.parse(input.toString());
        if (!this.canImport(data)) {
            throw new Error('Invalid ChatGPT export format');
        }
        const conversations = [];
        for (const conv of data) {
            const messages = this.extractMessages(conv.mapping);
            if (messages.length > 0) {
                conversations.push({
                    id: (0, uuid_1.v4)(),
                    title: conv.title || 'Untitled',
                    created: new Date(conv.create_time * 1000).toISOString(),
                    source: 'chatgpt',
                    messages,
                    tags: [...(config.tags || []), 'chatgpt', 'imported'],
                });
            }
        }
        return {
            contextflow_version: '1.0',
            $schema: 'https://contextflow.dev/schema/v1.0.json',
            metadata: {
                id: (0, uuid_1.v4)(),
                created: new Date().toISOString(),
                modified: new Date().toISOString(),
                name: 'ChatGPT Import',
                description: `Imported ${conversations.length} conversations from ChatGPT`,
                tags: ['chatgpt', 'imported'],
            },
            conversations,
        };
    }
    extractMessages(mapping) {
        const messages = [];
        for (const [msgId, msgObj] of Object.entries(mapping)) {
            if (msgObj.message) {
                const msg = msgObj.message;
                const role = msg.author?.role;
                if (['user', 'assistant'].includes(role)) {
                    const content = (msg.content?.parts || []).join('');
                    if (content.trim()) {
                        messages.push({
                            role: role,
                            content,
                            timestamp: new Date(msg.create_time * 1000).toISOString(),
                        });
                    }
                }
            }
        }
        return messages.sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''));
    }
}
exports.ChatGPTImporter = ChatGPTImporter;
