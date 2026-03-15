import { Navigate, Route, Routes } from "react-router-dom";
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
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/perfil" element={<ProfilePage />} />
      <Route path="/transcricoes/nova" element={<NewTranscriptionPage />} />
      <Route path="/transcricoes/:id" element={<TranscriptionDetailPage />} />
      <Route path="/transcricoes/:id/resultado" element={<TranscriptionResultPage />} />
      <Route path="/404" element={<NotFoundPage />} />
      <Route path="*" element={<Navigate to="/404" replace />} />
    </Routes>
  );
}
