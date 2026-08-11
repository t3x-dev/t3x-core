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

const MODULE_USE_CASES: Record<string, Array<{ title: string; description: string }>> = {
  't3x/prd-system-architecture': [
    {
      title: 'Multiple system components',
      description: 'Clarify boundaries when a product spans applications, services, or workers.',
    },
    {
      title: 'Deployment topology',
      description: 'Record where components run and how the runtime shape affects the design.',
    },
    {
      title: 'Cross-team ownership',
      description: 'Align frontend, backend, and infrastructure responsibilities before delivery.',
    },
  ],
  't3x/prd-technology-stack': [
    {
      title: 'Stack selection',
      description: 'Make runtimes, frameworks, storage, and infrastructure choices explicit.',
    },
    {
      title: 'Engineering constraints',
      description: 'Keep supported versions, portability limits, and required practices together.',
    },
    {
      title: 'Downstream design alignment',
      description:
        'Give frontend, backend, and operations Modules a shared implementation baseline.',
    },
  ],
  't3x/prd-frontend-design': [
    {
      title: 'Multi-step user flows',
      description:
        'Describe checkout, onboarding, recovery, or other journeys before implementation.',
    },
    {
      title: 'Explicit UI states',
      description: 'Define loading, empty, error, success, and accessibility behavior together.',
    },
    {
      title: 'Component boundaries',
      description: 'Agree which pages and components own each interaction responsibility.',
    },
  ],
  't3x/prd-backend-design': [
    {
      title: 'Service responsibilities',
      description: 'Separate ownership when several services or background jobs participate.',
    },
    {
      title: 'Failure and retry behavior',
      description: 'Make idempotency, timeouts, retries, and recovery expectations reviewable.',
    },
    {
      title: 'Domain rule ownership',
      description: 'Keep business invariants distinct from transport and persistence concerns.',
    },
  ],
  't3x/prd-database-design': [
    {
      title: 'Persistent domain data',
      description: 'Define entities and relationships introduced or changed by the feature.',
    },
    {
      title: 'Schema evolution',
      description: 'Plan indexes, compatible migrations, backfills, and constraint rollout.',
    },
    {
      title: 'Data lifecycle',
      description: 'Review retention and deletion expectations before data is stored.',
    },
  ],
  't3x/prd-api-contract': [
    {
      title: 'Shared producer-consumer interfaces',
      description: 'Align teams or systems that exchange requests, responses, or events.',
    },
    {
      title: 'Stable failure contracts',
      description: 'Define errors and event outcomes that consumers must handle consistently.',
    },
    {
      title: 'Compatibility policy',
      description: 'State which changes are additive and when a new API version is required.',
    },
  ],
  't3x/prd-security-privacy': [
    {
      title: 'Sensitive data handling',
      description:
        'Classify personal, confidential, and restricted information and its safeguards.',
    },
    {
      title: 'Access and abuse risks',
      description: 'Capture authorization boundaries, threats, and likely misuse paths.',
    },
    {
      title: 'Reviewable privacy constraints',
      description: 'Keep minimization, retention, and deletion rules visible during delivery.',
    },
  ],
  't3x/prd-quality-strategy': [
    {
      title: 'Layered verification',
      description: 'Define the unit, integration, and end-to-end coverage a release needs.',
    },
    {
      title: 'Release evidence',
      description: 'Agree which reports, recordings, or audits must exist before shipping.',
    },
    {
      title: 'Measurable quality gates',
      description: 'Set reliability, accessibility, and defect thresholds that can be evaluated.',
    },
  ],
  't3x/prd-rollout-operations': [
    {
      title: 'Staged releases',
      description: 'Plan cohorts, feature flags, migrations, and progressive exposure.',
    },
    {
      title: 'Operational readiness',
      description: 'Identify monitoring signals and runbooks needed to operate the change.',
    },
    {
      title: 'Safe recovery',
      description: 'Define rollback behavior that preserves data created by the new version.',
    },
  ],
  't3x/skill-tool-policy': [
    {
      title: 'Tools that change external state',
      description: 'Set boundaries for Skills that write files, call services, or mutate systems.',
    },
    {
      title: 'Explicit safety boundaries',
      description: 'Declare allowed, denied, and approval-required operations in one contract.',
    },
    {
      title: 'Predictable failure behavior',
      description: 'Specify how execution stops and what diagnostics must be preserved.',
    },
  ],
  't3x/skill-safety-gates': [
    {
      title: 'High-impact actions',
      description: 'Protect destructive, irreversible, or externally visible operations.',
    },
    {
      title: 'Ambiguous execution scope',
      description: 'Stop safely when targets, authority, or verification conditions are unclear.',
    },
    {
      title: 'Required human decisions',
      description: 'Make the approval points for risky steps explicit before execution.',
    },
  ],
  't3x/skill-delivery-targets': [
    {
      title: 'File and package outputs',
      description: 'Declare which artifacts a Skill is expected to produce or modify.',
    },
    {
      title: 'Multiple delivery formats',
      description: 'Keep Markdown, workspace patches, and host adapters aligned.',
    },
    {
      title: 'Clear completion criteria',
      description: 'Define the deliverables that must exist when execution finishes.',
    },
  ],
  't3x/skill-runtime-environment': [
    {
      title: 'Runtime prerequisites',
      description: 'Declare required runtimes, package tools, and host dependencies.',
    },
    {
      title: 'Environment-provided resources',
      description: 'Reference credentials and configuration without embedding secret values.',
    },
    {
      title: 'Portable host assumptions',
      description: 'Make filesystem and network expectations visible across environments.',
    },
  ],
  't3x/skill-evaluation-suite': [
    {
      title: 'Repeatable regression cases',
      description: 'Exercise clean, conflicting, and failure-path workspace conditions.',
    },
    {
      title: 'Deterministic acceptance',
      description: 'Define assertions and thresholds that produce reproducible results.',
    },
    {
      title: 'Version comparison',
      description: 'Measure whether a Skill preserves required behavior across revisions.',
    },
  ],
  't3x/prompt-few-shot-examples': [
    {
      title: 'Example-shaped behavior',
      description: 'Use representative pairs when examples materially influence the response.',
    },
    {
      title: 'Stable input-output patterns',
      description: 'Show expected handling for recurring task intents and edge cases.',
    },
    {
      title: 'Versioned demonstrations',
      description: 'Review and evolve examples alongside the Prompt contract.',
    },
  ],
  't3x/prompt-guardrails': [
    {
      title: 'Policy-constrained requests',
      description: 'State which outputs or actions the Prompt must never produce.',
    },
    {
      title: 'Refusal and escalation',
      description: 'Define safe alternatives and the conditions for human handoff.',
    },
    {
      title: 'Reviewable boundaries',
      description: 'Keep sensitive behavior explicit instead of relying on implicit instructions.',
    },
  ],
  't3x/prompt-observability': [
    {
      title: 'Traceable Prompt runs',
      description: 'Capture identifiers and version fields needed to diagnose outcomes.',
    },
    {
      title: 'Privacy-aware telemetry',
      description: 'Define redactions before Prompt inputs or outputs reach observability systems.',
    },
    {
      title: 'Runtime performance budgets',
      description: 'Track latency and quality signals consistently across Prompt versions.',
    },
  ],
  't3x/prompt-context-policy': [
    {
      title: 'Multiple context sources',
      description: 'Declare which records, policies, or user claims may inform an answer.',
    },
    {
      title: 'Freshness and trust decisions',
      description: 'Resolve stale or conflicting context using explicit authority rules.',
    },
    {
      title: 'Bounded context selection',
      description: 'Manage token budgets without silently dropping required evidence.',
    },
  ],
  't3x/prompt-evaluation-suite': [
    {
      title: 'Prompt regression coverage',
      description: 'Keep normal, unknown, and conflicting cases in a reusable suite.',
    },
    {
      title: 'Consistent grading',
      description: 'Name the policy, factuality, or task-success criteria used for evaluation.',
    },
    {
      title: 'Release thresholds',
      description: 'Turn high-impact quality expectations into explicit acceptance gates.',
    },
  ],
  't3x/esphome-sensors': [
    {
      title: 'Sensor entities',
      description: 'Describe physical and diagnostic sensors exposed by the device.',
    },
    {
      title: 'Shared signal processing',
      description: 'Keep update intervals, throttling, and filters consistent across sensors.',
    },
    {
      title: 'Reviewable telemetry behavior',
      description: 'Verify pins, units, and reporting behavior before compiling firmware.',
    },
  ],
  't3x/esphome-actuators': [
    {
      title: 'Controllable outputs',
      description: 'Define switches, lights, fans, relays, or motors owned by the device.',
    },
    {
      title: 'Safe restart state',
      description: 'Specify how outputs recover after power loss or an unexpected reboot.',
    },
    {
      title: 'Coordinated actuators',
      description: 'Review multiple output entities and their hardware responsibilities together.',
    },
  ],
  't3x/esphome-automations': [
    {
      title: 'Local trigger-action behavior',
      description: 'Define automations that must run directly on the device.',
    },
    {
      title: 'Offline operation',
      description: 'Keep essential behavior deterministic when network services are unavailable.',
    },
    {
      title: 'Input failure fallbacks',
      description: 'Specify safe actions when sensors or other required inputs disappear.',
    },
  ],
  't3x/esphome-hardware-buses': [
    {
      title: 'Shared hardware buses',
      description: 'Describe I2C, SPI, UART, and OneWire wiring in one place.',
    },
    {
      title: 'Explicit pin ownership',
      description: 'Reserve pins and document bus parameters before assigning peripherals.',
    },
    {
      title: 'Peripheral conflict prevention',
      description: 'Review reused pins and incompatible bus settings before firmware generation.',
    },
  ],
  't3x/esphome-network-services': [
    {
      title: 'Local network capabilities',
      description: 'Declare APIs, OTA updates, and discovery services exposed by the device.',
    },
    {
      title: 'Transport configuration',
      description: 'Keep Wi-Fi, Ethernet, and related connectivity assumptions explicit.',
    },
    {
      title: 'Fallback access',
      description: 'Define how the device remains recoverable when normal connectivity fails.',
    },
  ],
  't3x/esphome-power-management': [
    {
      title: 'Energy-constrained devices',
      description: 'Set an explicit operating budget for battery or harvested-power hardware.',
    },
    {
      title: 'Sleep and wake behavior',
      description: 'Coordinate active modes, deep sleep, timers, and wake inputs.',
    },
    {
      title: 'Controlled power domains',
      description: 'Specify which sensors or peripherals are disabled between measurements.',
    },
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
    useCases: MODULE_USE_CASES[artifact.canonicalName] ?? [
      {
        title: artifact.title,
        description: 'Use when this Module contribution should be explicit and reviewable.',
      },
    ],
    value,
  };
}
