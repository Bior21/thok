/** @type {import('tailwindcss').Config} */
module.exports = {
  // Only include files that actually use Tailwind classes.
  // This keeps the production CSS bundle as small as possible.
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],

  theme: {
    extend: {
      // ── Thok brand colours ───────────────────────────────────────────────
      colors: {
        thok: {
          navy:  '#1B3A5C',   // primary brand — headers, CTAs
          blue:  '#185FA5',   // interactive elements
          sand:  '#C8A97E',   // accent — warmth, culture
          earth: '#3B2A1A',   // deep background accent
          sage:  '#2C4A3E',   // review mode header
        },
      },

      // ── Safe area insets ──────────────────────────────────────────────────
      // Handles notches and home indicator bars on modern Android/iOS devices.
      padding: {
        safe: 'env(safe-area-inset-bottom)',
      },

      // ── Font sizes ────────────────────────────────────────────────────────
      fontSize: {
        'xxs': '0.65rem',
      },
    },
  },

  plugins: [],
};
