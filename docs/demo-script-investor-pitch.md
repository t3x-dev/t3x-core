# T3X Product Demo Script (Investor/Executive Version)

> Target audience: Non-technical decision makers
> Demo duration: 15-20 minutes
> Core message: T3X makes enterprise AI knowledge management like Git manages code — traceable, controllable, collaborative

---

## Part 1: Opening — Why T3X?

### Pre-demo Setup
- Open WebUI (http://localhost:3000)
- Ensure demo data exists (projects, conversations, commits, leaves)

### Script

> "Before we begin the demo, I'd like to ask everyone a question:
>
> **Has your company's AI chatbot ever said something wrong?**
>
> For example, saying 30-day returns are 60-day? Getting the free shipping threshold wrong? Or accidentally disclosing information it shouldn't?
>
> This happens very commonly in enterprises. According to our research, **over 70% of companies using AI customer service have encountered AI 'saying the wrong thing'**.
>
> Why does this happen? Because current AI systems have three fundamental problems:"

**[Pause, hold up three fingers]**

> "**First, knowledge is untraceable.**
>
> Where does what AI says come from? Nobody knows. It could be from training data, scraped from the internet, or made up. You can't audit it, you can't assign responsibility.
>
> **Second, outputs are uncontrollable.**
>
> You can tell AI 'please remember our return policy is 30 days,' but AI only 'tries to remember.' It might remember, might forget, might misremember. You have no means to **enforce** what it must say or must not say.
>
> **Third, iteration is unsustainable.**
>
> AI said something wrong, then what? Modify the prompt? How do you verify after modification? Will the new version introduce new problems? Who approved this change? No process, no records, no rollback capability.
>
> **T3X was built to solve these three problems.**
>
> We call it 'Git for Meaning' — a **semantic version control system**.
>
> Just like programmers use Git to manage code, T3X lets enterprises manage AI knowledge. Every piece of knowledge has a source, a version, and an approval process.
>
> Let me show you how it works through an actual demonstration."

---

## Part 2: Demo Roadmap

```
Home → Insights (Overview) → Project Canvas → Conversation Details → Leaf Details → Agent Chat → Agent Optimiser → Deploy
```

---

## Part 3: First Stop — Insights Page (Overview)

### Steps
1. Click the **bar chart icon** in the left navigation (third from bottom)
2. Enter the Insights page
3. Make sure you're on the "Ledger" tab

### Interface Description
- Top: Ledger / Latest Commits toggle tabs
- Main area: Multiple cards, each representing a piece of structured knowledge
- Card content: Commit title, summary, source sentences, project name, branch name, evidence count

### Script

> "This is T3X's **overview page**, we call it Insights.
>
> Each card you see represents a piece of **structured knowledge automatically extracted from AI conversations**.
>
> Let me explain these cards:
>
> **[Point to the first card]**
>
> This card is called 'Brand voice: professional, approachable, plain language first.'
>
> The top right shows '5h ago' — created 5 hours ago, 'main' means it's on the main branch.
>
> Below are two specific sentences:
> - 'Brand voice should be professional yet approachable...'
> - 'Use plain language and avoid jargon unless absolutely necessary...'
>
> At the bottom it shows 'Marketing Tone Guide' and '2 evidence' — meaning this knowledge belongs to the 'Marketing Tone Guide' project and has 2 original conversations as supporting evidence.
>
> **[Point to other cards]**
>
> Look at these others:
> - 'Shipping policy: 5-7 business days standard shipping, free shipping over $50'
> - 'Warranty terms: 2-year warranty, 60-day return window'
> - 'Return policy: Standard 30 days, 90 days for defective items'
>
> These were all **automatically extracted** from real business conversations. Not manually compiled FAQs, but what the AI system learned from conversations itself.
>
> **But the key point is — every piece has evidence traceability.**
>
> Click in, and you can see where this knowledge originally came from, who said it, when it was said.
>
> This solves the first problem I mentioned: **knowledge traceability**.
>
> If AI says something wrong in the future, you can trace back: Where did this knowledge come from? Which employee said it in which conversation? What was the context of that conversation? Was it originally wrong?
>
> **With this, you can do auditing, compliance, and accountability.**"

### Possible Questions and Answers

**Q: How is this knowledge automatically extracted?**

> "We have a **semantic extraction engine**. The core algorithm is deterministic — meaning the same input always produces the same output, unaffected by AI randomness.
>
> Extraction happens in three layers:
> 1. First layer extracts keywords, entities, temporal information
> 2. Second layer identifies intent, relationships
> 3. Third layer generates sentence-level semantic units
>
> The entire process doesn't rely on large models, it's pure algorithmic, so results are reproducible and verifiable."

**Q: What's the accuracy rate?**

> "Our internal testing shows accuracy above 92%. And more importantly — **all extraction results require human review before becoming official**.
>
> The system first puts extraction results in 'draft' status. Only after business personnel review and confirm does it get formally submitted to the knowledge base. This ensures that even if the algorithm has errors, the final knowledge in the repository is human-verified."

---

## Part 4: Second Stop — Project Canvas (Knowledge Workspace)

### Steps
1. Click the **house icon** in the left navigation (home)
2. Select "Customer Support Knowledge" from the project list (if list is empty, navigate directly to /project/proj_2fbc9aa1)
3. Enter the project canvas page

### Interface Description
- Canvas area: Draggable node graph
- Node types: Conversation nodes (blue), Commit nodes (green), Leaf nodes (orange)
- Lines: Represent data flow (Conversation → Extraction → Commit → Application → Leaf)

### Script

> "Now we enter a specific project — 'Customer Support Knowledge Base.'
>
> This is T3X's **core work interface**, we call it the 'canvas.'
>
> **[Point to the entire canvas]**
>
> You can think of it as a **knowledge flow diagram**.
>
> On the left are **conversation nodes** — representing individual AI conversations, the original source of knowledge.
>
> In the middle are **Commit nodes** — representing structured knowledge extracted from conversations. Like a programmer's code commits, each extraction is a Commit.
>
> On the right are **Leaf nodes** — representing specific applications generated from knowledge, like an email, a tweet, a customer service script.
>
> The lines between nodes represent **data flow**:
>
> Conversation → Extract knowledge → Form Commit → Apply to specific scenario → Generate Leaf
>
> **[Demonstrate dragging with mouse]**
>
> All these nodes can be freely dragged. You can organize the canvas layout according to your own logic.
>
> **Why use this canvas format?**
>
> Because knowledge management isn't linear. One piece of knowledge might come from multiple conversations, one Commit might branch into multiple application scenarios, different branches might need merging...
>
> The canvas can intuitively display these **complex knowledge relationships**.
>
> This is the same philosophy as Git — Git has branches, merges, conflict resolution. T3X's knowledge management works the same way."

### Additional Explanation About Branches

> "Speaking of branches, let me explain further.
>
> Look here (if multi-branch data exists), there's a 'main' branch and a 'feature/warranty' branch.
>
> What does this mean?
>
> Suppose your company currently has a standard return policy: Returns within 30 days. This is the knowledge on the main branch.
>
> Now marketing wants to run a promotion extending the return period to 60 days. But this is just a pilot, you don't want to affect the main workflow.
>
> What do you do? **Create a new branch.**
>
> On the 'feature/promotion' branch, create new knowledge: Return period 60 days.
>
> During the promotion, participating customer service bots use this branch's knowledge. After the event ends, you can choose to merge to main branch, or simply abandon this branch.
>
> **This is applying Git thinking to knowledge management — you can experiment safely without affecting production.**"

---

## Part 5: Third Stop — Conversation Details Page (Knowledge Source)

### Steps
1. Double-click a conversation node on the canvas
2. Or navigate directly to /project/proj_2fbc9aa1/conversation/conv_3d7d48e8
3. Enter the conversation details page

### Interface Description
- Left main area: Conversation bubble list (USER / ASSISTANT alternating)
- Right panel: Context configuration panel, showing current Pin count
- Each message shows: Role, timestamp, content

### Script

> "Now let's look at a specific conversation — 'Return Policy Discussion.'
>
> **[Point to conversation bubbles]**
>
> This is a typical customer service conversation:
>
> User asks: 'What is your return policy for electronics purchased online?'
>
> Assistant answers: 'Our standard return policy allows returns within 30 days of purchase. Electronics must be in original packaging with all accessories. A receipt or order confirmation is required for processing.'
>
> User follows up: 'What if the item is defective? Is the policy different?'
>
> Assistant answers: 'For defective items, we extend the return window to 90 days. We also cover return shipping costs for confirmed defects. You can choose between a full refund or replacement.'
>
> **This is a real business conversation.**
>
> What T3X does is: **automatically extract key information from this conversation to form structured knowledge.**
>
> The extracted knowledge is:
> - 'Standard return policy allows returns within 30 days of purchase'
> - 'Return window for defective items extended to 90 days'
> - 'Company covers return shipping for defects'
>
> Each piece of knowledge **precisely locates which sentence in the original text** — not vaguely 'this conversation has content about returns,' but specifically which sentence, which character to which character.
>
> **[Point to right Context panel]**
>
> The panel on the right is Context configuration. 'Using 0 pins' means this conversation isn't currently referenced elsewhere.
>
> If I want AI to 'remember' this conversation's content when answering other questions, I can 'Pin' it — like bookmarking a webpage in your browser.
>
> Pinned conversations become AI's **contextual memory**."

### Additional Explanation About Pin System

> "The Pin system is an important feature we designed.
>
> Traditional AI systems use 'full memory' — dumping all data to AI, letting it judge what's important. This causes two problems:
>
> 1. **High cost**: Tokens are billed by volume, full input is expensive
> 2. **Imprecise**: AI might be distracted by irrelevant information and answer incorrectly
>
> T3X's approach is **precise memory** — you explicitly tell AI 'these are what you need to remember,' ignore the rest.
>
> It's like highlighting before an exam — the teacher doesn't make you memorize the entire book, but tells you 'these chapters will be tested.'
>
> **Pin is our 'highlighting' mechanism.**"

---

## Part 6: Fourth Stop — Leaf Details Page (Core Differentiator)

### Steps
1. Return to canvas, double-click a Leaf node
2. Or navigate directly to /project/proj_2fbc9aa1/leaf/leaf_2b4eb0ec2960
3. Enter the Leaf details page

### Interface Description
- Title bar: Leaf name, type label (email), date
- Action buttons: Generate & Verify, Re-validate, Export
- Source Content & Constraints area:
  - Source Context: Source conversation content, keywords highlighted
  - Must Have / Must Not Have: Constraint buttons
  - Constraint list: require (must include), exclude (must not include)
- Custom Instruction: Custom instruction input box

### Script

> "**This is T3X's most core innovation and our biggest differentiator from other products — the Leaf node.**
>
> Look at the title: 'Customer Return Policy Summary' — a customer return policy summary.
>
> Next to it is a label 'email' — indicating this is an email to be sent to customers.
>
> Leaf types include: email, tweet, weibo, wechat, article, deploy_agent (deploy to AI customer service)...
>
> **Leaf's purpose is: generate specific format, specific purpose content based on existing knowledge.**
>
> **[Point to Source Context area]**
>
> The area above is **knowledge source**.
>
> Shows '3 constraints highlighted' — 3 constraints are highlighted.
>
> Expanded, this is the content from our earlier return policy conversation. Notice some words are **highlighted in green** — '30 days', 'standard return policy'.
>
> These highlighted words are **the source of constraints**.
>
> **[Point to MUST HAVE area]**
>
> Below is the constraint list.
>
> **MUST HAVE (2)** — content that must be included:
> - '30 days' — the generated email must mention 30 days
> - 'defective' — must mention the defective items policy
>
> **MUST NOT HAVE (1)** — content that absolutely cannot appear:
> - 'competitor' — cannot mention any competitors in the email
>
> **[Pause, emphasize]**
>
> **This is the fundamental difference between T3X and regular AI systems.**
>
> What do regular AI systems do? Give AI a prompt: 'Please remember our return policy is 30 days, please don't mention competitors.'
>
> AI receives it, but it only 'tries' to comply. Sometimes it forgets, sometimes it confuses, sometimes it 'gets creative.'
>
> **You have no means to enforce it.**
>
> What does T3X do?
>
> 1. First generate content
> 2. **Automatically validate after generation** — check if the generated content includes '30 days', includes 'defective', and (accidentally) includes 'competitor'
> 3. If validation fails, **the system rejects this output** and tells you which constraint wasn't met
>
> **This isn't 'hoping' AI complies, it's 'enforcing' AI must comply.**
>
> **[Point to Generate & Verify button]**
>
> Click this button, the system generates email content and immediately validates all constraints. If any one isn't met, a red warning appears next to it.
>
> **[Point to Re-validate button]**
>
> If you manually modify the generated content, click this button to re-validate.
>
> **[Point to Export button]**
>
> After validation passes, you can export for use — send email, publish to customer service system, or anywhere else."

### Technical Supplement (If Audience Is Interested)

> "Technically, our constraint validation has two modes:
>
> **Exact (exact match)** — checks if the generated content contains the exact same string. For example, '30 days' must appear unchanged.
>
> **Semantic (semantic match)** — checks if the generated content expresses the same meaning. For example, '30 days' and 'thirty days' and 'a month' are semantically equivalent.
>
> Semantic matching uses embedding vector comparison with similarity threshold control.
>
> These two modes can be configured separately for different constraints. For example, legal terms and amounts use exact matching, general descriptions use semantic matching."

### Business Value Emphasis

> "What's Leaf node's business value?
>
> **Compliance and risk control.**
>
> Financial, healthcare, education industries have strict regulatory requirements for AI output content. Can't say wrong things, can't mislead, can't have controversial content.
>
> With Leaf's constraint mechanism, enterprises can **convert regulatory requirements into constraints** for automatic system validation.
>
> Every output has a validation record that can serve as compliance audit evidence.
>
> **This is the core value we present to enterprise customers — transforming AI from an 'uncontrollable black box' to an 'auditable white box.'**"

---

## Part 7: Fifth Stop — Agent Demo Chat (Real Scenario)

### Steps
1. Click the **robot icon** in the left navigation
2. Enter the Support Bot chat page

### Interface Description
- Top: Bot name (Support Bot), deployment version (Deployed: v1), Agent Optimiser button
- Middle: Chat area showing "Start a conversation"
- Bottom: Message input box and send button

### Script

> "Everything we've covered has been the 'management side' — how to manage knowledge, how to set constraints.
>
> Now let's look at the 'user side' — what the actual AI customer service looks like.
>
> **[Point to page]**
>
> This is a customer service bot called 'Support Bot.'
>
> The top shows 'Deployed: v1 (9f2c3d)' — the current production environment is running version v1, commit hash is 9f2c3d.
>
> **This version number is very important.**
>
> Traditional AI systems, you ask 'what version is running online' — nobody knows. Prompts get changed constantly, no version control.
>
> Every change in T3X has a version number, just like software releases — v1, v2, v3...
>
> If v2 has problems, you can immediately **roll back to v1**.
>
> **[Demonstrate conversation]**
>
> Let me send a message to try.
>
> (Type) 'What is your return policy?'
>
> (Wait for response)
>
> Look, the bot responded. It answers based on the knowledge we set up earlier — 30-day returns, 90 days for defective items...
>
> **[Point to rating feature if available]**
>
> Next to each response is a rating feature — 1 to 5 stars.
>
> This isn't decoration, it's a **feedback collection mechanism**.
>
> Operations or testers can rate each response. Low-rated responses get collected for subsequent optimization.
>
> This leads us to the next feature — Agent Optimiser."

---

## Part 8: Sixth Stop — Agent Optimiser (Automatic Optimization Loop)

### Steps
1. Click the "Agent Optimiser" button in the top right
2. Enter the optimizer page

### Interface Description
- Left card - Feedback Summary:
  - Conversations: Total conversation count
  - Avg Rating: Average rating
  - Low (1-2★): Low rating count
  - Bottom description: "Feedback from Chat page is used for prompt optimisation"
- Left card - Optimisation Loop:
  - Flowchart: Collect feedback → Propose new prompt → Auto commit on sandbox → Review and deploy
  - Run Optimisation button
- Middle card - Sandbox Commits: Sandbox version list
- Right card - Deployments: Deployment history

### Script

> "This is T3X's **automatic optimization engine** — Agent Optimiser.
>
> **[Point to Feedback Summary]**
>
> On the left is feedback statistics:
> - Conversations: How many conversations collected in total
> - Avg Rating: What's the average rating
> - Low (1-2★): How many low-rated responses
>
> Where does this data come from? It's from the ratings on the Chat page.
>
> **[Point to Optimisation Loop]**
>
> Below is the optimization process, in four steps:
>
> **Step 1: Collect feedback**
>
> The system automatically collects all low-rated responses (1-2 stars), analyzing why users were dissatisfied.
>
> **Step 2: Propose new prompt**
>
> Based on collected issues, AI **automatically analyzes problem patterns** and proposes improvements.
>
> For example, if users frequently ask about delivery times but the bot's answers are always too vague. The system will suggest: 'Add detailed delivery time information to the prompt.'
>
> **Step 3: Auto commit on sandbox**
>
> New prompts don't go live directly, but are first saved to a **sandbox environment** for testing.
>
> **Step 4: Review and deploy**
>
> Operations personnel review sandbox test results, and only after confirming no issues do they formally deploy to production.
>
> **[Point to Run Optimisation button]**
>
> Clicking this button triggers an optimization round. But it currently shows 'Rate at least one response in Chat to enable' — need to rate at least one response on the Chat page first.
>
> **[Point to Sandbox Commits]**
>
> The middle section is the sandbox version list.
>
> Shows 'v1-sandbox', status is 'deployed' — meaning this version has been deployed from sandbox to production.
>
> Below is the description: 'Initial prompt – baseline customer support'.
>
> **[Point to Deployments]**
>
> On the right is deployment history.
>
> 'v1' version, status 'succeeded', time 'Nov 28, 10:05 AM'.
>
> Every deployment has a record — who deployed, when, which version.
>
> **[Summarize this feature]**
>
> What problem does this feature solve?
>
> **Sustainable iteration.**
>
> Traditional approach: AI made a mistake → Operations manually modifies prompt → After modification don't know if it works → New problems appear in a few days → Keep modifying...
>
> No closed loop, no accumulation, after all the modifications don't know which version is best.
>
> T3X's approach:
>
> Automatic feedback collection → Automatic problem analysis → Automatic improvement proposals → Automatic sandbox testing → Manual review then deploy → Continue collecting feedback after deployment...
>
> **This is a complete closed loop. Every improvement is data-driven, every version has traceable records.**"

---

## Part 9: Seventh Stop — Deploy & Monitor (Enterprise-Grade Control)

### Steps
1. Click the **rocket icon** in the left navigation
2. Enter the Deploy & Monitor page

### Interface Description
- Top right: Runner Connected status (green)
- Deploy Agents card: Registered Agent list, Add Agent button
- Quick E2E Test card:
  - Agent selection dropdown
  - Prompt Version selection
  - Prompt Preview area

### Script

> "The last feature — Deploy and Monitor.
>
> **[Point to Runner Connected]**
>
> The green 'Runner Connected' in the top right indicates the **evaluation engine** is connected.
>
> What's the evaluation engine? It's a service specifically for running automated tests.
>
> **[Point to Deploy Agents area]**
>
> Here is the registered Agent list. Currently shows 'No deploy agents registered' — no Agents registered yet.
>
> Click 'Add Agent' to add one. You need to fill in the Agent's name and **service address** — where the Agent is deployed.
>
> After registration, you can remotely manage this Agent — update prompts, run tests, view logs...
>
> **[Point to Quick E2E Test area]**
>
> Below is quick end-to-end testing.
>
> Agent dropdown — select which Agent to test
>
> Prompt Version dropdown — shows 'V1 (Baseline)', can select different prompt versions
>
> Prompt Preview — preview current prompt content
>
> The prompt shown here is: 'You are a comprehensive weather research assistant. For ANY weather question, you MUST: 1. First use SearchTool to find background information about the location. 2. Then use WeatherTool to get current weather data. 3. Use CalculatorTool if any numbers need conversion or calculation. Always gather information from multiple sources before answering.'
>
> This is a sample prompt defining the Agent's behavioral specifications — which tools to use, in what order.
>
> **[Explain enterprise value]**
>
> What's the significance of this feature for enterprises?
>
> **Unified control.**
>
> Large enterprises might have dozens or hundreds of AI Agents — customer service, sales, technical support, internal Q&A...
>
> Each Agent has its own prompts, its own knowledge base, its own behavioral specifications.
>
> Without a unified management platform, it becomes 'everyone doing their own thing' — who changed what, what's the current status, which version has problems — nobody knows.
>
> What T3X provides is **centralized Agent management**:
> - All Agents registered in one place
> - All version changes have records
> - All test results are traceable
> - Problems can be quickly located and rolled back
>
> **This is enterprise-grade AI governance capability.**"

---

## Part 10: Closing Summary

### Script

> "Alright, that concludes the demo. Let me summarize the core problems T3X solves and its value.
>
> **[Hold up three fingers]**
>
> I opened with three problems with enterprise AI:
>
> **First, knowledge is untraceable.**
>
> T3X's solution — **Commit system**. Every piece of knowledge has source evidence, traceable to the original conversation.
>
> **Second, outputs are uncontrollable.**
>
> T3X's solution — **Leaf constraint system**. Not 'hoping' AI complies, but 'enforced' validation.
>
> **Third, iteration is unsustainable.**
>
> T3X's solution — **Optimiser closed loop**. Feedback collection → Automatic analysis → Sandbox testing → Review and deploy.
>
> **[Pause]**
>
> One sentence summary:
>
> **T3X upgrades enterprise AI knowledge management from 'craft workshop' to 'industrial production.'**
>
> Just like Git changed software development 20 years ago, T3X aims to change knowledge management for the AI era.
>
> How big is this market?
>
> According to Gartner predictions, by 2025, 75% of enterprises will use generative AI in production environments.
>
> Every company using AI needs to solve knowledge management problems.
>
> **This is T3X's opportunity.**"

---

## Part 11: Q&A Preparation

### Business Questions

**Q: Who are your competitors?**

> "Functionally, we have several types of potential competitors:
>
> 1. **RAG platforms** (like LangChain, LlamaIndex) — but they're development frameworks, not products, requiring heavy customization
>
> 2. **Knowledge base tools** (like Notion AI, Confluence) — but they don't have constraint validation or version control
>
> 3. **AI monitoring tools** (like Galileo, Arize) — but they only do monitoring, not knowledge management
>
> T3X's differentiator is **end-to-end** — from knowledge extraction, to constraint setting, to version management, to automatic optimization, it's a complete closed loop."

**Q: What's your business model?**

> "We're currently considering a **SaaS subscription model**:
>
> - **Free tier**: Single project, limited storage
> - **Team tier**: Multiple projects, team collaboration, API access
> - **Enterprise tier**: Private deployment, SSO, audit logs, dedicated support
>
> Pricing references similar Git hosting services (GitHub, GitLab) — priced by team size + usage."

**Q: Who are your customers?**

> "Our target customers are **medium to large enterprises already using or planning to use generative AI**, especially:
>
> - Industries with compliance requirements: Finance, healthcare, education, government
> - Companies with heavy customer service scenarios: E-commerce, airlines, telecom, banking
> - Tech companies with multi-Agent management needs
>
> What these customers have in common is: **rigid requirements for AI output accuracy and controllability.**"

### Technical Questions

**Q: What's your tech stack?**

> "Frontend is **Next.js 16**, using App Router architecture.
>
> Backend is **Hono** (a lightweight Node.js framework), supporting OpenAPI specification.
>
> Database is **PostgreSQL**. Local development uses PGLite (PostgreSQL WASM version), production can use any PostgreSQL-compatible database.
>
> The core semantic extraction algorithm is **pure TypeScript implementation**, doesn't rely on large models, ensuring determinism.
>
> The entire project is **Monorepo** architecture, managed by Turborepo."

**Q: What's the accuracy of constraint validation?**

> "Exact matching is 100% — it's string comparison, no margin for error.
>
> Semantic matching we've tested internally at above 95% accuracy, using the text-embedding-3-large model.
>
> And the semantic matching threshold is configurable — if customers have especially high accuracy requirements, they can raise the threshold (stricter), correspondingly recall rate will decrease."

**Q: How do you ensure system reliability?**

> "Several aspects:
>
> 1. **Core algorithms are deterministic** — same input always produces same output, no AI randomness issues
>
> 2. **Data is append-only** — all records only add, never modify, like blockchain hash chains, any tampering can be detected
>
> 3. **Complete test coverage** — unit tests, integration tests, E2E tests, CI/CD runs automatically
>
> 4. **Private deployment supported** — enterprises can deploy the entire system on their own servers, data doesn't leave the intranet"

---

## Part 12: Demo Checklist

Pre-demo confirmation:

- [ ] WebUI running normally (localhost:3000)
- [ ] API running normally (localhost:8000)
- [ ] Demo data exists (at least 1 project, 2 conversations, 1 Commit, 1 Leaf)
- [ ] Agent Demo has deployed version
- [ ] Insights page can display Commit cards normally
- [ ] Network stable, pages load smoothly
- [ ] Prepared to handle "Loading..." situations (if page loads slowly, can skip)

During demo notes:

- Moderate speaking pace, give audience time to digest
- When explaining each concept, point mouse to corresponding UI elements
- Use analogies frequently (Git, code versions, exam highlighting...)
- Interweave business value and technical implementation, don't just talk tech
- Reserve time for questions

---

## Appendix: Key Concepts Quick Reference

| Concept | One-sentence Explanation | Analogy |
|---------|-------------------------|---------|
| **Commit** | Structured knowledge extracted from conversations | Git code commits |
| **Branch** | Parallel versions of knowledge | Git branches |
| **Leaf** | Specific applications generated from knowledge (emails, scripts, etc.) | Generating documents from templates |
| **Constraint** | Mandatory constraints on AI output | Contract clauses |
| **Pin** | Mark important knowledge for AI to prioritize remembering | Browser bookmarks |
| **Sandbox** | Testing environment that doesn't affect production | Software staging environment |
| **Optimiser** | Automatically analyze feedback, optimize prompts | Software automated testing |

---

*Last updated: 2026-02-04*
