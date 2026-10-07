import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Suspense, lazy } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppProvider } from "@/lib/store";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { useSessionTimeout } from "@/hooks/useSessionTimeout";
import { AppShell } from "@/components/Layout";
import Login from "./pages/auth/Login";

// Páginas carregadas sob demanda: o primeiro acesso baixa só o necessário (jsPDF, recharts etc. ficam fora do bundle inicial)
const Register = lazy(() => import("./pages/auth/Register"));
const ForgotPassword = lazy(() => import("./pages/auth/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/auth/ResetPassword"));
const Home = lazy(() => import("./pages/Home"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Condominiums = lazy(() => import("./pages/Condominiums"));
const Financial = lazy(() => import("./pages/Financial"));
const MonthlyReport = lazy(() => import("./pages/MonthlyReport"));
const VacancyIndex = lazy(() => import("./pages/VacancyIndex"));
const Receipts = lazy(() => import("./pages/Receipts"));
const Documents = lazy(() => import("./pages/Documents"));
const CondominiumDetail = lazy(() => import("./pages/CondominiumDetail"));
const ApartmentDetail = lazy(() => import("./pages/ApartmentDetail"));
const Profile = lazy(() => import("./pages/Profile"));
const NotFound = lazy(() => import("./pages/NotFound"));
const PreviousTenants = lazy(() => import("./pages/PreviousTenants"));

// staleTime evita refetch de tudo a cada troca de tela; as mutações já invalidam as queries.
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000 } },
});

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

function SessionGuard({ children }: { children: React.ReactNode }) {
  useSessionTimeout();
  return <>{children}</>;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  if (!user) return <Navigate to="/login" replace />;
  return <SessionGuard>{children}</SessionGuard>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
    <Routes>
      <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
      <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
      <Route path="/forgot-password" element={<PublicRoute><ForgotPassword /></PublicRoute>} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/condominios" element={<Condominiums />} />
        <Route path="/financeiro" element={<Financial />} />
        <Route path="/financeiro/relatorio" element={<MonthlyReport />} />
        <Route path="/financeiro/vacancia" element={<VacancyIndex />} />
        <Route path="/recibos" element={<Receipts />} />
        <Route path="/documentos" element={<Documents />} />
        <Route path="/condominiums/:id" element={<CondominiumDetail />} />
        <Route path="/apartments/:id" element={<ApartmentDetail />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/anteriores" element={<PreviousTenants />} />
        <Route path="/" element={<Home />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
    </Suspense>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <AppProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </AppProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
