/**
 * app/task/page.tsx — Task screen
 *
 * The core of the app. A single screen that renders two UIs:
 *   - Contribute: show a prompt, collect word + audio
 *   - Review: show an entry, collect a verdict
 *
 * The screen makes NO decisions about which task type to show.
 * It calls GET /next-task and renders whatever the scheduler returns.
 * This is the "frontend is dumb" principle in practice.
 *
 * Flow:
 *   mount → fetch first task → user responds → fetch next task → repeat
 *   No navigation between tasks. No confirmation screens.
 */

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/store/app';
import { useTask } from '@/hooks/useTask';
import { StatusBar } from '@/components/layout/StatusBar';
import { ContributeTask } from '@/components/contribute/ContributeTask';
import { ReviewTask } from '@/components/review/ReviewTask';
import { MilestoneCelebration } from '@/components/layout/MilestoneCelebration';

export default function TaskPage() {
  const router           = useRouter();
  const isInitialising   = useAppStore(s => s.isInitialising);
  const contributor      = useAppStore(s => s.contributor);

  const {
    task,
    isLoading,
    error,
    isSubmitting,
    milestone,
    clearMilestone,
    submitContribution,
    submitVerdict,
    skipTask,
    refreshTask,
  } = useTask();

  // Loading guard — same pattern as home page.
  useEffect(() => {
    if (!isInitialising && !contributor) {
      router.push('/onboarding');
    }
  }, [isInitialising, contributor, router]);

  // Fetch the first task once we know the contributor is set.
  useEffect(() => {
    if (contributor) {
      refreshTask();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contributor]);

  if (isInitialising) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-sm text-gray-400">Loading…</p>
      </div>
    );
  }

  if (!contributor) return null;

  const isSentenceTask = task?.taskType === 'contribute' && task.prompt.conceptType === 'sentence';

  // Header colour signals the current task mode.
  const headerBg = task?.taskType === 'review' ? 'bg-[#27500A]' : 'bg-[#0C447C]';
  const tagColor = task?.taskType === 'review' ? 'text-green-100' : 'text-blue-100';

  const chipText = task?.taskType === 'review'
    ? 'Review an entry'
    : isSentenceTask ? 'Translate a sentence' : 'Add a word';

  const headingText = task?.taskType === 'review'
    ? 'Is this correct?'
    : isSentenceTask ? 'How do you say this?' : 'What is this?';

  const subtitleText = task?.taskType === 'review'
    ? 'Listen and decide'
    : isSentenceTask ? 'Type the Dinka translation' : 'Type + record in Dinka';

  return (
    <div className="min-h-screen flex flex-col">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className={`${headerBg} text-white px-4 pt-4 pb-3 transition-colors`}>
        <div className={`inline-block text-xs bg-white/15 ${tagColor} px-2.5 py-0.5 rounded-full mb-2`}>
          {chipText}
        </div>
        <h1 className="text-lg font-medium">
          {headingText}
        </h1>
        <p className="text-xs text-white/55 mt-0.5">
          {subtitleText}
        </p>
      </header>

      {/* ── Status bar ──────────────────────────────────────────────────── */}
      <StatusBar />

      {/* ── Task content ────────────────────────────────────────────────── */}
      <main className="flex-1 px-4 pb-4">

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center h-40">
            <p className="text-sm text-gray-400">Loading next task…</p>
          </div>
        )}

        {/* Error */}
        {!isLoading && error && (
          <div className="mt-4 space-y-3">
            <div className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </div>
            <button
              onClick={refreshTask}
              className="w-full py-2.5 text-sm font-medium text-[#185FA5] border border-[#185FA5]/30 rounded-xl"
            >
              Try again
            </button>
          </div>
        )}

        {/* Contribute */}
        {!isLoading && !error && task?.taskType === 'contribute' && (
          <ContributeTask
            task={task}
            isSubmitting={isSubmitting}
            onSubmit={submitContribution}
            onSkip={skipTask}
            contributor={contributor}
          />
        )}

        {/* Review */}
        {!isLoading && !error && task?.taskType === 'review' && (
          <ReviewTask
            task={task}
            isSubmitting={isSubmitting}
            onSubmit={submitVerdict}
            contributor={contributor}
          />
        )}

      </main>

      {/* ── Milestone celebration overlay ───────────────────────────────── */}
      {milestone !== null && (
        <MilestoneCelebration milestone={milestone} onDismiss={clearMilestone} />
      )}

      {/* ── Back link ───────────────────────────────────────────────────── */}
      <div className="px-4 pb-safe pb-4">
        <button
          onClick={() => router.push('/')}
          className="w-full py-2 text-xs text-gray-400 text-center"
        >
          ← Back to home
        </button>
      </div>
    </div>
  );
}
