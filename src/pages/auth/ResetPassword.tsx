import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // Supabase sets the session automatically from the URL hash on recovery
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        // Ready to reset
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < 6) { setError('Senha deve ter ao menos 6 caracteres.'); return; }
    if (password !== confirm) { setError('As senhas não coincidem.'); return; }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      setDone(true);
      setTimeout(() => navigate('/login'), 2000);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-8" style={{ background: 'hsl(var(--sidebar-background))' }}>
      <div className="w-full max-w-sm">
        <div className="bg-card rounded-2xl shadow-2xl p-8">
          <div className="flex items-center gap-2 mb-6">
            <img src="/logo.png" alt="Living Gest" className="w-8 h-8 rounded-lg" />
            <span className="font-bold text-primary">Living Gest</span>
          </div>

          {done ? (
            <div className="text-center py-4">
              <CheckCircle className="w-12 h-12 mx-auto mb-3" style={{ color: 'hsl(var(--success))' }} />
              <h2 className="text-xl font-bold mb-2">Senha atualizada!</h2>
              <p className="text-muted-foreground text-sm">Redirecionando para o login...</p>
            </div>
          ) : (
            <>
              <h2 className="text-2xl font-bold mb-1">Nova senha</h2>
              <p className="text-muted-foreground text-sm mb-6">Digite sua nova senha.</p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label>Nova Senha</Label>
                  <div className="relative mt-1">
                    <Input
                      type={showPw ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      className="pr-10"
                    />
                    <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <Label>Confirmar Senha</Label>
                  <Input className="mt-1" type="password" placeholder="••••••••" value={confirm} onChange={e => setConfirm(e.target.value)} />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button type="submit" className="w-full" size="lg" disabled={loading}>
                  {loading ? 'Salvando...' : 'Salvar nova senha'}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
