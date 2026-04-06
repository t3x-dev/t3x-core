'use client';

/**
 * Test page for SourceContextView component
 *
 * Allows manual verification of:
 * - Compact vs expanded modes
 * - Loading and error states
 * - Different highlight colors
 * - Expand/collapse functionality
 *
 * Access at: http://localhost:3000/test-source-context
 */

import { useState } from 'react';

import { SourceContextView } from '@/components/source-context/SourceContextView';
import type { TurnContextData } from '@/types/merge';

// Mock data for testing without API
const mockContextData: TurnContextData = {
  target_turn: {
    turn_hash: 'sha256:mock123',
    parent_turn_hash: null,
    project_id: 'proj_test',
    conversation_id: 'conv_test',
    role: 'assistant',
    content:
      'The system uses OAuth 2.0 for authentication, which provides secure delegated access. Rate limiting is set to 100 requests per minute to prevent abuse. All API endpoints require a valid JWT token in the Authorization header. The token expiration is configurable but defaults to 24 hours. For production environments, we recommend using shorter expiration times and implementing token refresh mechanisms.',
    created_at: new Date().toISOString(),
    is_target: true,
    highlight: { start: 16, end: 25 },
  },
  context: [],
  conversation_id: 'conv_test',
  conversation_title: 'API Integration Discussion',
};

const shortMockData: TurnContextData = {
  target_turn: {
    turn_hash: 'sha256:mock456',
    parent_turn_hash: null,
    project_id: 'proj_test',
    conversation_id: 'conv_test',
    role: 'user',
    content: 'Please explain OAuth 2.0 authentication flow.',
    created_at: new Date().toISOString(),
    is_target: true,
  },
  context: [],
  conversation_id: 'conv_test',
  conversation_title: 'Quick Question',
};

export default function TestSourceContextPage() {
  const [showLoading, setShowLoading] = useState(false);
  const [showError, setShowError] = useState(false);

  return (
    <div className="container mx-auto p-8 max-w-4xl">
      <h1 className="text-2xl font-bold mb-[var(--space-section)]">SourceContextView Test Page</h1>
      <p className="text-muted-foreground mb-8">
        This page demonstrates the SourceContextView component in various states.
      </p>

      {/* Controls */}
      <div className="flex gap-[var(--space-group)] mb-8 p-[var(--space-group)] bg-muted rounded-lg">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={showLoading}
            onChange={(e) => setShowLoading(e.target.checked)}
            className="rounded"
          />
          <span className="text-sm">Show Loading State</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={showError}
            onChange={(e) => setShowError(e.target.checked)}
            className="rounded"
          />
          <span className="text-sm">Show Error State</span>
        </label>
      </div>

      <div className="space-y-8">
        {/* Section 1: Compact Mode (Yellow - Merge Style) */}
        <section className="border rounded-lg p-[var(--space-group)]">
          <h2 className="text-lg font-semibold mb-[var(--space-item)]">
            1. Compact Mode - Yellow Highlight (Merge Style)
          </h2>
          <p className="text-sm text-muted-foreground mb-[var(--space-group)]">
            Default compact mode with truncated content and yellow highlight. Click &quot;Show more
            context&quot; to expand.
          </p>
          <div className="bg-card border rounded p-3">
            <SourceContextView
              turnHash="sha256:mock123"
              highlightStart={16}
              highlightEnd={25}
              mode="compact"
              highlightColor="yellow"
              contextData={mockContextData}
              autoFetch={false}
              loading={showLoading}
              error={showError ? 'Failed to load context: Network error' : undefined}
            />
          </div>
        </section>

        {/* Section 2: Compact Mode (Green - Commit Style) */}
        <section className="border rounded-lg p-[var(--space-group)]">
          <h2 className="text-lg font-semibold mb-[var(--space-item)]">
            2. Compact Mode - Green Highlight (Commit Style)
          </h2>
          <p className="text-sm text-muted-foreground mb-[var(--space-group)]">
            Same content with green highlight color for commit display.
          </p>
          <div className="bg-card border rounded p-3">
            <SourceContextView
              turnHash="sha256:mock123"
              highlightStart={16}
              highlightEnd={25}
              mode="compact"
              highlightColor="green"
              contextData={mockContextData}
              autoFetch={false}
            />
          </div>
        </section>

        {/* Section 3: Expanded Mode */}
        <section className="border rounded-lg p-[var(--space-group)]">
          <h2 className="text-lg font-semibold mb-[var(--space-item)]">
            3. Expanded Mode - Full Content
          </h2>
          <p className="text-sm text-muted-foreground mb-[var(--space-group)]">
            Full content displayed without truncation. Can collapse back.
          </p>
          <div className="bg-card border rounded p-3">
            <SourceContextView
              turnHash="sha256:mock123"
              highlightStart={16}
              highlightEnd={25}
              mode="expanded"
              highlightColor="yellow"
              contextData={mockContextData}
              autoFetch={false}
            />
          </div>
        </section>

        {/* Section 4: Short Content (No expand button) */}
        <section className="border rounded-lg p-[var(--space-group)]">
          <h2 className="text-lg font-semibold mb-[var(--space-item)]">
            4. Short Content - No Expand Button
          </h2>
          <p className="text-sm text-muted-foreground mb-[var(--space-group)]">
            Content shorter than threshold shows without expand/collapse button.
          </p>
          <div className="bg-card border rounded p-3">
            <SourceContextView
              turnHash="sha256:mock456"
              mode="compact"
              highlightColor="yellow"
              contextData={shortMockData}
              autoFetch={false}
            />
          </div>
        </section>

        {/* Section 5: Without Header */}
        <section className="border rounded-lg p-[var(--space-group)]">
          <h2 className="text-lg font-semibold mb-[var(--space-item)]">5. Without Header</h2>
          <p className="text-sm text-muted-foreground mb-[var(--space-group)]">
            Content displayed without conversation header.
          </p>
          <div className="bg-card border rounded p-3">
            <SourceContextView
              turnHash="sha256:mock123"
              highlightStart={16}
              highlightEnd={25}
              mode="compact"
              highlightColor="yellow"
              contextData={mockContextData}
              autoFetch={false}
              showHeader={false}
            />
          </div>
        </section>

        {/* Section 6: With Jump Link */}
        <section className="border rounded-lg p-[var(--space-group)]">
          <h2 className="text-lg font-semibold mb-[var(--space-item)]">6. With Jump Link</h2>
          <p className="text-sm text-muted-foreground mb-[var(--space-group)]">
            Shows &quot;Jump to conversation&quot; link in header.
          </p>
          <div className="bg-card border rounded p-3">
            <SourceContextView
              turnHash="sha256:mock123"
              highlightStart={16}
              highlightEnd={25}
              mode="compact"
              highlightColor="yellow"
              contextData={mockContextData}
              autoFetch={false}
              showJumpLink={true}
              onJumpClick={(convId) => alert(`Jump to conversation: ${convId}`)}
            />
          </div>
        </section>

        {/* Section 7: Missing Turn Hash */}
        <section className="border rounded-lg p-[var(--space-group)]">
          <h2 className="text-lg font-semibold mb-[var(--space-item)]">7. Missing Turn Hash</h2>
          <p className="text-sm text-muted-foreground mb-[var(--space-group)]">
            Shows &quot;unavailable&quot; state when turnHash is empty.
          </p>
          <div className="bg-card border rounded p-3">
            <SourceContextView turnHash="" mode="compact" highlightColor="yellow" />
          </div>
        </section>

        {/* Section 8: No Context Data */}
        <section className="border rounded-lg p-[var(--space-group)]">
          <h2 className="text-lg font-semibold mb-[var(--space-item)]">8. No Context Data</h2>
          <p className="text-sm text-muted-foreground mb-[var(--space-group)]">
            Returns null when contextData is null (nothing rendered).
          </p>
          <div className="bg-card border rounded p-3 min-h-[40px] flex items-center justify-center text-muted-foreground text-sm">
            <SourceContextView
              turnHash="sha256:mock123"
              mode="compact"
              highlightColor="yellow"
              contextData={null}
              autoFetch={false}
            />
            {/* Fallback text shown when component returns null */}
            <span className="italic">(Component returns null - nothing rendered)</span>
          </div>
        </section>

        {/* Section 9: Different Compact Chars */}
        <section className="border rounded-lg p-[var(--space-group)]">
          <h2 className="text-lg font-semibold mb-[var(--space-item)]">
            9. Custom Compact Chars (100)
          </h2>
          <p className="text-sm text-muted-foreground mb-[var(--space-group)]">
            Shows more context around highlight with compactChars=100.
          </p>
          <div className="bg-card border rounded p-3">
            <SourceContextView
              turnHash="sha256:mock123"
              highlightStart={16}
              highlightEnd={25}
              mode="compact"
              compactChars={100}
              highlightColor="yellow"
              contextData={mockContextData}
              autoFetch={false}
            />
          </div>
        </section>

        {/* Section 10: Comparison - Side by Side */}
        <section className="border rounded-lg p-[var(--space-group)]">
          <h2 className="text-lg font-semibold mb-[var(--space-item)]">
            10. Side-by-Side Comparison
          </h2>
          <p className="text-sm text-muted-foreground mb-[var(--space-group)]">
            Yellow (merge) vs Green (commit) highlight colors.
          </p>
          <div className="grid grid-cols-2 gap-[var(--space-group)]">
            <div className="bg-card border rounded p-3">
              <h3 className="text-sm font-medium mb-[var(--space-item)]">Merge Style (Yellow)</h3>
              <SourceContextView
                turnHash="sha256:mock123"
                highlightStart={16}
                highlightEnd={25}
                mode="compact"
                highlightColor="yellow"
                contextData={mockContextData}
                autoFetch={false}
              />
            </div>
            <div className="bg-card border rounded p-3">
              <h3 className="text-sm font-medium mb-[var(--space-item)]">Commit Style (Green)</h3>
              <SourceContextView
                turnHash="sha256:mock123"
                highlightStart={16}
                highlightEnd={25}
                mode="compact"
                highlightColor="green"
                contextData={mockContextData}
                autoFetch={false}
              />
            </div>
          </div>
        </section>
      </div>

      {/* Notes */}
      <div className="mt-8 p-[var(--space-group)] bg-[var(--status-info-muted)] rounded-lg">
        <h3 className="font-semibold mb-[var(--space-item)]">Testing Notes</h3>
        <ul className="text-sm space-y-1 text-muted-foreground">
          <li>- Toggle checkboxes above to simulate loading/error states</li>
          <li>- Click &quot;Show more context&quot; to expand truncated content</li>
          <li>- Click &quot;Show less&quot; to collapse back</li>
          <li>- All examples use mock data (autoFetch=false)</li>
          <li>- To test real API fetch, set a valid turnHash and remove contextData prop</li>
        </ul>
      </div>
    </div>
  );
}
