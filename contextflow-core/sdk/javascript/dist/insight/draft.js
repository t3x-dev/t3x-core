"use strict";
/**
 * Draft summary bullet generator.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderBullets = renderBullets;
const MAX_FINDINGS_PER_ASPECT = 2;
const MAX_FINDING_LENGTH = 80;
function renderBullets(aspects) {
    return aspects.map(aspect => formatAspect(aspect));
}
function formatAspect(aspect) {
    const title = aspect.title?.trim() || "未命名要点";
    const confidenceLabel = formatConfidence(aspect.confidence);
    const prefix = `- ${title}${confidenceLabel ? ` ${confidenceLabel}` : ""}`;
    if (!aspect.findings || aspect.findings.length === 0) {
        return `${prefix}: 缺少佐证`;
    }
    const snippets = aspect.findings.slice(0, MAX_FINDINGS_PER_ASPECT).map(snippet => summarize(snippet));
    const remaining = aspect.findings.length - snippets.length;
    if (remaining > 0) {
        snippets.push(`另外 ${remaining} 条补充`);
    }
    let body = snippets.join("；");
    if (aspect.confidence < 0.5) {
        body += "（待确认）";
    }
    return `${prefix}: ${body}`;
}
function summarize(text) {
    const trimmed = text.trim();
    if (trimmed.length <= MAX_FINDING_LENGTH) {
        return trimmed;
    }
    return `${trimmed.slice(0, MAX_FINDING_LENGTH - 1)}…`;
}
function formatConfidence(confidence) {
    if (!Number.isFinite(confidence))
        return "";
    const percentage = Math.round(clamp01(confidence) * 100);
    return `(${percentage}%)`;
}
function clamp01(value) {
    if (!Number.isFinite(value))
        return 0;
    if (value < 0)
        return 0;
    if (value > 1)
        return 1;
    return value;
}
