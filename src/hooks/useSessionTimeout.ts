import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const TIMEOUT_MS = 15 * 60 * 1000; // 15 minutos
const WARN_MS = 2 * 60 * 1000;     // avisa 2 min antes

export function useSessionTimeout() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warnRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastIdRef = useRef<string | number | null>(null);

  const clearTimers = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (warnRef.current)  clearTimeout(warnRef.current);
    if (toastIdRef.current) toast.dismiss(toastIdRef.current);
  }, []);

  const resetTimers = useCallback(() => {
    clearTimers();

    warnRef.current = setTimeout(() => {
      toastIdRef.current = toast.warning(
        'Sua sessão expira em 2 minutos por inatividade.',
        { duration: WARN_MS }
      );
    }, TIMEOUT_MS - WARN_MS);

    timerRef.current = setTimeout(async () => {
      toast.info('Sessão encerrada por inatividade.');
      await supabase.auth.signOut();
    }, TIMEOUT_MS);
  }, [clearTimers]);

  useEffect(() => {
    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'];

    const handleActivity = () => resetTimers();

    events.forEach(e => window.addEventListener(e, handleActivity, { passive: true }));
    resetTimers(); // inicia timer ao montar

    return () => {
      events.forEach(e => window.removeEventListener(e, handleActivity));
      clearTimers();
    };
  }, [resetTimers, clearTimers]);
}
