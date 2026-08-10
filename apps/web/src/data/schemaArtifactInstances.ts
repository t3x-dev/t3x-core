import type { SchemaArtifactInstance, SchemaArtifactPreview } from '@/types/schemaModules';

const OFFICIAL_MODULE_INSTANCES: Record<string, Record<string, unknown>> = {
  't3x/prd-system-architecture@1.0.0': {
    system_architecture: {
      context:
        'Customers use the web application while internal services own checkout and fulfilment.',
      components: ['Web application', 'Checkout service', 'Order service', 'Notification worker'],
      deployment:
        'The web application runs at the edge; services run in a regional container platform.',
    },
  },
  't3x/prd-technology-stack@1.0.0': {
    technology_stack: {
      frontend: ['Next.js', 'React', 'TypeScript'],
      backend: ['Hono API', 'PostgreSQL'],
      infrastructure: ['Container runtime', 'Object storage'],
      constraints: ['Use supported LTS runtimes', 'Keep state transitions deterministic'],
    },
  },
  't3x/prd-frontend-design@1.0.0': {
    frontend_design: {
      user_flows: ['Checkout → Payment → Success'],
      routes: ['/cart', '/checkout'],
      components: ['CheckoutForm', 'OrderSummary'],
      states: ['loading', 'error', 'success'],
      accessibility: ['Keyboard navigation'],
    },
  },
  't3x/prd-backend-design@1.0.0': {
    backend_design: {
      services: ['Checkout service validates totals', 'Order service owns order lifecycle'],
      domain_rules: ['An order can be paid once', 'Inventory is reserved before payment'],
      background_jobs: ['Expire abandoned reservations', 'Send order confirmation'],
      failure_modes: ['Retry idempotent payment callbacks', 'Release inventory after timeout'],
    },
  },
  't3x/prd-database-design@1.0.0': {
    database_design: {
      entities: ['User', 'Cart', 'Order', 'Payment'],
      relationships: ['User 1—N Order', 'Order 1—N Payment'],
      indexes: ['orders(user_id, created_at)', 'payments(provider_reference) unique'],
      migrations: ['Add nullable column', 'Backfill values', 'Enforce constraint'],
      retention: 'Keep completed orders for seven years and payment logs for ninety days.',
    },
  },
  't3x/prd-api-contract@1.0.0': {
    api_contract: {
      endpoints: ['POST /v1/orders', 'POST /v1/orders/:id/pay', 'GET /v1/orders/:id'],
      events: ['order.created', 'payment.completed', 'payment.failed'],
      errors: ['409 INVENTORY_UNAVAILABLE', '422 PAYMENT_DECLINED'],
      compatibility: 'Additive fields are allowed; breaking changes require a new API version.',
    },
  },
  't3x/prd-security-privacy@1.0.0': {
    security_privacy: {
      threats: ['Account takeover', 'Payment callback replay'],
      access_controls: ['Customers can read only their own orders', 'Admin actions require MFA'],
      data_classification: ['Payment token: restricted', 'Delivery address: confidential'],
      privacy_constraints: [
        'Do not store card numbers',
        'Delete abandoned checkout data after 30 days',
      ],
      abuse_cases: ['Automated coupon enumeration', 'Repeated payment attempts'],
    },
  },
  't3x/prd-quality-strategy@1.0.0': {
    quality_strategy: {
      test_levels: [
        'Unit tests for pricing',
        'Integration tests for payment',
        'E2E checkout smoke test',
      ],
      quality_budgets: ['No critical accessibility violations', 'Checkout error rate below 0.5%'],
      release_gates: ['All critical tests pass', 'No unresolved severity-one defects'],
      evidence: ['CI test report', 'Staging checkout recording', 'Accessibility audit'],
    },
  },
  't3x/prd-rollout-operations@1.0.0': {
    rollout_operations: {
      rollout_strategy: 'Release to staff, then 5%, 25%, and 100% of customers.',
      migrations: ['Deploy backward-compatible schema before application code'],
      monitoring: ['Checkout completion rate', 'Payment failure rate', 'API p95 latency'],
      rollback:
        'Disable the checkout feature flag and keep orders created by the new flow readable.',
      runbooks: ['Payment provider outage', 'Inventory reservation backlog'],
    },
  },
  't3x/skill-tool-policy@1.0.0': {
    tool_policy: {
      allowed: ['Read workspace files', 'Run package tests'],
      denied: ['Print secrets', 'Delete outside the workspace'],
      approval_required: ['Publish a package', 'Modify production data'],
      on_failure: 'Stop, preserve diagnostics, and report the blocking condition.',
    },
  },
  't3x/skill-safety-gates@1.0.0': {
    safety_gates: {
      risks: ['Destructive file changes', 'External publication'],
      approvals: ['Confirm exact deletion targets', 'Confirm package version before publish'],
      stop_conditions: [
        'Target path is ambiguous',
        'Verification cannot reproduce the requested state',
      ],
    },
  },
  't3x/skill-delivery-targets@1.0.0': {
    delivery_targets: {
      formats: ['Markdown report', 'Patched workspace files'],
      files: ['SKILL.md', 'scripts/verify.mjs'],
      adapters: ['Codex', 'CLI'],
    },
  },
  't3x/skill-runtime-environment@1.0.0': {
    runtime_environment: {
      runtimes: ['Node.js 22', 'PowerShell 7'],
      dependencies: ['pnpm', 'Git'],
      environment_references: ['PACKAGE_REGISTRY_TOKEN'],
      filesystem_policy: 'Write only inside the selected workspace.',
      network_policy: 'Use network access only for declared registries and source repositories.',
    },
  },
  't3x/skill-evaluation-suite@1.0.0': {
    evaluation_suite: {
      cases: ['Clean workspace', 'Workspace with unrelated user changes', 'Failing pre-push hook'],
      fixtures: ['Example package manifest', 'Mock registry response'],
      assertions: ['Unrelated changes are preserved', 'Publish requires explicit authorization'],
      thresholds: ['All deterministic assertions pass'],
    },
  },
  't3x/prompt-few-shot-examples@1.0.0': {
    examples: {
      cases: ['Input: Cancel my order → Output: Ask for the order number before acting'],
      selection_policy:
        'Choose the closest example by task intent; never copy customer-specific values.',
    },
  },
  't3x/prompt-guardrails@1.0.0': {
    guardrails: {
      prohibited: ['Expose private account data', 'Invent an order status'],
      refusal: 'Explain the boundary and offer a safe support path.',
      escalation: 'Escalate payment disputes and identity conflicts to a human agent.',
    },
  },
  't3x/prompt-observability@1.0.0': {
    observability: {
      trace_fields: ['request_id', 'prompt_version', 'result_class'],
      redactions: ['Email address', 'Payment token'],
      latency_budget_ms: 1500,
    },
  },
  't3x/prompt-context-policy@1.0.0': {
    context_policy: {
      sources: ['Current order record', 'Published refund policy'],
      trust_levels: ['Order database: authoritative', 'Customer message: claimed'],
      freshness_policy: 'Refresh order state immediately before answering.',
      token_budget: 4000,
      conflict_resolution: 'Prefer authoritative current state and disclose unresolved conflicts.',
    },
  },
  't3x/prompt-evaluation-suite@1.0.0': {
    evaluation_suite: {
      cases: ['Known order', 'Unknown order', 'Conflicting customer claim'],
      graders: ['Policy compliance', 'Factual grounding'],
      metrics: ['Grounded answer rate', 'Correct escalation rate'],
      thresholds: ['100% policy compliance', 'At least 95% grounded answers'],
    },
  },
  't3x/esphome-sensors@1.0.0': {
    sensors: {
      entities: ['DHT22 temperature on GPIO4', 'Wi-Fi signal every 60 seconds'],
      shared_filters: ['Throttle updates to 30 seconds', 'Round temperature to one decimal place'],
    },
  },
  't3x/esphome-actuators@1.0.0': {
    actuators: {
      entities: ['Relay switch on GPIO16', 'Status light on GPIO17'],
      restore_policy: 'Keep relays off after an unexpected restart.',
    },
  },
  't3x/esphome-automations@1.0.0': {
    automations: {
      triggers: ['When temperature exceeds 30°C, start the fan'],
      scripts: ['Pulse the status light during pairing'],
      fallbacks: ['Turn outputs off when the sensor is unavailable'],
    },
  },
  't3x/esphome-hardware-buses@1.0.0': {
    hardware_buses: {
      i2c: ['SDA GPIO21, SCL GPIO22, 400 kHz'],
      spi: ['CLK GPIO18, MOSI GPIO23, MISO GPIO19'],
      uart: ['TX GPIO17, RX GPIO16, 9600 baud'],
      one_wire: ['GPIO4'],
      pin_reservations: ['GPIO0 reserved for boot mode'],
    },
  },
  't3x/esphome-network-services@1.0.0': {
    network_services: {
      transports: ['Wi-Fi with DHCP'],
      services: ['Native API', 'OTA updates'],
      discovery: ['mDNS'],
      fallback_access: 'Start a captive portal after two minutes without Wi-Fi.',
    },
  },
  't3x/esphome-power-management@1.0.0': {
    power_management: {
      modes: ['Active sampling', 'Deep sleep'],
      wake_sources: ['Timer every 15 minutes', 'GPIO wake button'],
      power_domains: ['Disable sensor rail before deep sleep'],
      energy_budget: 'Average current below 1 mA over a 24-hour cycle.',
    },
  },
};

const MODULE_USE_CASES: Record<string, string[]> = {
  't3x/prd-system-architecture': [
    'Products with multiple components or service boundaries.',
    'Systems that need an explicit deployment shape.',
    'Teams aligning responsibilities across frontend, backend, and infrastructure.',
  ],
  't3x/prd-technology-stack': [
    'Projects choosing runtimes, frameworks, and infrastructure.',
    'Teams that need technology decisions and constraints recorded together.',
    'Products where implementation choices affect later design Modules.',
  ],
  't3x/prd-frontend-design': [
    'Multi-step user flows such as checkout, onboarding, or recovery.',
    'Products that need explicit loading, error, and success behavior.',
    'Pages where component responsibilities should be agreed before implementation.',
  ],
  't3x/prd-backend-design': [
    'Products with multiple services, jobs, or domain boundaries.',
    'Backends that need failure and retry behavior defined.',
    'Teams separating business rules from transport and storage concerns.',
  ],
  't3x/prd-database-design': [
    'Features introducing persistent entities and relationships.',
    'Changes that require indexes, migrations, or retention decisions.',
    'Teams reviewing data lifecycle before implementation.',
  ],
  't3x/prd-api-contract': [
    'Features shared between multiple producers and consumers.',
    'Interfaces that need stable errors, events, or payload expectations.',
    'APIs with explicit compatibility requirements.',
  ],
  't3x/prd-security-privacy': [
    'Products handling sensitive, personal, or restricted data.',
    'Features that introduce access-control or abuse risks.',
    'Teams that need security constraints visible in delivery planning.',
  ],
  't3x/prd-quality-strategy': [
    'Releases that need explicit test levels and quality gates.',
    'Teams agreeing what evidence is required before shipping.',
    'Products with measurable reliability or accessibility budgets.',
  ],
  't3x/prd-rollout-operations': [
    'Changes that need staged rollout, migration, or rollback plans.',
    'Services with monitoring and operational runbook requirements.',
    'Features where safe recovery matters after release.',
  ],
  't3x/skill-tool-policy': [
    'Skills that call tools or mutate external state.',
    'Workflows that need allowlists, denylists, or approvals.',
    'Teams defining predictable behavior after tool failures.',
  ],
  't3x/skill-safety-gates': [
    'Skills with destructive or externally visible actions.',
    'Workflows that must stop when scope or targets are ambiguous.',
    'Teams requiring explicit approval before risky steps.',
  ],
  't3x/skill-delivery-targets': [
    'Skills that emit files, packages, or host-specific adapters.',
    'Workflows supporting more than one output format.',
    'Teams that need delivery expectations defined before execution.',
  ],
  't3x/skill-runtime-environment': [
    'Skills with runtime, dependency, filesystem, or network requirements.',
    'Workflows that reference environment-provided credentials.',
    'Portable Skills that must declare their host assumptions.',
  ],
  't3x/skill-evaluation-suite': [
    'Skills that need repeatable regression coverage.',
    'Workflows with deterministic assertions or acceptance thresholds.',
    'Teams comparing behavior across Skill versions.',
  ],
  't3x/prompt-few-shot-examples': [
    'Prompts where examples materially shape output behavior.',
    'Tasks with stable input and expected-output patterns.',
    'Teams that need examples versioned with the Prompt contract.',
  ],
  't3x/prompt-guardrails': [
    'Prompts handling sensitive or policy-constrained requests.',
    'Assistants that need refusal and escalation behavior.',
    'Teams making content boundaries explicit and reviewable.',
  ],
  't3x/prompt-observability': [
    'Prompts that need trace fields and quality signals.',
    'Runtime paths with latency or redaction requirements.',
    'Teams measuring Prompt behavior across versions.',
  ],
  't3x/prompt-context-policy': [
    'Prompts combining context from multiple sources.',
    'Tasks where freshness, trust, or conflicts affect correctness.',
    'Teams managing token budgets and context selection rules.',
  ],
  't3x/prompt-evaluation-suite': [
    'Prompts that need regression cases and graders.',
    'Teams tracking quality metrics across releases.',
    'High-impact behaviors with explicit acceptance thresholds.',
  ],
  't3x/esphome-sensors': [
    'Devices that expose one or more sensor entities.',
    'Configurations sharing update intervals or filters.',
    'Hardware projects that need sensor behavior reviewed together.',
  ],
  't3x/esphome-actuators': [
    'Devices controlling switches, lights, fans, or motors.',
    'Outputs that need a safe restore policy.',
    'Hardware projects with multiple actuator entities.',
  ],
  't3x/esphome-automations': [
    'Devices with local triggers, actions, or scripts.',
    'Offline behavior that must remain deterministic.',
    'Hardware requiring safety fallbacks when inputs fail.',
  ],
  't3x/esphome-hardware-buses': [
    'Devices sharing I2C, SPI, UART, or OneWire buses.',
    'Boards that need explicit pin ownership.',
    'Hardware designs where peripheral conflicts must be prevented.',
  ],
  't3x/esphome-network-services': [
    'Devices exposing local network services or discovery.',
    'Configurations with multiple transports.',
    'Products that need fallback access when normal connectivity fails.',
  ],
  't3x/esphome-power-management': [
    'Battery-powered or energy-constrained devices.',
    'Devices using sleep modes and wake sources.',
    'Hardware with explicit power domains or energy budgets.',
  ],
};

export function findSchemaArtifactInstance(
  artifact: Pick<SchemaArtifactPreview, 'canonicalName' | 'title' | 'version'>
): SchemaArtifactInstance | undefined {
  const value = OFFICIAL_MODULE_INSTANCES[`${artifact.canonicalName}@${artifact.version}`];
  if (!value) return undefined;
  return {
    title: `${artifact.title} instance`,
    description: 'Representative sample content that conforms to this Module structure.',
    useCases: MODULE_USE_CASES[artifact.canonicalName] ?? [artifact.title],
    value,
  };
}
