import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { AlertProvider } from './context/AlertContext';
import Navbar from './components/Navbar';
import HeroSection from './components/HeroSection';
import ProblemSection from './components/ProblemSection';
import SolutionFlow from './components/SolutionFlow';
import PrivacySection from './components/PrivacySection';
import Footer from './components/Footer';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ProtectedRoute from './components/auth/ProtectedRoute';
import DashboardLayout from './components/dashboard/DashboardLayout';
import DashboardHome from './pages/dashboard/DashboardHome';
import MonitoreoPage from './pages/dashboard/MonitoreoPage';
import MulticamaraPage from './pages/dashboard/MulticamaraPage';
import GrabacionesPage from './pages/dashboard/GrabacionesPage';
import CamarasPage from './pages/dashboard/CamarasPage';
import ZonasExclusionPage from './pages/dashboard/ZonasExclusionPage';
import HistorialPage from './pages/dashboard/HistorialPage';
import AlertasPage from './pages/dashboard/AlertasPage';
import EstadoEdgePage from './pages/dashboard/EstadoEdgePage';

function LandingPage() {
  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <Navbar />
      <main>
        <HeroSection />
        <ProblemSection />
        <SolutionFlow />
        <PrivacySection />
      </main>
      <Footer />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AlertProvider>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <DashboardLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<DashboardHome />} />
              <Route path="monitoreo" element={<MonitoreoPage />} />
              <Route path="multicamara" element={<MulticamaraPage />} />
              <Route path="grabaciones" element={<GrabacionesPage />} />
              <Route
                path="camaras"
                element={
                  <ProtectedRoute requireAdmin>
                    <CamarasPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="zonas-exclusion"
                element={
                  <ProtectedRoute requireAdmin>
                    <ZonasExclusionPage />
                  </ProtectedRoute>
                }
              />
              <Route path="historial" element={<HistorialPage />} />
              <Route path="alertas" element={<AlertasPage />} />
              <Route path="estado-edge" element={<EstadoEdgePage />} />
            </Route>
          </Routes>
        </AlertProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
