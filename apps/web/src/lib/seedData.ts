/**
 * Demo Seed Data — "AI Travel Planner" project
 *
 * Provides a complete project with conversations, commits, a leaf, and
 * a branch structure for the onboarding demo flow.
 */

export const demoSeedData = {
  project: {
    id: 'proj_demo_travel',
    name: 'AI Travel Planner — Demo',
    description:
      'A sample project demonstrating T3X semantic version control with travel planning conversations.',
  },

  conversations: [
    {
      id: 'conv_travel_pref',
      title: 'Travel Preferences',
      turns: [
        {
          role: 'user' as const,
          content: 'What are your travel priorities when planning a vacation?',
          created_at: '2025-12-01T10:00:00Z',
        },
        {
          role: 'assistant' as const,
          content:
            'Great question! Based on common travel planning factors, the key priorities to consider are: budget constraints, preferred destinations (beach, mountain, city), travel dates flexibility, group size, and activity preferences. Would you like me to help narrow these down?',
          created_at: '2025-12-01T10:00:30Z',
        },
        {
          role: 'user' as const,
          content:
            'I prefer budget-friendly beach destinations. Flexible on dates but ideally in spring. Traveling as a couple.',
          created_at: '2025-12-01T10:01:00Z',
        },
        {
          role: 'assistant' as const,
          content:
            'Perfect! For budget-friendly spring beach trips for couples, I recommend considering Southeast Asia (Thailand, Vietnam), Portugal (Algarve), or Mexico (Tulum). These offer great value with beautiful beaches. Shall I compare these options in detail?',
          created_at: '2025-12-01T10:01:30Z',
        },
      ],
    },
    {
      id: 'conv_accommodation',
      title: 'Accommodation Needs',
      turns: [
        {
          role: 'user' as const,
          content: 'What type of accommodation should we look for?',
          created_at: '2025-12-02T14:00:00Z',
        },
        {
          role: 'assistant' as const,
          content:
            'For a couple on a budget beach trip, the best options are: boutique guesthouses (local charm, $30-60/night), Airbnb apartments (kitchen access, more space), or eco-lodges (sustainable, unique experience). All are significantly cheaper than resort hotels.',
          created_at: '2025-12-02T14:00:30Z',
        },
        {
          role: 'user' as const,
          content:
            'We need good WiFi for remote work, a quiet area, and ideally walking distance to the beach.',
          created_at: '2025-12-02T14:01:00Z',
        },
        {
          role: 'assistant' as const,
          content:
            'For remote-work-friendly beach stays, prioritize: verified high-speed WiFi (check reviews), co-working cafes nearby, quiet residential areas within 10-min walk to beach. Platforms like Nomadlist and Workfrom can help identify digital-nomad-friendly spots.',
          created_at: '2025-12-02T14:01:30Z',
        },
      ],
    },
  ],

  commits: [
    {
      hash: 'sha256:demo_commit_main_001',
      branch: 'main',
      message: 'Extract travel preferences from initial conversation',
      nodes: [
        {
          id: 's_demo_01',
          text: 'User prefers budget-friendly accommodations under $60 per night.',
          confidence: 0.92,
        },
        {
          id: 's_demo_02',
          text: 'Beach destinations are the highest priority for this trip.',
          confidence: 0.95,
        },
        {
          id: 's_demo_03',
          text: 'Travel dates are flexible but spring season is preferred.',
          confidence: 0.88,
        },
        {
          id: 's_demo_04',
          text: 'Traveling as a couple — group size of two.',
          confidence: 0.97,
        },
        {
          id: 's_demo_05',
          text: 'Recommended destinations include Thailand, Portugal (Algarve), and Mexico (Tulum).',
          confidence: 0.85,
        },
      ],
    },
    {
      hash: 'sha256:demo_commit_accom_001',
      branch: 'accommodation',
      message: 'Extract accommodation requirements',
      nodes: [
        {
          id: 's_demo_06',
          text: 'Reliable high-speed WiFi is essential for remote work.',
          confidence: 0.94,
        },
        {
          id: 's_demo_07',
          text: 'Accommodation should be in a quiet area within walking distance to the beach.',
          confidence: 0.91,
        },
        {
          id: 's_demo_08',
          text: 'Boutique guesthouses and Airbnb apartments are preferred over resort hotels.',
          confidence: 0.89,
        },
        {
          id: 's_demo_09',
          text: 'Digital-nomad-friendly locations with co-working cafes nearby are ideal.',
          confidence: 0.86,
        },
      ],
    },
  ],

  leaves: [
    {
      id: 'leaf_demo_article',
      type: 'article' as const,
      title: 'Budget Beach Trip Guide',
      commit_hash: 'sha256:demo_commit_main_001',
      constraints: [
        {
          id: 'cst_demo_01',
          type: 'require' as const,
          match_mode: 'semantic' as const,
          value: 'Must mention budget range under $60/night',
        },
        {
          id: 'cst_demo_02',
          type: 'require' as const,
          match_mode: 'semantic' as const,
          value: 'Include at least two destination recommendations',
        },
      ],
    },
  ],
} as const;
