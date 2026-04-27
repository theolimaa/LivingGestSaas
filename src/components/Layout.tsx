import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  LogOut,
  User,
  ChevronRight,
  Menu,
  X,
  Home,
  Wallet,
  FileBarChart2,
  DoorOpen,
  ChevronDown,
  ChevronUp,
  FileText,
  Building2,
  History,
} from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
 
const INACTIVITY_TIMEOUT = 15 * 60 * 1000;
 
const navItems = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
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
  { label: 'Anteriores', icon: History, path: '/anteriores' },
];
 
export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [financeiroOpen, setFinanceiroOpen] = useState(
    location.pathname.startsWith('/financeiro')
  );
  const inactivityTimer = useRef<number | null>(null);
 
  const resetTimer = useCallback(() => {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    inactivityTimer.current = setTimeout(async () => {
      await signOut();
      navigate('/login');
    }, INACTIVITY_TIMEOUT);
  }, [signOut, navigate]);
 
  useEffect(() => {
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
    events.forEach(e => window.addEventListener(e, resetTimer, { passive: true }));
    resetTimer();
    return () => {
      events.forEach(e => window.removeEventListener(e, resetTimer));
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    };
  }, [resetTimer]);
 
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);
 
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) setSidebarOpen(false);
      else setSidebarOpen(true);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
 
  async function handleLogout() {
    await signOut();
    navigate('/login');
  }
 
  const userName =
    user?.user_metadata?.username || user?.email?.split('@')[0] || 'Usuário';
  const userEmail = user?.email || '';
  const userInitial = userName.charAt(0).toUpperCase();
 
  function SidebarContent({ mobile = false }: { mobile?: boolean }) {
    const expanded = mobile || sidebarOpen;
 
    return (
      <div className="flex flex-col h-full">
        {/* Logo Header */}
        <div
          className="flex items-center gap-3 px-4 py-4 shrink-0"
          style={{ borderBottom: '1px solid hsl(var(--sidebar-border))' }}
        >
          <div
            className="sidebar-logo-gradient flex items-center justify-center w-8 h-8 rounded-lg shrink-0"
            style={{ boxShadow: '0 2px 8px hsl(217 91% 55% / 0.35)' }}
          >
            <Building2 className="w-4 h-4 text-white" />
          </div>
          <div
            className="overflow-hidden transition-all duration-300"
            style={{
              width: expanded ? 'auto' : 0,
              opacity: expanded ? 1 : 0,
              whiteSpace: 'nowrap',
            }}
          >
            <p
              className="text-sm font-bold leading-tight"
              style={{ color: 'hsl(218 22% 92%)' }}
            >
              Living Gest
            </p>
            <p className="text-xs" style={{ color: 'hsl(var(--sidebar-foreground))' }}>
              Gestão de Imóveis
            </p>
          </div>
          {mobile && (
            <button
              onClick={() => setMobileMenuOpen(false)}
              className="ml-auto p-1.5 rounded-md transition-colors"
              style={{ color: 'hsl(var(--sidebar-foreground))' }}
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
 
        {/* Nav */}
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          {expanded && (
            <p className="sidebar-section-label">Menu</p>
          )}
 
          {navItems.map(item => {
            const isActive = location.pathname.startsWith(item.path);
            if (item.children) {
              return (
                <div key={item.path}>
                  <button
                    onClick={() => {
                      if (!mobile && !sidebarOpen) {
                        setSidebarOpen(true);
                        setFinanceiroOpen(true);
                      } else {
                        setFinanceiroOpen(o => !o);
                      }
                    }}
                    className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
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
                  </button>
                  <div
                    className="overflow-hidden transition-all duration-250 ease-in-out"
                    style={{
                      maxHeight: expanded && financeiroOpen ? '200px' : '0px',
                    }}
                  >
                    <div
                      className="ml-3 mt-0.5 mb-1 space-y-0.5 pl-3"
                      style={{ borderLeft: '1px solid hsl(var(--sidebar-border))' }}
                    >
                      {item.children.map(child => {
                        const childActive = location.pathname === child.path;
                        return (
                          <Link
                            key={child.path}
                            to={child.path}
                            className={`sidebar-nav-item py-1.5 text-xs ${childActive ? 'active' : ''}`}
                          >
                            <child.icon className="w-3.5 h-3.5 shrink-0" />
                            <span>{child.label}</span>
                            {childActive && (
                              <ChevronRight className="w-3 h-3 ml-auto opacity-60" />
                            )}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            }
 
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
              >
                <item.icon className="w-4 h-4 shrink-0" />
                {expanded && <span>{item.label}</span>}
                {expanded && isActive && (
                  <ChevronRight className="w-3.5 h-3.5 ml-auto opacity-60" />
                )}
              </Link>
            );
          })}
        </nav>
 
        {/* Footer: User + Logout */}
        <div
          className="px-2 py-3 space-y-0.5 shrink-0"
          style={{ borderTop: '1px solid hsl(var(--sidebar-border))' }}
        >
          {expanded && (
            <p className="sidebar-section-label">Conta</p>
          )}
          <Link
            to="/profile"
            className={`sidebar-nav-item ${location.pathname === '/profile' ? 'active' : ''}`}
          >
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold text-white"
              style={{ background: 'linear-gradient(135deg, hsl(217 91% 55%), hsl(238 83% 62%))' }}
            >
              {userInitial}
            </div>
            {expanded && (
              <div className="min-w-0 flex-1">
                <p
                  className="text-xs font-semibold truncate leading-tight"
                  style={{ color: 'hsl(218 22% 88%)' }}
                >
                  {userName}
                </p>
                <p
                  className="text-xs truncate leading-tight"
                  style={{ color: 'hsl(var(--sidebar-foreground))' }}
                >
                  {userEmail}
                </p>
              </div>
            )}
            {expanded && <User className="w-3.5 h-3.5 opacity-40 shrink-0" />}
          </Link>
          <button
            onClick={handleLogout}
            className="sidebar-nav-item"
            style={{ color: 'hsl(0 72% 65%)' }}
          >
            <LogOut className="w-4 h-4 shrink-0" />
            {expanded && <span>Sair</span>}
          </button>
        </div>
      </div>
    );
  }
 
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* DESKTOP SIDEBAR */}
      <aside
        className="hidden md:flex flex-col shrink-0 transition-all duration-300 ease-in-out relative"
        style={{
          width: sidebarOpen ? '228px' : '60px',
          background: 'hsl(var(--sidebar-background))',
          boxShadow: 'inset -1px 0 0 hsl(var(--sidebar-border))',
        }}
      >
        <SidebarContent />
 
        {/* Collapse toggle */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="absolute -right-3 top-5 z-10 w-6 h-6 rounded-full flex items-center justify-center transition-all duration-200"
          style={{
            background: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            boxShadow: '0 1px 4px rgb(0 0 0 / 0.12)',
            color: 'hsl(var(--muted-foreground))',
          }}
        >
          {sidebarOpen ? (
            <ChevronRight className="w-3 h-3 rotate-180" />
          ) : (
            <ChevronRight className="w-3 h-3" />
          )}
        </button>
      </aside>
 
      {/* MOBILE OVERLAY */}
      <div
        className={`fixed inset-0 z-40 md:hidden transition-opacity duration-300 ${
          mobileMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        style={{ background: 'rgb(0 0 0 / 0.6)' }}
        onClick={() => setMobileMenuOpen(false)}
      />
      <aside
        className="fixed inset-y-0 left-0 z-50 flex flex-col w-72 md:hidden shadow-2xl transition-transform duration-300 ease-in-out"
        style={{
          background: 'hsl(var(--sidebar-background))',
          transform: mobileMenuOpen ? 'translateX(0)' : 'translateX(-100%)',
        }}
      >
        <SidebarContent mobile />
      </aside>
 
      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Mobile top bar */}
        <header
          className="md:hidden flex items-center gap-3 px-4 py-3 border-b shrink-0"
          style={{
            background: 'hsl(var(--sidebar-background))',
            borderColor: 'hsl(var(--sidebar-border))',
          }}
        >
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="p-2 rounded-lg transition-colors"
            style={{ color: 'hsl(var(--sidebar-foreground))' }}
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2.5">
            <div
              className="sidebar-logo-gradient w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ boxShadow: '0 2px 8px hsl(217 91% 55% / 0.3)' }}
            >
              <Building2 className="w-3.5 h-3.5 text-white" />
            </div>
            <span
              className="font-bold text-sm"
              style={{ color: 'hsl(218 22% 92%)' }}
            >
              Living Gest
            </span>
          </div>
        </header>
 
        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
