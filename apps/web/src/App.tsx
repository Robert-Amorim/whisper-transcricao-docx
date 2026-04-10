import { Navigate, Route, Routes } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import RoleProtectedRoute from "./components/RoleProtectedRoute";
import AdminDashboardPage from "./pages/AdminDashboardPage";
import AdminTicketDetailPage from "./pages/AdminTicketDetailPage";
import AdminTicketsPage from "./pages/AdminTicketsPage";
import AdminUserDetailPage from "./pages/AdminUserDetailPage";
import AdminUsersPage from "./pages/AdminUsersPage";
import CarteiraPage from "./pages/CarteiraPage";
import ContactPage from "./pages/ContactPage";
import DashboardPage from "./pages/DashboardPage";
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import NewTranscriptionPage from "./pages/NewTranscriptionPage";
import NotFoundPage from "./pages/NotFoundPage";
import ProfilePage from "./pages/ProfilePage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import SupportPage from "./pages/SupportPage";
import TranscricaoDetailPage from "./pages/TranscriptionDetailPage";
import TranscricaoResultPage from "./pages/TranscriptionResultPage";
import TranscricoesPage from "./pages/TranscricoesPage";
import VerifyEmailPage from "./pages/VerifyEmailPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/contato" element={<ContactPage />} />
      <Route path="/verificar-email" element={<VerifyEmailPage />} />
      <Route path="/redefinir-senha" element={<ResetPasswordPage />} />
      <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
      <Route path="/perfil" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
      <Route path="/suporte" element={<ProtectedRoute><SupportPage /></ProtectedRoute>} />
      <Route path="/transcricoes" element={<ProtectedRoute><TranscricoesPage /></ProtectedRoute>} />
      <Route path="/transcricoes/nova" element={<ProtectedRoute><NewTranscriptionPage /></ProtectedRoute>} />
      <Route path="/transcricoes/:id" element={<ProtectedRoute><TranscricaoDetailPage /></ProtectedRoute>} />
      <Route path="/transcricoes/:id/resultado" element={<ProtectedRoute><TranscricaoResultPage /></ProtectedRoute>} />
      <Route path="/carteira" element={<ProtectedRoute><CarteiraPage /></ProtectedRoute>} />
      <Route path="/admin" element={<RoleProtectedRoute roles={["support", "admin"]}><AdminDashboardPage /></RoleProtectedRoute>} />
      <Route path="/admin/tickets" element={<RoleProtectedRoute roles={["support", "admin"]}><AdminTicketsPage /></RoleProtectedRoute>} />
      <Route path="/admin/tickets/:id" element={<RoleProtectedRoute roles={["support", "admin"]}><AdminTicketDetailPage /></RoleProtectedRoute>} />
      <Route path="/admin/users" element={<RoleProtectedRoute roles={["support", "admin"]}><AdminUsersPage /></RoleProtectedRoute>} />
      <Route path="/admin/users/:id" element={<RoleProtectedRoute roles={["support", "admin"]}><AdminUserDetailPage /></RoleProtectedRoute>} />
      <Route path="/404" element={<NotFoundPage />} />
      <Route path="*" element={<Navigate to="/404" replace />} />
    </Routes>
  );
}
