import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';

export default function Login() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!email || !password) { setError('Preencha todos os campos.'); return; }
    if (password.length < 6) { setError('Senha deve ter ao menos 6 caracteres.'); return; }
    setLoading(true);
    const { error } = await signIn(email, password);
    setLoading(false);
    if (error) {
      setError('Email ou senha incorretos.');
    } else {
      navigate('/dashboard');
    }
  }

  return (
    <div className="min-h-screen flex" style={{ background: 'hsl(var(--sidebar-background))' }}>
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-center p-12">
        <div className="flex items-center gap-3 mb-12">
          <img src="/logo.png" alt="Living Gest" className="w-11 h-11 rounded-xl" />
          <span className="text-2xl font-bold text-white tracking-tight">Living Gest</span>
        </div>
        <div>
          <h1 className="text-4xl font-bold text-white leading-tight mb-4">
            Gestão inteligente<br />de imóveis e<br />condomínios
          </h1>
          <p className="text-sidebar-foreground text-lg">
            Controle contratos, pagamentos, inquilinos<br />e documentos em um só lugar.
          </p>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="bg-card rounded-2xl shadow-2xl p-8">
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-1 lg:hidden">
                <img src="/logo.png" alt="Living Gest" className="w-5 h-5 rounded" />
                <span className="font-bold text-primary">Living Gest</span>
              </div>
              <h2 className="text-2xl font-bold">Bem-vindo de volta</h2>
              <p className="text-muted-foreground text-sm mt-1">Faça login para acessar sua conta</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="password">Senha</Label>
                <div className="relative mt-1">
                  <Input
                    id="password"
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(!showPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <div className="text-right mt-1">
                  <Link to="/forgot-password" className="text-xs text-primary hover:underline">Esqueceu a senha?</Link>
                </div>
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <Button type="submit" className="w-full" size="lg" disabled={loading}>
                {loading ? 'Entrando...' : 'Entrar'}
              </Button>
            </form>

            <p className="text-center text-sm text-muted-foreground mt-6">
              Não tem conta?{' '}
              <Link to="/register" className="text-primary font-medium hover:underline">Cadastre-se</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
