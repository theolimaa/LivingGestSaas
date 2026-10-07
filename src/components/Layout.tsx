import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  LogOut,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  X,
  Home,
  Building2,
  Wallet,
  FileBarChart2,
  DoorOpen,
  FileText,
  History,
  Files,
  Search,
  Moon,
  Sun,
  Menu,
  type LucideIcon,
} from 'lucide-react';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import NotificationBell from '@/components/NotificationBell';
import GlobalSearch from '@/components/GlobalSearch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface NavItemDef {
  label: string;
  icon: LucideIcon;
  path: string;
  children?: { label: string; icon: LucideIcon; path: string }[];
}

const navItems: NavItemDef[] = [
  { label: 'Início', icon: Home, path: '/' },
  { label: 'Painel', icon: LayoutDashboard, path: '/dashboard' },
  { label: 'Condomínios', icon: Building2, path: '/condominios' },
  {
    label: 'Financeiro',
    icon: Wallet,
    path: '/financeiro',
    children: [
      { label: 'Registros', icon: Wallet, path: '/financeiro' },
      { label: 'Relatório Mensal', icon: FileBarChart2, path: '/financeiro/relatorio' },
      { label: 'Índice de Vacância', icon: DoorOpen, path: '/financeiro/vacancia' },
    ],
  },
  { label: 'Recibos', icon: FileText, path: '/recibos' },
  { label: 'Documentos', icon: Files, path: '/documentos' },
  { label: 'Ex-inquilinos', icon: History, path: '/anteriores' },
];

// Barra inferior (mobile): o que mais se usa no dia a dia
const bottomItems = [
  { label: 'Início', icon: Home, path: '/' },
  { label: 'Condomínios', icon: Building2, path: '/condominios' },
  { label: 'Financeiro', icon: Wallet, path: '/financeiro' },
];

function pageTitle(pathname: string): string {
  if (pathname === '/') return 'Início';
  if (pathname.startsWith('/apartments/')) return 'Apartamento';
  if (pathname.startsWith('/condominiums/')) return 'Condomínio';
  if (pathname === '/profile') return 'Perfil';
  const exact = navItems.flatMap(i => [i, ...(i.children ?? [])]).find(i => i.path === pathname);
  if (exact) return exact.label;
  const prefix = navItems.find(i => i.path !== '/' && pathname.startsWith(i.path));
  return prefix?.label ?? '';
}

function isPathActive(pathname: string, path: string) {
  return path === '/' ? pathname === '/' : pathname.startsWith(path);
}

function readCollapsed(): boolean {
  try {
    return localStorage.getItem('livinggest-sidebar') === 'collapsed';
  } catch {
    return false;
  }
}

interface SidebarContentProps {
  mobile?: boolean;
  expanded: boolean;
  pathname: string;
  financeiroOpen: boolean;
  onToggleFinanceiro: () => void;
  onExpand: () => void;
  onCloseMobile: () => void;
  userName: string;
  userEmail: string;
  onLogout: () => void;
}

function SidebarContent({
  mobile = false,
  expanded,
  pathname,
  financeiroOpen,
  onToggleFinanceiro,
  onExpand,
  onCloseMobile,
  userName,
  userEmail,
  onLogout,
}: SidebarContentProps) {
  const userInitial = userName.charAt(0).toUpperCase();
  const itemClass = mobile ? 'sidebar-nav-item py-3' : 'sidebar-nav-item';

  // Com a barra recolhida, mostra o nome do item ao passar o mouse
  const withTip = (label: string, node: React.ReactElement) =>
    expanded ? (
      node
    ) : (
      <Tooltip>
        <TooltipTrigger asChild>{node}</TooltipTrigger>
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
    );

  return (
    <div className="flex flex-col h-full">
      {/* Logo Header */}
      <div
        className="flex items-center gap-3 px-4 py-4 shrink-0"
        style={{ borderBottom: '1px solid hsl(var(--sidebar-border))' }}
      >
        <Link to="/" className="flex items-center gap-3 min-w-0" aria-label="Living Gest — Início">
          <img
            src="/logo.png"
            alt=""
            className="w-8 h-8 rounded-lg shrink-0"
            style={{ boxShadow: '0 2px 8px hsl(217 91% 55% / 0.35)' }}
          />
          <div
            className="overflow-hidden transition-all duration-300"
            style={{ width: expanded ? 'auto' : 0, opacity: expanded ? 1 : 0, whiteSpace: 'nowrap' }}
          >
            <p className="text-sm font-bold leading-tight" style={{ color: 'hsl(218 22% 92%)' }}>
              Living Gest
            </p>
            <p className="text-xs" style={{ color: 'hsl(var(--sidebar-foreground))' }}>
              Gestão de Imóveis
            </p>
          </div>
        </Link>
        {mobile && (
          <button
            onClick={onCloseMobile}
            aria-label="Fechar menu"
            className="ml-auto w-10 h-10 flex items-center justify-center rounded-md transition-colors"
            style={{ color: 'hsl(var(--sidebar-foreground))' }}
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto" aria-label="Principal">
        {expanded && <p className="sidebar-section-label">Menu</p>}

        {navItems.map(item => {
          const isActive = isPathActive(pathname, item.path);

          if (item.children) {
            return (
              <div key={item.path}>
                {withTip(
                  item.label,
                  <button
                    onClick={() => (!mobile && !expanded ? onExpand() : onToggleFinanceiro())}
                    aria-expanded={financeiroOpen}
                    aria-label={item.label}
                    className={`${itemClass} ${isActive ? 'active' : ''}`}
                  >
                    <item.icon className="w-4 h-4 shrink-0" />
                    {expanded && (
                      <>
                        <span className="flex-1 text-left">{item.label}</span>
                        {financeiroOpen ? (
                          <ChevronUp className="w-3.5 h-3.5 opacity-50" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 opacity-50" />
                        )}
                      </>
                    )}
                  </button>,
                )}
                <div
                  className="overflow-hidden transition-all duration-200 ease-in-out"
                  style={{ maxHeight: expanded && financeiroOpen ? '220px' : '0px' }}
                >
                  <div
                    className="ml-3 mt-0.5 mb-1 space-y-0.5 pl-3"
                    style={{ borderLeft: '1px solid hsl(var(--sidebar-border))' }}
                  >
                    {item.children.map(child => {
                      const childActive = pathname === child.path;
                      return (
                        <Link
                          key={child.path}
                          to={child.path}
                          tabIndex={expanded && financeiroOpen ? 0 : -1}
                          aria-current={childActive ? 'page' : undefined}
                          className={`sidebar-nav-item ${mobile ? 'py-2.5' : 'py-1.5'} text-xs ${childActive ? 'active' : ''}`}
                        >
                          <child.icon className="w-3.5 h-3.5 shrink-0" />
                          <span>{child.label}</span>
                          {childActive && <ChevronRight className="w-3 h-3 ml-auto opacity-60" />}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          }

          return (
            <div key={item.path}>
              {withTip(
                item.label,
                <Link
                  to={item.path}
                  aria-label={item.label}
                  aria-current={isActive ? 'page' : undefined}
                  className={`${itemClass} ${isActive ? 'active' : ''}`}
                >
                  <item.icon className="w-4 h-4 shrink-0" />
                  {expanded && <span>{item.label}</span>}
                  {expanded && isActive && <ChevronRight className="w-3.5 h-3.5 ml-auto opacity-60" />}
                </Link>,
              )}
            </div>
          );
        })}
      </nav>

      {/* Footer: usuário + sair */}
      <div className="px-2 py-3 space-y-0.5 shrink-0" style={{ borderTop: '1px solid hsl(var(--sidebar-border))' }}>
        {expanded && <p className="sidebar-section-label">Conta</p>}
        {withTip(
          'Perfil',
          <Link
            to="/profile"
            aria-label="Perfil"
            className={`${itemClass} ${pathname === '/profile' ? 'active' : ''}`}
          >
            <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold text-white bg-primary">
              {userInitial}
            </div>
            {expanded && (
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold truncate leading-tight" style={{ color: 'hsl(218 22% 88%)' }}>
                  {userName}
                </p>
                <p className="text-xs truncate leading-tight" style={{ color: 'hsl(var(--sidebar-foreground))' }}>
                  {userEmail}
                </p>
              </div>
            )}
          </Link>,
        )}
        {withTip(
          'Sair',
          <button onClick={onLogout} aria-label="Sair" className={itemClass} style={{ color: 'hsl(0 72% 65%)' }}>
            <LogOut className="w-4 h-4 shrink-0" />
            {expanded && <span>Sair</span>}
          </button>,
        )}
      </div>
    </div>
  );
}

function ContentLoader() {
  return (
    <div className="flex items-center justify-center py-24" role="status" aria-label="Carregando">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

/** Casca do app: sidebar, barras e área de conteúdo. Fica montada entre as telas (rota de layout). */
export function AppShell() {
  const { user, signOut } = useAuth();
  const { theme, toggle: toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const mainRef = useRef<HTMLElement>(null);

  const [collapsed, setCollapsed] = useState<boolean>(readCollapsed);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [financeiroOpen, setFinanceiroOpen] = useState(location.pathname.startsWith('/financeiro'));

  // Cada tela nova começa no topo e fecha o menu mobile
  useEffect(() => {
    setMobileMenuOpen(false);
    mainRef.current?.scrollTo({ top: 0 });
    if (location.pathname.startsWith('/financeiro')) setFinanceiroOpen(true);
  }, [location.pathname]);

  function setCollapsedPersist(v: boolean) {
    setCollapsed(v);
    try {
      localStorage.setItem('livinggest-sidebar', v ? 'collapsed' : 'open');
    } catch {
      /* ignora */
    }
  }

  async function handleLogout() {
    await signOut();
    navigate('/login');
  }

  const userName = user?.user_metadata?.username || user?.email?.split('@')[0] || 'Usuário';
  const userEmail = user?.email || '';
  const title = pageTitle(location.pathname);
  const ThemeIcon = theme === 'dark' ? Sun : Moon;

  const sidebarProps = {
    pathname: location.pathname,
    financeiroOpen,
    onToggleFinanceiro: () => setFinanceiroOpen(o => !o),
    userName,
    userEmail,
    onLogout: handleLogout,
  };

  const iconBtn =
    'w-10 h-10 md:w-9 md:h-9 rounded-lg border flex items-center justify-center transition-colors hover:border-primary/50 bg-secondary text-foreground';

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:absolute focus:z-[60] focus:m-2 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
      >
        Pular para o conteúdo
      </a>

      {/* DESKTOP SIDEBAR */}
      <aside
        className="hidden md:flex flex-col shrink-0 transition-all duration-300 ease-in-out relative"
        style={{
          width: collapsed ? '60px' : '228px',
          background: 'hsl(var(--sidebar-background))',
          boxShadow: 'inset -1px 0 0 hsl(var(--sidebar-border))',
        }}
      >
        <SidebarContent
          {...sidebarProps}
          expanded={!collapsed}
          onExpand={() => {
            setCollapsedPersist(false);
            setFinanceiroOpen(true);
          }}
          onCloseMobile={() => undefined}
        />
        <button
          onClick={() => setCollapsedPersist(!collapsed)}
          aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
          className="absolute -right-3 top-5 z-10 w-6 h-6 rounded-full flex items-center justify-center transition-all duration-200 bg-card text-muted-foreground border border-border shadow-sm"
        >
          <ChevronRight className={`w-3 h-3 ${collapsed ? '' : 'rotate-180'}`} />
        </button>
      </aside>

      {/* MOBILE DRAWER */}
      <div
        className={`fixed inset-0 z-40 md:hidden transition-opacity duration-300 ${
          mobileMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        style={{ background: 'rgb(0 0 0 / 0.6)' }}
        onClick={() => setMobileMenuOpen(false)}
      />
      <aside
        aria-hidden={!mobileMenuOpen}
        className="fixed inset-y-0 left-0 z-50 flex flex-col w-72 md:hidden shadow-2xl transition-transform duration-300 ease-in-out"
        style={{
          background: 'hsl(var(--sidebar-background))',
          transform: mobileMenuOpen ? 'translateX(0)' : 'translateX(-100%)',
          visibility: mobileMenuOpen ? 'visible' : 'hidden',
        }}
      >
        <SidebarContent
          {...sidebarProps}
          mobile
          expanded
          onExpand={() => undefined}
          onCloseMobile={() => setMobileMenuOpen(false)}
        />
      </aside>

      {/* Conteúdo */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Barra superior mobile */}
        <header
          className="md:hidden flex items-center gap-2 px-4 py-2.5 border-b shrink-0"
          style={{ background: 'hsl(var(--sidebar-background))', borderColor: 'hsl(var(--sidebar-border))' }}
        >
          <Link to="/" className="flex items-center gap-2.5" aria-label="Início">
            <img src="/logo.png" alt="" className="w-7 h-7 rounded-lg shrink-0" />
            <span className="font-bold text-sm" style={{ color: 'hsl(218 22% 92%)' }}>
              {title && title !== 'Início' ? title : 'Living Gest'}
            </span>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => setSearchOpen(true)} aria-label="Buscar" className={iconBtn}>
              <Search className="w-4 h-4" />
            </button>
            <NotificationBell />
          </div>
        </header>

        {/* Barra superior desktop */}
        <header className="hidden md:flex items-center gap-3 px-6 py-2.5 border-b border-border bg-card shrink-0">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setSearchOpen(true)}
              className="h-9 w-64 rounded-lg border border-border bg-secondary px-3 text-sm text-muted-foreground flex items-center gap-2 hover:border-primary/50 transition-colors"
            >
              <Search className="w-4 h-4" />
              <span className="flex-1 text-left">Buscar…</span>
              <kbd className="text-xs border border-border rounded px-1.5 py-0.5 bg-card">Ctrl K</kbd>
            </button>
            <button
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'}
              className={iconBtn}
            >
              <ThemeIcon className="w-4 h-4" />
            </button>
            <NotificationBell />
          </div>
        </header>

        <main id="conteudo" ref={mainRef} className="flex-1 overflow-y-auto overflow-x-hidden">
          <Suspense fallback={<ContentLoader />}>
            <Outlet />
          </Suspense>
          {/* espaço para a barra inferior no mobile */}
          <div className="h-16 md:hidden bottom-nav-safe" aria-hidden />
        </main>

        {/* Barra inferior mobile */}
        <nav
          aria-label="Atalhos"
          className="md:hidden shrink-0 grid grid-cols-4 border-t border-border bg-card bottom-nav-safe"
        >
          {bottomItems.map(item => {
            const active = isPathActive(location.pathname, item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                aria-current={active ? 'page' : undefined}
                className={`flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] text-xs font-medium transition-colors ${
                  active ? 'text-primary' : 'text-muted-foreground'
                }`}
              >
                <item.icon className="w-5 h-5" />
                {item.label}
              </Link>
            );
          })}
          <button
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Abrir menu completo"
            className="flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] text-xs font-medium text-muted-foreground"
          >
            <Menu className="w-5 h-5" />
            Mais
          </button>
        </nav>
      </div>

      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}

/** Compatibilidade: as telas ainda envolvem o conteúdo em <Layout>, mas a casca agora vem da rota. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
