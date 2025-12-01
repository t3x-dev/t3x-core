/**
 * Bridge Template Loader
 *
 * Load Bridge configuration and prompt templates from YAML files.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { BridgeTemplate, DEFAULT_THRESHOLD } from "./types";

/**
 * Built-in default bridge templates
 */
const BUILTIN_BRIDGES: BridgeTemplate[] = [
  {
    bridge: "plan",
    label: "Travel Plan",
    version: 1,
    locale: "en",
    threshold: 0.60,
    description: "Generate a travel plan based on user preferences",
    prompt: `You are a travel planning assistant. Based on the user's preferences and evidence gathered from the conversation, create a detailed travel plan.

Requirements:
1. Include all Must-Have items mentioned by the user
2. Avoid all Mustn't-Have items
3. Be specific about dates, locations, and activities
4. Consider practical constraints (budget, time, accessibility)

Format your response as a structured plan with sections for:
- Overview
- Day-by-day itinerary
- Accommodation recommendations
- Budget estimate`,
  },
  {
    bridge: "explain",
    label: "Explanation",
    version: 1,
    locale: "en",
    threshold: 0.55,
    description: "Explain a concept or decision based on context",
    prompt: `You are an expert explainer. Based on the evidence and context provided, give a clear and comprehensive explanation.

Requirements:
1. Address all Must-Have topics
2. Avoid Mustn't-Have topics
3. Use clear, accessible language
4. Provide examples where helpful

Structure your explanation with:
- Summary
- Key points
- Details
- Conclusion`,
  },
  {
    bridge: "summary",
    label: "Summary",
    version: 1,
    locale: "en",
    threshold: 0.50,
    description: "Summarize conversation or document content",
    prompt: `You are a summarization assistant. Create a concise summary based on the evidence provided.

Requirements:
1. Include all Must-Have points
2. Omit Mustn't-Have content
3. Be concise but complete
4. Preserve key details and nuances

Format:
- Executive summary (2-3 sentences)
- Key points (bulleted list)
- Notable details`,
  },
];

/**
 * Bridge Template Loader
 */
export class BridgeLoader {
  private templates: Map<string, BridgeTemplate> = new Map();
  private bridgesDir: string;
  private initialized = false;

  /**
   * Create a new BridgeLoader
   *
   * @param bridgesDir - Directory containing bridge YAML files
   *                     Defaults to {projectRoot}/.contextflow/bridges/
   */
  constructor(bridgesDir?: string) {
    this.bridgesDir = bridgesDir ?? path.join(process.cwd(), ".contextflow", "bridges");
  }

  /**
   * Initialize the loader - load all bridges from directory
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    // Check if directory exists
    try {
      await fs.access(this.bridgesDir);
    } catch {
      // Directory doesn't exist - initialize with defaults
      await this.initDefaultBridges();
    }

    // Load all YAML files from directory
    await this.loadAll();
    this.initialized = true;
  }

  /**
   * Initialize default bridge templates
   */
  private async initDefaultBridges(): Promise<void> {
    // Create directory
    await fs.mkdir(this.bridgesDir, { recursive: true });

    // Write built-in templates as YAML files
    for (const template of BUILTIN_BRIDGES) {
      const yamlContent = this.templateToYaml(template);
      const filePath = path.join(this.bridgesDir, `${template.bridge}.yaml`);
      await fs.writeFile(filePath, yamlContent, "utf-8");
    }
  }

  /**
   * Convert template to YAML string
   */
  private templateToYaml(template: BridgeTemplate): string {
    const lines: string[] = [
      `bridge: ${template.bridge}`,
    ];

    if (template.label) lines.push(`label: ${template.label}`);
    if (template.version) lines.push(`version: ${template.version}`);
    if (template.locale) lines.push(`locale: ${template.locale}`);
    lines.push(`threshold: ${template.threshold}`);
    if (template.description) lines.push(`description: ${template.description}`);

    // Multi-line prompt
    lines.push(`prompt: |`);
    const promptLines = template.prompt.split("\n");
    for (const line of promptLines) {
      lines.push(`  ${line}`);
    }

    return lines.join("\n") + "\n";
  }

  /**
   * Load all bridge YAML files from directory
   */
  private async loadAll(): Promise<void> {
    const files = await fs.readdir(this.bridgesDir);
    const yamlFiles = files.filter(f => f.endsWith(".yaml") || f.endsWith(".yml"));

    for (const file of yamlFiles) {
      try {
        const filePath = path.join(this.bridgesDir, file);
        const content = await fs.readFile(filePath, "utf-8");
        const data = parseYaml(content) as Record<string, unknown>;

        // Validate required fields
        if (!data.bridge || typeof data.bridge !== "string") {
          console.warn(`Warning: Missing 'bridge' field in ${file}`);
          continue;
        }
        if (!data.prompt || typeof data.prompt !== "string") {
          console.warn(`Warning: Missing 'prompt' field in ${file}`);
          continue;
        }

        const template: BridgeTemplate = {
          bridge: data.bridge,
          prompt: data.prompt,
          label: data.label as string | undefined,
          version: data.version as number | undefined,
          locale: data.locale as string | undefined,
          threshold: (data.threshold as number) ?? DEFAULT_THRESHOLD,
          description: data.description as string | undefined,
        };

        this.templates.set(template.bridge, template);
      } catch (error) {
        console.warn(`Warning: Failed to load bridge ${file}: ${(error as Error).message}`);
      }
    }
  }

  /**
   * Get bridge template by ID
   */
  get(bridgeId: string): BridgeTemplate | undefined {
    return this.templates.get(bridgeId);
  }

  /**
   * Get bridge template with resolved threshold
   *
   * Priority: cliThreshold > configThreshold > template.threshold > DEFAULT_THRESHOLD
   */
  getWithThreshold(
    bridgeId: string,
    cliThreshold?: number,
    configThreshold?: number
  ): { template: BridgeTemplate | undefined; threshold: number } {
    const template = this.get(bridgeId);

    const threshold =
      cliThreshold ??
      configThreshold ??
      template?.threshold ??
      DEFAULT_THRESHOLD;

    return { template, threshold };
  }

  /**
   * List all available bridge IDs
   */
  list(): string[] {
    return Array.from(this.templates.keys());
  }

  /**
   * Reload all bridges (for hot updates)
   */
  async reload(): Promise<void> {
    this.templates.clear();
    this.initialized = false;
    await this.init();
  }
}

/**
 * Create a BridgeLoader instance
 */
export function createBridgeLoader(bridgesDir?: string): BridgeLoader {
  return new BridgeLoader(bridgesDir);
}
