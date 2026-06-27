import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';

export default function ForgotPassword() {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    const { error } = await resetPassword(email);
    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      setSent(true);
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

          {sent ? (
            <div className="text-center py-4">
              <CheckCircle className="w-12 h-12 mx-auto mb-3" style={{ color: 'hsl(var(--success))' }} />
              <h2 className="text-xl font-bold mb-2">Email enviado!</h2>
              <p className="text-muted-foreground text-sm mb-6">Verifique sua caixa de entrada para redefinir sua senha.</p>
              <Link to="/login">
                <Button variant="outline" className="w-full">
                  <ArrowLeft className="w-4 h-4 mr-2" /> Voltar ao login
                </Button>
              </Link>
            </div>
          ) : (
            <>
              <h2 className="text-2xl font-bold mb-1">Recuperar senha</h2>
              <p className="text-muted-foreground text-sm mb-6">Insira seu email para receber o link de recuperação.</p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label>Email</Label>
                  <Input className="mt-1" type="email" placeholder="seu@email.com" value={email} onChange={e => setEmail(e.target.value)} />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button type="submit" className="w-full" size="lg" disabled={loading}>
                  {loading ? 'Enviando...' : 'Enviar link'}
                </Button>
              </form>
              <Link to="/login" className="flex items-center justify-center gap-1 text-sm text-muted-foreground mt-4 hover:text-foreground">
                <ArrowLeft className="w-4 h-4" /> Voltar ao login
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
