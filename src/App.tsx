import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppProvider } from "@/lib/store";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { useSessionTimeout } from "@/hooks/useSessionTimeout";
import Login from "./pages/auth/Login";
import Register from "./pages/auth/Register";
import ForgotPassword from "./pages/auth/ForgotPassword";
import ResetPassword from "./pages/auth/ResetPassword";
import Dashboard from "./pages/Dashboard";
import Financial from "./pages/Financial";
import MonthlyReport from "./pages/MonthlyReport";
import VacancyIndex from "./pages/VacancyIndex";
import Receipts from "./pages/Receipts";
import Documents from "./pages/Documents";
import CondominiumDetail from "./pages/CondominiumDetail";
import ApartmentDetail from "./pages/ApartmentDetail";
import Profile from "./pages/Profile";
import NotFound from "./pages/NotFound";
import PreviousTenants from "./pages/PreviousTenants";

const queryClient = new QueryClient();

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
  if (user) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
      <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
      <Route path="/forgot-password" element={<PublicRoute><ForgotPassword /></PublicRoute>} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/financeiro" element={<ProtectedRoute><Financial /></ProtectedRoute>} />
      <Route path="/financeiro/relatorio" element={<ProtectedRoute><MonthlyReport /></ProtectedRoute>} />
      <Route path="/financeiro/vacancia" element={<ProtectedRoute><VacancyIndex /></ProtectedRoute>} />
      <Route path="/recibos" element={<ProtectedRoute><Receipts /></ProtectedRoute>} />
      <Route path="/documentos" element={<ProtectedRoute><Documents /></ProtectedRoute>} />
      <Route path="/condominiums/:id" element={<ProtectedRoute><CondominiumDetail /></ProtectedRoute>} />
      <Route path="/apartments/:id" element={<ProtectedRoute><ApartmentDetail /></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
      <Route path="/anteriores" element={<ProtectedRoute><PreviousTenants /></ProtectedRoute>} />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
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
