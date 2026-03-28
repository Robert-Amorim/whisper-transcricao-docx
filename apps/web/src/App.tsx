import { Navigate, Route, Routes } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import DashboardPage from "./pages/DashboardPage";
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import NewTranscriptionPage from "./pages/NewTranscriptionPage";
import NotFoundPage from "./pages/NotFoundPage";
import ProfilePage from "./pages/ProfilePage";
import TranscriptionDetailPage from "./pages/TranscriptionDetailPage";
import TranscriptionResultPage from "./pages/TranscriptionResultPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
      <Route path="/perfil" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
      <Route path="/transcricoes/nova" element={<ProtectedRoute><NewTranscriptionPage /></ProtectedRoute>} />
      <Route path="/transcricoes/:id" element={<ProtectedRoute><TranscriptionDetailPage /></ProtectedRoute>} />
      <Route path="/transcricoes/:id/resultado" element={<ProtectedRoute><TranscriptionResultPage /></ProtectedRoute>} />
      <Route path="/404" element={<NotFoundPage />} />
      <Route path="*" element={<Navigate to="/404" replace />} />
    </Routes>
  );
}
