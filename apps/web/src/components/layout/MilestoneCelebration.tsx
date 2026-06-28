'use client';

import { useAppStore } from '@/store/app';

interface Props {
  milestone: number;
  onDismiss: () => void;
}

const LANGUAGE_NAMES: Record<string, string> = {
  dinka: 'Dinka',
  nuer:  'Nuer',
};

interface MilestoneInfo {
  emoji: string;
  title: string;
  body: string;
  shareMessage: (lang: string, name?: string) => string;
}

const LABELS: Record<number, MilestoneInfo> = {
  1: {
    emoji: '🌱',
    title: 'First word!',
    body:  'You just made your first contribution to Thok. Every word counts.',
    shareMessage: (lang, name) =>
      name
        ? `${name} just made their first contribution to save the ${lang} language on Thok! 🌱\n\nOur language is part of who we are. Every word recorded today is a word saved forever. Don't wait — start now.`
        : `I just made my first contribution to save the ${lang} language on Thok! 🌱\n\nOur language is part of who we are. Every word recorded today is a word saved forever. Don't wait — start now.`,
  },
  10: {
    emoji: '🔥',
    title: '10 words!',
    body:  'You\'ve contributed 10 words. You\'re helping build something real.',
    shareMessage: (lang, name) =>
      name
        ? `${name} just contributed 10 ${lang} words on Thok! 🔥\n\nEvery day our language loses speakers. ${name} is fighting back — one word at a time. Are you going to let them do it alone?\n\nJoin the mission:`
        : `I just contributed 10 ${lang} words on Thok! 🔥\n\nEvery day our language loses speakers. I am fighting back — one word at a time. Are you going to sit and watch our language disappear?\n\nJoin the mission:`,
  },
  50: {
    emoji: '⭐',
    title: '50 words!',
    body:  'Incredible. 50 words preserved for future generations.',
    shareMessage: (lang, name) =>
      name
        ? `${name} has contributed 50 ${lang} words on Thok! ⭐\n\n50 words that will never be lost. Our children deserve to inherit a living language. If not us, who? If not now, when?\n\nContribute:`
        : `I have contributed 50 ${lang} words on Thok! ⭐\n\n50 words that will never be lost. Our children deserve to inherit a living language. If not us, who? If not now, when?\n\nContribute:`,
  },
  100: {
    emoji: '🏆',
    title: '100 words!',
    body:  'You\'ve hit 100 contributions. That\'s a real impact on language preservation.',
    shareMessage: (lang, name) =>
      name
        ? `${name} just hit 100 ${lang} words on Thok! 🏆\n\nThis is what love for our language looks like. 100 words saved for our people forever. Don't let ${name} carry this alone — join them:\n\nBe part of it:`
        : `I just hit 100 ${lang} words on Thok! 🏆\n\nThis is what love for our language looks like. 100 words saved for our people forever. Our elders are watching. Our children are waiting.\n\nBe part of it:`,
  },
  500: {
    emoji: '🦁',
    title: '500 words!',
    body:  'You are a true Guardian of the language. 500 words and counting.',
    shareMessage: (lang, name) =>
      name
        ? `${name} is a Guardian of the ${lang} language — 500 words contributed on Thok! 🦁\n\nHalf a thousand words saved. Our ancestors would be proud. Our language will not die on our watch. Will you join ${name}?\n\nContribute now:`
        : `I am a Guardian of the ${lang} language — 500 words contributed on Thok! 🦁\n\nHalf a thousand words saved. Our ancestors would be proud. Our language will not die on our watch.\n\nContribute now:`,
  },
  1000: {
    emoji: '👑',
    title: '1,000 words!',
    body:  'One thousand words. You are a legend of this project.',
    shareMessage: (lang, name) =>
      name
        ? `${name} just contributed 1,000 ${lang} words on Thok! 👑\n\nOne thousand words. ${name} helped write a piece of our history. This is the kind of person our community needs. Are you ready to answer the call?\n\nStart here:`
        : `I just contributed 1,000 ${lang} words on Thok! 👑\n\nOne thousand words saved for our people. I helped write a piece of our history. Our language will live on for our grandchildren.\n\nStart here:`,
  },
};

export function MilestoneCelebration({ milestone, onDismiss }: Props) {
  const contributor = useAppStore(s => s.contributor);
  const name        = contributor?.name;
  const langCode    = contributor?.language ?? 'dinka';
  const langName    = LANGUAGE_NAMES[langCode] ?? langCode;

  const info = LABELS[milestone] ?? {
    emoji: '🎉',
    title: `${milestone} words!`,
    body:  'An incredible contribution to language preservation.',
    shareMessage: (lang: string, n?: string) =>
      n
        ? `${n} just contributed ${milestone} ${lang} words on Thok! 🎉\n\nHelp preserve our language:`
        : `I just contributed ${milestone} ${lang} words on Thok! 🎉\n\nHelp preserve our language:`,
  };

  const buildShareText = () => {
    const appUrl = typeof window !== 'undefined' ? window.location.origin : 'https://thok.app';
    const msg    = info.shareMessage(langName, name);
    return `${msg}\n${appUrl}`;
  };

  const shareToFacebook = () => {
    const appUrl = typeof window !== 'undefined' ? window.location.origin : 'https://thok.app';
    const text   = info.shareMessage(langName, name);
    const url    = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(appUrl)}&quote=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener,width=600,height=500');
  };

  const shareToWhatsApp = () => {
    const text = buildShareText();
    const url  = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener');
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

        {/* Share buttons */}
        <div className="pt-1 space-y-2">
          <p className="text-xs text-gray-400 font-medium">Share your achievement</p>

          <button
            onClick={shareToFacebook}
            className="
              w-full flex items-center justify-center gap-2 py-2.5 rounded-xl
              bg-[#1877F2] text-white text-sm font-semibold
              active:bg-[#166FE5] transition-colors
            "
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
            </svg>
            Share on Facebook
          </button>

          <button
            onClick={shareToWhatsApp}
            className="
              w-full flex items-center justify-center gap-2 py-2.5 rounded-xl
              bg-[#25D366] text-white text-sm font-semibold
              active:bg-[#20BD5C] transition-colors
            "
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            Share on WhatsApp
          </button>
        </div>

        <button
          onClick={onDismiss}
          className="
            w-full py-3 rounded-xl text-sm font-semibold
            bg-gray-100 text-gray-700 active:bg-gray-200 transition-colors
          "
        >
          Keep going →
        </button>
      </div>
    </div>
  );
}
