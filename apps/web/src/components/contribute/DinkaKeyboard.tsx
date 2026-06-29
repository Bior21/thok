/**
 * components/contribute/DinkaKeyboard.tsx
 *
 * A full on-screen Dinka keyboard that slides up from the bottom when the word
 * input is focused — the iPad-style "keyboard appears when you type" behaviour,
 * but with the Dinka (Thuɔŋjäŋ) letters built in.
 *
 * WHY A FULL VIRTUAL KEYBOARD?
 * A web page can't add keys to the device's native keyboard or install a system
 * keyboard. So to guarantee the Dinka letters are always there — on a phone, an
 * iPad, or a desktop with no on-screen keyboard at all — we render our own. The
 * text input uses inputMode="none" so the native keyboard doesn't fight this one
 * on touch devices; on desktop the physical keyboard still works alongside it.
 *
 * Layout: standard QWERTY plus a dedicated row of the letters that aren't on an
 * English keyboard:  ɛ ɔ ŋ ɣ ä ë ï ö  (and their capitals via ⇧).
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import Keyboard from 'react-simple-keyboard';
import 'react-simple-keyboard/build/css/index.css';

// Minimal shape of the simple-keyboard instance we use.
interface KeyboardInstance {
  getInput: () => string;
  setInput: (value: string) => void;
}

const layout = {
  default: [
    'q w e r t y u i o p',
    'a s d f g h j k l',
    '{shift} z x c v b n m {bksp}',
    'ɛ ɔ ɛ̈ ɔ̈ ŋ ɣ ä ë ï ö',
    '{space} {enter}',
  ],
  shift: [
    'Q W E R T Y U I O P',
    'A S D F G H J K L',
    '{shift} Z X C V B N M {bksp}',
    'Ɛ Ɔ Ɛ̈ Ɔ̈ Ŋ Ɣ Ä Ë Ï Ö',
    '{space} {enter}',
  ],
};

const display = {
  '{bksp}': '⌫',
  '{shift}': '⇧',
  '{space}': 'space',
  '{enter}': 'Done',
};

interface Props {
  /** Current input value (controlled by the parent). */
  value: string;
  /** Called with the full new value on every key press. */
  onChange: (value: string) => void;
  /** Called when the user taps Done. */
  onDone: () => void;
}

export function DinkaKeyboard({ value, onChange, onDone }: Props) {
  const keyboardRef = useRef<KeyboardInstance | null>(null);
  const [layoutName, setLayoutName] = useState<'default' | 'shift'>('default');

  // Keep the keyboard's internal buffer in sync when the value changes from
  // outside (e.g. cleared after submit). No-op when the change originated here,
  // so there's no feedback loop.
  useEffect(() => {
    const kb = keyboardRef.current;
    if (kb && kb.getInput() !== value) {
      kb.setInput(value);
    }
  }, [value]);

  const handleKeyPress = (button: string) => {
    if (button === '{shift}') {
      setLayoutName((n) => (n === 'default' ? 'shift' : 'default'));
      return;
    }
    if (button === '{enter}') {
      onDone();
    }
  };

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 bg-gray-100 border-t border-gray-200 shadow-[0_-2px_12px_rgba(0,0,0,0.08)]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      // Prevent the 300ms ghost click that mobile browsers fire after a touchEnd.
      // Without this, dismissing the keyboard via Done causes a phantom tap on
      // whatever element sits underneath at the same screen coordinates.
      onTouchEnd={(e) => e.preventDefault()}
    >
      <div className="max-w-md mx-auto">
        <div className="flex items-center justify-between px-3 py-1.5">
          <span className="text-xxs text-gray-500">Dinka · Thuɔŋjäŋ</span>
          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              onDone();
            }}
            className="text-xs font-medium text-[#185FA5] px-2 py-1"
          >
            Hide ▾
          </button>
        </div>
        <Keyboard
          keyboardRef={(r) => {
            keyboardRef.current = r as unknown as KeyboardInstance;
          }}
          layout={layout}
          layoutName={layoutName}
          display={display}
          theme="hg-theme-default thok-keyboard"
          onChange={onChange}
          onKeyPress={handleKeyPress}
        />
      </div>
    </div>
  );
}
