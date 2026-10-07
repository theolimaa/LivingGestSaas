import { useState } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { Moon, Sun } from 'lucide-react';
import { Save, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import Layout from '@/components/Layout';

export default function Profile() {
  const { theme, toggle: toggleTheme } = useTheme();
  const { user } = useAuth();
  const [form, setForm] = useState({
    username: user?.user_metadata?.username || '',
    email: user?.email || '',
    newPassword: '',
    confirmPassword: '',
  });
  const [loading, setLoading] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const updates: { data?: { username: string }; password?: string } = {};
    if (form.username) updates.data = { username: form.username };
    if (form.newPassword) {
      if (form.newPassword !== form.confirmPassword) {
        toast.error('As senhas não coincidem.');
        setLoading(false);
        return;
      }
      if (form.newPassword.length < 6) {
        toast.error('Senha deve ter ao menos 6 caracteres.');
        setLoading(false);
        return;
      }
      updates.password = form.newPassword;
    }

    const { error } = await supabase.auth.updateUser(updates as Parameters<typeof supabase.auth.updateUser>[0]);
    setLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Perfil atualizado!');
      setForm(f => ({ ...f, newPassword: '', confirmPassword: '' }));
    }
  }

  const displayName = user?.user_metadata?.username || user?.email?.split('@')[0] || 'Usuário';

  return (
    <Layout>
      <div className="page-content !mx-0 max-w-xl">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Meu Perfil</h1>
          <p className="text-muted-foreground text-sm">Gerencie suas informações pessoais</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-2xl font-bold text-primary">{displayName.charAt(0).toUpperCase()}</span>
            </div>
            <div>
              <p className="font-semibold text-lg">{displayName}</p>
              <p className="text-muted-foreground text-sm">{user?.email}</p>
            </div>
          </div>
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <Label>Nome de usuário</Label>
              <Input className="mt-1" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} placeholder="Seu nome" />
            </div>
            <div>
              <Label>Email</Label>
              <Input className="mt-1 opacity-60 cursor-not-allowed" type="email" value={form.email} disabled />
              <p className="text-xs text-muted-foreground mt-1">O email não pode ser alterado aqui.</p>
            </div>
            <div className="border-t border-border pt-4">
              <p className="text-sm font-medium mb-3">Alterar Senha</p>
              <div className="space-y-3">
                <div>
                  <Label>Nova Senha</Label>
                  <Input className="mt-1" type="password" autoComplete="new-password" placeholder="Nova senha (mín. 6 caracteres)" value={form.newPassword} onChange={e => setForm({ ...form, newPassword: e.target.value })} />
                </div>
                <div>
                  <Label>Confirmar Nova Senha</Label>
                  <Input className="mt-1" type="password" autoComplete="new-password" placeholder="Confirme a nova senha" value={form.confirmPassword} onChange={e => setForm({ ...form, confirmPassword: e.target.value })} />
                </div>
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              {loading ? 'Salvando...' : 'Salvar Alterações'}
            </Button>
          </form>
        </div>
        <div className="bg-card rounded-xl border border-border p-6 flex items-center justify-between gap-4">
          <div>
            <p className="font-semibold">Aparência</p>
            <p className="text-sm text-muted-foreground">Tema {theme === 'dark' ? 'escuro' : 'claro'}</p>
          </div>
          <Button type="button" variant="outline" onClick={toggleTheme}>
            {theme === 'dark' ? <Sun className="w-4 h-4 mr-2" /> : <Moon className="w-4 h-4 mr-2" />}
            {theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'}
          </Button>
        </div>
      </div>
    </Layout>
  );
}
