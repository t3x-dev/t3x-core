import { create } from 'zustand';

// Chat message type
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  rating?: number; // 1-5 star rating for assistant messages
}

// Sandbox prompt commit
export interface SandboxCommit {
  id: string;
  version: number;
  commitHash: string;
  content: string;
  description: string;
  createdAt: string;
  feedbackBatchId: number;
}

// Deployment record
export interface DeploymentRecord {
  id: string;
  timestamp: string;
  environment: string;
  commitHash: string;
  version: number;
  triggerSource: string;
  status: 'succeeded' | 'failed' | 'pending';
}

// Feedback summary
export interface FeedbackSummary {
  conversationCount: number;
  averageRating: number;
  lowRatingCount: number; // 1-2 stars
  totalRatings: number;
}

// Agent Demo state
interface AgentDemoState {
  // Agent info
  agentName: string;
  sandboxBranch: string;

  // Deployed version (used by Chat page)
  deployedVersion: number;
  deployedCommitHash: string;

  // Sandbox head (latest on sandbox branch)
  sandboxHeadVersion: number;
  sandboxHeadCommitHash: string;

  // Sandbox commit history
  sandboxCommits: SandboxCommit[];

  // Deployment history
  deploymentHistory: DeploymentRecord[];

  // Chat state
  messages: ChatMessage[];
  isTyping: boolean;

  // Feedback tracking
  feedbackSummary: FeedbackSummary;
  currentFeedbackBatch: number;

  // Optimization state
  isOptimizing: boolean;

  // Actions
  sendMessage: (content: string) => void;
  rateMessage: (messageId: string, rating: number) => void;
  resetConversation: () => void;
  runOptimisation: () => Promise<void>;
  deployCommit: (commitHash: string) => Promise<void>;
  getDeployedPrompt: () => SandboxCommit | undefined;
  getSandboxCommit: (commitHash: string) => SandboxCommit | undefined;
}

// Generate unique IDs
const generateId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
const generateCommitHash = () => Math.random().toString(36).slice(2, 8);

const formatTime = () => {
  const now = new Date();
  return now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
};

const formatDateTime = () => {
  const now = new Date();
  return now.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

// Initial prompt for the customer support bot
const initialPrompt = `You are a helpful customer support assistant for TechFlow, a software company. Your role is to:

1. Greet customers warmly and professionally
2. Listen to their concerns and questions carefully
3. Provide accurate and helpful information about our products
4. Escalate complex issues to human agents when necessary
5. Always maintain a positive and empathetic tone

Key product information:
- TechFlow Pro: Enterprise solution for workflow automation
- TechFlow Lite: Simplified version for small businesses
- TechFlow API: Developer tools for integration

Remember to:
- Be concise but thorough
- Offer specific solutions when possible
- Thank customers for their patience`;

// Sample responses based on common queries
const sampleResponses: Record<string, string[]> = {
  default: [
    "Thank you for reaching out! I'd be happy to help you today. Could you please tell me more about what you're looking for?",
    "Hi there! I'm here to assist you with any questions about TechFlow. What can I help you with?",
    'Hello! Welcome to TechFlow support. How may I assist you today?',
  ],
  pricing: [
    'Great question about pricing! TechFlow Pro starts at $99/month for teams up to 10 users. TechFlow Lite is $29/month for small teams. Would you like me to explain the features included in each plan?',
    "I'd be happy to help with pricing information! We offer flexible plans to fit different needs. TechFlow Lite starts at $29/month, while Pro is $99/month with advanced features. What size team are you working with?",
  ],
  technical: [
    "I understand you're experiencing a technical issue. Let me help troubleshoot this. Could you please describe what's happening in more detail? Any error messages you're seeing would be helpful.",
    'Thank you for reporting this technical concern. To better assist you, could you tell me: 1) What action were you trying to perform? 2) What happened instead? 3) Are you seeing any error messages?',
  ],
  features: [
    'TechFlow offers powerful workflow automation features! Key capabilities include: drag-and-drop workflow builder, 100+ integrations, real-time collaboration, and advanced analytics. Which area interests you most?',
    'Great question! Our platform includes workflow automation, team collaboration tools, custom integrations via API, and detailed reporting dashboards. Would you like me to dive deeper into any specific feature?',
  ],
  refund: [
    "I understand you'd like to discuss a refund. I'm sorry to hear our service didn't meet your expectations. Let me look into your account and see how we can help resolve this for you.",
    "Thank you for reaching out about a refund. We want to make sure you're satisfied. Could you share more about what led to this request? I'll do my best to find the right solution for you.",
  ],
};

// Generate a response based on user input
const generateResponse = (userMessage: string): string => {
  const lowerMessage = userMessage.toLowerCase();

  if (
    lowerMessage.includes('refund') ||
    lowerMessage.includes('money back') ||
    lowerMessage.includes('cancel')
  ) {
    return sampleResponses.refund[Math.floor(Math.random() * sampleResponses.refund.length)];
  }
  if (
    lowerMessage.includes('price') ||
    lowerMessage.includes('cost') ||
    lowerMessage.includes('plan')
  ) {
    return sampleResponses.pricing[Math.floor(Math.random() * sampleResponses.pricing.length)];
  }
  if (
    lowerMessage.includes('error') ||
    lowerMessage.includes('bug') ||
    lowerMessage.includes('issue') ||
    lowerMessage.includes('problem')
  ) {
    return sampleResponses.technical[Math.floor(Math.random() * sampleResponses.technical.length)];
  }
  if (
    lowerMessage.includes('feature') ||
    lowerMessage.includes('can') ||
    lowerMessage.includes('what')
  ) {
    return sampleResponses.features[Math.floor(Math.random() * sampleResponses.features.length)];
  }

  return sampleResponses.default[Math.floor(Math.random() * sampleResponses.default.length)];
};

// Generate optimized prompt description based on feedback
const generateOptimisationDescription = (
  avgRating: number,
  lowRatingCount: number,
  batchId: number
): string => {
  const improvements: string[] = [];

  if (avgRating < 3) {
    improvements.push('simplified technical language');
    improvements.push('added more clarifying questions');
  } else if (avgRating < 4) {
    improvements.push('better follow-up suggestions');
    improvements.push('more proactive assistance');
  } else {
    improvements.push('refined tone for excellence');
    improvements.push('added proactive tips');
  }

  if (lowRatingCount > 2) {
    improvements.push('improved refund handling tone');
  }

  return `Optimised from feedback batch #${batchId} – ${improvements.join(', ')}`;
};

// Generate optimized prompt content
const generateOptimizedPrompt = (
  currentPrompt: string,
  avgRating: number,
  lowRatingCount: number
): string => {
  const additions: string[] = [];

  if (avgRating < 3) {
    additions.push('- Ask clarifying questions before providing solutions');
    additions.push('- Use simpler, more accessible language');
  } else if (avgRating < 4) {
    additions.push('- Offer follow-up assistance proactively');
    additions.push('- Acknowledge customer frustration explicitly');
  } else {
    additions.push('- Provide proactive tips to prevent future issues');
    additions.push('- Express genuine appreciation for feedback');
  }

  if (lowRatingCount > 2) {
    additions.push('- For refund requests: Express empathy first, then explore solutions');
  }

  return `${currentPrompt}\n\nRecent optimisations:\n${additions.join('\n')}`;
};

// Initial sandbox commits
const initialCommitHash = '9f2c3d';
const initialSandboxCommits: SandboxCommit[] = [
  {
    id: 'commit-1',
    version: 1,
    commitHash: initialCommitHash,
    content: initialPrompt,
    description: 'Initial prompt – baseline customer support',
    createdAt: 'Nov 28, 10:00 AM',
    feedbackBatchId: 0,
  },
];

// Initial deployment
const initialDeployments: DeploymentRecord[] = [
  {
    id: 'deploy-1',
    timestamp: 'Nov 28, 10:05 AM',
    environment: 'Chat Demo',
    commitHash: initialCommitHash,
    version: 1,
    triggerSource: 'Initial setup',
    status: 'succeeded',
  },
];

export const useAgentDemoStore = create<AgentDemoState>((set, get) => ({
  agentName: 'Support Bot',
  sandboxBranch: 'agent-support/prompt-sandbox',

  deployedVersion: 1,
  deployedCommitHash: initialCommitHash,

  sandboxHeadVersion: 1,
  sandboxHeadCommitHash: initialCommitHash,

  sandboxCommits: initialSandboxCommits,
  deploymentHistory: initialDeployments,

  messages: [],
  isTyping: false,

  feedbackSummary: {
    conversationCount: 0,
    averageRating: 0,
    lowRatingCount: 0,
    totalRatings: 0,
  },
  currentFeedbackBatch: 1,

  isOptimizing: false,

  sendMessage: (content) => {
    const userMessage: ChatMessage = {
      id: generateId(),
      role: 'user',
      content,
      timestamp: formatTime(),
    };

    set((state) => ({
      messages: [...state.messages, userMessage],
      isTyping: true,
      feedbackSummary: {
        ...state.feedbackSummary,
        conversationCount: state.feedbackSummary.conversationCount + 1,
      },
    }));

    // Simulate AI response delay
    setTimeout(
      () => {
        const response = generateResponse(content);
        const assistantMessage: ChatMessage = {
          id: generateId(),
          role: 'assistant',
          content: response,
          timestamp: formatTime(),
        };

        set((state) => ({
          messages: [...state.messages, assistantMessage],
          isTyping: false,
        }));
      },
      800 + Math.random() * 800
    );
  },

  rateMessage: (messageId, rating) => {
    set((state) => {
      const updatedMessages = state.messages.map((msg) =>
        msg.id === messageId ? { ...msg, rating } : msg
      );

      // Calculate new feedback stats
      const ratedMessages = updatedMessages.filter((msg) => msg.rating !== undefined);
      const totalRatings = ratedMessages.length;
      const sumRatings = ratedMessages.reduce((sum, msg) => sum + (msg.rating || 0), 0);
      const avgRating = totalRatings > 0 ? sumRatings / totalRatings : 0;
      const lowRatingCount = ratedMessages.filter((msg) => (msg.rating || 0) <= 2).length;

      return {
        messages: updatedMessages,
        feedbackSummary: {
          ...state.feedbackSummary,
          averageRating: avgRating,
          lowRatingCount,
          totalRatings,
        },
      };
    });
  },

  resetConversation: () => {
    set({
      messages: [],
      isTyping: false,
    });
  },

  runOptimisation: async () => {
    const state = get();

    if (state.feedbackSummary.totalRatings < 1) {
      return;
    }

    set({ isOptimizing: true });

    // Simulate optimization process
    await new Promise((resolve) => setTimeout(resolve, 2500));

    const freshState = get();
    const currentHeadCommit = freshState.sandboxCommits.find(
      (c) => c.commitHash === freshState.sandboxHeadCommitHash
    );

    if (!currentHeadCommit) {
      set({ isOptimizing: false });
      return;
    }

    const newVersion = freshState.sandboxHeadVersion + 1;
    const newCommitHash = generateCommitHash();
    const batchId = freshState.currentFeedbackBatch;

    const newCommit: SandboxCommit = {
      id: `commit-${newVersion}`,
      version: newVersion,
      commitHash: newCommitHash,
      content: generateOptimizedPrompt(
        currentHeadCommit.content,
        freshState.feedbackSummary.averageRating,
        freshState.feedbackSummary.lowRatingCount
      ),
      description: generateOptimisationDescription(
        freshState.feedbackSummary.averageRating,
        freshState.feedbackSummary.lowRatingCount,
        batchId
      ),
      createdAt: formatDateTime(),
      feedbackBatchId: batchId,
    };

    set({
      sandboxCommits: [...freshState.sandboxCommits, newCommit],
      sandboxHeadVersion: newVersion,
      sandboxHeadCommitHash: newCommitHash,
      currentFeedbackBatch: batchId + 1,
      isOptimizing: false,
      // Reset feedback for next batch
      feedbackSummary: {
        conversationCount: 0,
        averageRating: 0,
        lowRatingCount: 0,
        totalRatings: 0,
      },
      messages: [],
    });
  },

  deployCommit: async (commitHash) => {
    const state = get();
    const commit = state.sandboxCommits.find((c) => c.commitHash === commitHash);

    if (!commit) {
      return;
    }

    // Create deployment record
    const deployment: DeploymentRecord = {
      id: generateId(),
      timestamp: formatDateTime(),
      environment: 'Chat Demo',
      commitHash: commit.commitHash,
      version: commit.version,
      triggerSource: 'Manual via Agent Optimiser',
      status: 'succeeded',
    };

    set({
      deployedVersion: commit.version,
      deployedCommitHash: commit.commitHash,
      deploymentHistory: [deployment, ...state.deploymentHistory],
    });
  },

  getDeployedPrompt: () => {
    const state = get();
    return state.sandboxCommits.find((c) => c.commitHash === state.deployedCommitHash);
  },

  getSandboxCommit: (commitHash) => {
    const state = get();
    return state.sandboxCommits.find((c) => c.commitHash === commitHash);
  },
}));
