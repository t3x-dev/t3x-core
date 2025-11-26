"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const engine_1 = require("../insight/engine");
async function main() {
    const [, , ...cliArgs] = process.argv;
    const options = parseArgs(cliArgs);
    const turns = [
        {
            id: "turn-001",
            role: "user",
            text: "我想去大阪吃夜市美食，预算不超过1800美元，时间是3月12号到3月16号。",
            timestamp: "2025-03-10T12:00:00Z",
        },
        {
            id: "turn-002",
            role: "user",
            text: "避免太远的酒店，最好靠近地铁。",
            timestamp: "2025-03-10T12:05:00Z",
        },
        {
            id: "turn-003",
            role: "assistant",
            text: "了解啦！可以看一下 https://travel.example/osaka-night-market 获取灵感。",
            timestamp: "2025-03-10T12:06:00Z",
        },
    ];
    const aspects = await (0, engine_1.runAspectsEngine)(turns, {
        referenceTimestamp: "2025-03-20T00:00:00Z",
        embeddingModelName: options.embeddingModel,
    });
    console.log(`Embedding model: ${options.embeddingModel}`);
    console.log("Findings → Aspects (confidence sorted):\n");
    aspects
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, options.top)
        .forEach((aspect, index) => {
        const confidence = aspect.confidence.toFixed(3);
        const findings = aspect.findings
            .map(item => `• [${item.kind}] ${item.text}`)
            .join("\n    ");
        console.log(`${index + 1}. ${aspect.title}\n` +
            `   confidence: ${confidence}\n` +
            `   kind: ${aspect.meta?.kind ?? "unknown"}\n` +
            `   findings:\n    ${findings}\n`);
    });
}
function parseArgs(args) {
    const options = {
        embeddingModel: process.env.EMBEDDING_MODEL ?? "Xenova/all-MiniLM-L6-v2",
        top: 8,
    };
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if ((arg === "--model" || arg === "-m") && args[i + 1]) {
            options.embeddingModel = args[++i];
        }
        else if ((arg === "--top" || arg === "-t") && args[i + 1]) {
            const value = Number(args[++i]);
            if (!Number.isNaN(value) && value > 0) {
                options.top = value;
            }
        }
    }
    return options;
}
main().catch(error => {
    console.error("Insight demo failed:", error);
    process.exit(1);
});
