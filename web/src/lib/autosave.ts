// Autosave debounce (SPEC 8.7): a save fires once, 800ms after the last
// keystroke. Typing again before the timer fires pushes the save back, so a
// burst of typing ends in exactly one save. flush() saves now (selection
// change, blur, window close) and cancel() drops a pending save.

export interface AutosaveHandle {
  keystroke: () => void;
  flush: () => void;
  cancel: () => void;
}

export const AUTOSAVE_DELAY_MS = 800;

export function createAutosave(save: () => void, delayMs: number = AUTOSAVE_DELAY_MS): AutosaveHandle {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const clear = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  return {
    keystroke: () => {
      clear();
      timer = setTimeout(() => {
        timer = null;
        save();
      }, delayMs);
    },
    flush: () => {
      clear();
      save();
    },
    cancel: clear,
  };
}
