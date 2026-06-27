import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';

export default function Register() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!form.name || !form.email || !form.password) { setError('Preencha todos os campos obrigatórios.'); return; }
    if (form.password !== form.confirm) { setError('As senhas não coincidem.'); return; }
    if (form.password.length < 6) { setError('Senha deve ter ao menos 6 caracteres.'); return; }
    setLoading(true);
    const { error } = await signUp(form.email, form.password, form.name);
    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      navigate('/dashboard');
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-8" style={{ background: 'hsl(var(--sidebar-background))' }}>
      <div className="w-full max-w-md">
        <div className="bg-card rounded-2xl shadow-2xl p-8">
          <div className="flex items-center gap-2 mb-6">
            <img src="/logo.png" alt="Living Gest" className="w-8 h-8 rounded-lg" />
            <span className="font-bold text-primary">Living Gest</span>
          </div>
          <h2 className="text-2xl font-bold mb-1">Criar conta</h2>
          <p className="text-muted-foreground text-sm mb-6">Comece a gerenciar seus imóveis hoje</p>

          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <Label>Nome completo *</Label>
              <Input className="mt-1" placeholder="Seu nome" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label>Email *</Label>
              <Input className="mt-1" type="email" placeholder="seu@email.com" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <Label>Senha *</Label>
              <div className="relative mt-1">
                <Input type={showPw ? 'text' : 'password'} placeholder="••••••••" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} className="pr-10" />
                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <Label>Confirmar senha *</Label>
              <Input className="mt-1" type="password" placeholder="••••••••" value={form.confirm} onChange={e => setForm({ ...form, confirm: e.target.value })} />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full mt-2" size="lg" disabled={loading}>
              {loading ? 'Criando conta...' : 'Criar conta'}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground mt-6">
            Já tem conta?{' '}
            <Link to="/login" className="text-primary font-medium hover:underline">Entrar</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
