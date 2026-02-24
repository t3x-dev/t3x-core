'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { GitCommit, Leaf, Loader2, MessageSquare, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ShimmerButton } from '@/components/ui/shimmer-button';
import * as api from '@/lib/api';
import { scaleIn, staggerContainer, staggerItem } from '@/lib/motion';
import { demoSeedData } from '@/lib/seedData';
import { glass } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { useProjectStore } from '@/store/projectStore';

const STORAGE_KEY = 't3x-onboarding-seen';

const highlights = [
  {
    icon: MessageSquare,
    text: 'Capture knowledge from conversations',
  },
  {
    icon: GitCommit,
    text: 'Version and branch semantic content',
  },
  {
    icon: Leaf,
    text: 'Generate validated outputs',
  },
];

export function WelcomeModal() {
  const [open, setOpen] = useState(false);
  const [loadingDemo, setLoadingDemo] = useState(false);
  const router = useRouter();
  const prefersReducedMotion = useReducedMotion();
  const fetchProjects = useProjectStore((s) => s.fetchProjects);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const seen = localStorage.getItem(STORAGE_KEY);
    if (seen === null) {
      setOpen(true);
    }
  }, []);

  const dismiss = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setOpen(false);
  }, []);

  const handleCreateProject = useCallback(() => {
    dismiss();
    router.push('/');
  }, [dismiss, router]);

  const handleExploreDemo = useCallback(async () => {
    setLoadingDemo(true);
    try {
      const project = await api.createProject(demoSeedData.project.name, {
        description: demoSeedData.project.description,
        is_demo: true,
      });
      await fetchProjects();
      dismiss();
      router.push(`/project/${project.project_id}`);
    } catch {
      // Fallback: dismiss and go home
      dismiss();
      router.push('/');
    } finally {
      setLoadingDemo(false);
    }
  }, [dismiss, router, fetchProjects]);

  const motionProps = prefersReducedMotion
    ? { initial: { opacity: 1 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : scaleIn;

  const containerVariants = prefersReducedMotion ? { initial: {}, animate: {} } : staggerContainer;

  const itemVariants = prefersReducedMotion
    ? { initial: { opacity: 1 }, animate: { opacity: 1 } }
    : staggerItem;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.2 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-[var(--surface-app)]/80 backdrop-blur-[12px]"
        >
          <motion.div
            {...motionProps}
            className={cn(
              'relative flex flex-col items-center gap-6 rounded-2xl p-10 max-w-lg w-full mx-4',
              glass.cardBase,
              glass.highlight
            )}
          >
            {/* Dismiss Button */}
            <button
              type="button"
              onClick={dismiss}
              className="absolute right-4 top-4 rounded-lg p-1 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] transition-colors"
              aria-label="Close welcome dialog"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Logo */}
            <svg
              width="48"
              height="48"
              viewBox="0 0 64 64"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              role="img"
              aria-label="T3X Logo"
            >
              <defs>
                <radialGradient
                  id="welcomeLogoGradient"
                  cx="32"
                  cy="32"
                  r="28"
                  gradientUnits="userSpaceOnUse"
                >
                  <stop offset="0%" stopColor="#2563EB" />
                  <stop offset="12%" stopColor="#2563EB" />
                  <stop offset="40%" stopColor="#FB923C" />
                  <stop offset="100%" stopColor="#FFE2C6" />
                </radialGradient>
              </defs>
              <rect width="64" height="64" rx="14" fill="#020617" />
              <g
                fill="none"
                stroke="url(#welcomeLogoGradient)"
                strokeWidth="4.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M16 18 L32 28 L48 18" />
                <path d="M16 46 L32 36 L48 46" />
              </g>
            </svg>

            {/* Title */}
            <div className="text-center">
              <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Welcome to T3X</h1>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                Git for Meaning — version control for AI conversations
              </p>
            </div>

            {/* Highlights */}
            <motion.div
              variants={containerVariants}
              initial="initial"
              animate="animate"
              className="flex flex-col gap-3 w-full"
            >
              {highlights.map((item) => (
                <motion.div
                  key={item.text}
                  variants={itemVariants}
                  className="flex items-center gap-3 rounded-lg px-4 py-2.5 bg-[var(--hover-bg)]"
                >
                  <item.icon className="h-5 w-5 shrink-0 text-[var(--accent-commit)]" />
                  <span className="text-sm text-[var(--text-primary)]">{item.text}</span>
                </motion.div>
              ))}
            </motion.div>

            {/* CTAs */}
            <div className="flex flex-col items-center gap-3 w-full">
              <ShimmerButton
                onClick={handleCreateProject}
                className="w-full text-sm font-medium"
                shimmerColor="var(--accent-commit)"
                background="oklch(0.17 0.008 260 / 95%)"
              >
                Create Your First Project
              </ShimmerButton>

              <div className="flex flex-col items-center gap-1">
                <Button
                  variant="ghost"
                  onClick={handleExploreDemo}
                  disabled={loadingDemo}
                  className="text-sm gap-2"
                >
                  {loadingDemo && <Loader2 className="h-4 w-4 animate-spin" />}
                  {loadingDemo ? 'Creating demo...' : 'Explore Demo Project'}
                </Button>
                {!loadingDemo && (
                  <span className="text-xs text-[var(--text-tertiary)]">
                    Creates a sample project to explore
                  </span>
                )}
              </div>
            </div>

            {/* Footer hint */}
            <p className="text-xs text-[var(--text-tertiary)]">
              Press{' '}
              <kbd className="rounded border border-[var(--stroke-divider)] px-1.5 py-0.5 text-[10px] font-mono">
                ⌘K
              </kbd>{' '}
              anytime for commands
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
