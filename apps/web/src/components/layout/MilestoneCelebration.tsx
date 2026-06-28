'use client';

interface Props {
  milestone: number;
  onDismiss: () => void;
}

const LABELS: Record<number, { emoji: string; title: string; body: string }> = {
  1:    { emoji: '🌱', title: 'First word!',         body: 'You just made your first contribution to Thok. Every word counts.' },
  10:   { emoji: '🔥', title: '10 words!',            body: 'You\'ve contributed 10 words. You\'re helping build something real.' },
  50:   { emoji: '⭐', title: '50 words!',            body: 'Incredible. 50 words preserved for future generations.' },
  100:  { emoji: '🏆', title: '100 words!',           body: 'You\'ve hit 100 contributions. That\'s a real impact on language preservation.' },
  500:  { emoji: '🦁', title: '500 words!',           body: 'You are a true Guardian of the language. 500 words and counting.' },
  1000: { emoji: '👑', title: '1,000 words!',         body: 'One thousand words. You are a legend of this project.' },
};

export function MilestoneCelebration({ milestone, onDismiss }: Props) {
  const info = LABELS[milestone] ?? {
    emoji: '🎉',
    title: `${milestone} words!`,
    body:  'An incredible contribution to language preservation.',
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6"
      onClick={onDismiss}
    >
      <div
        className="bg-white rounded-2xl px-6 py-8 text-center space-y-3 w-full max-w-xs shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="text-5xl">{info.emoji}</div>
        <h2 className="text-xl font-bold text-gray-900">{info.title}</h2>
        <p className="text-sm text-gray-500 leading-relaxed">{info.body}</p>
        <button
          onClick={onDismiss}
          className="
            mt-2 w-full py-3 rounded-xl text-sm font-semibold
            bg-[#1B3A5C] text-white active:bg-[#152e4a] transition-colors
          "
        >
          Keep going →
        </button>
      </div>
    </div>
  );
}
