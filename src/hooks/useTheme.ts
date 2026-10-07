import { useCallback, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';
const KEY = 'livinggest-theme';

function readStored(): Theme {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch {
    /* storage indisponível: segue o sistema */
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function apply(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

/** Aplica o tema salvo antes do primeiro render (evita flash). */
export function initTheme() {
  apply(readStored());
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => readStored());

  useEffect(() => {
    apply(theme);
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      /* ignora */
    }
  }, [theme]);

  const toggle = useCallback(() => setTheme(t => (t === 'dark' ? 'light' : 'dark')), []);
  return { theme, toggle };
}
