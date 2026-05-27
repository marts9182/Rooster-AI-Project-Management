import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import Home from './pages/Home';
import KdpCatalog from './pages/KdpCatalog';
import KdpDetail from './pages/KdpDetail';
import EtsyCatalog from './pages/EtsyCatalog';
import EtsyDetail from './pages/EtsyDetail';
import Plans from './pages/Plans';
import Calendar from './pages/Calendar';
import Pinterest from './pages/Pinterest';
import Profile from './pages/Profile';
import Help from './pages/Help';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import './styles/shell.css';

export default function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <Header />
        <main className="app-main">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/kdp" element={<KdpCatalog />} />
            <Route path="/kdp/:slug" element={<KdpDetail />} />
            <Route path="/etsy" element={<EtsyCatalog />} />
            <Route path="/etsy/:listingId" element={<EtsyDetail />} />
            <Route path="/plans" element={<Plans />} />
            <Route path="/calendar" element={<Calendar />} />
            <Route path="/pinterest" element={<Pinterest />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/help" element={<Help />} />
            <Route path="*" element={<Home />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
