import { newProgress, type Progress } from '../application/progress';

const KEY = 'sky-skid/progress/v1';

export function loadProgress(): Progress {
  try {
    const saved = localStorage.getItem(KEY);
    return saved ? { ...newProgress(), ...JSON.parse(saved) } : newProgress();
  } catch {
    return newProgress();
  }
}

export function saveProgress(progress: Progress) {
  try {
    localStorage.setItem(KEY, JSON.stringify(progress));
  } catch {
    // Private windows may refuse storage; the current session still plays fine.
  }
}
