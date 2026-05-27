import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import Home from '../pages/Home';
import KdpCatalog from '../pages/KdpCatalog';
import KdpDetail from '../pages/KdpDetail';
import EtsyCatalog from '../pages/EtsyCatalog';
import EtsyDetail from '../pages/EtsyDetail';
import Plans from '../pages/Plans';
import CalendarPage from '../pages/Calendar';
import Pinterest from '../pages/Pinterest';
import Profile from '../pages/Profile';
import Help from '../pages/Help';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Sidebar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/kdp" element={<KdpCatalog />} />
        <Route path="/kdp/:slug" element={<KdpDetail />} />
        <Route path="/etsy" element={<EtsyCatalog />} />
        <Route path="/etsy/:listingId" element={<EtsyDetail />} />
        <Route path="/plans" element={<Plans />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/pinterest" element={<Pinterest />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/help" element={<Help />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('router shell', () => {
  it('renders the Home page at /', () => {
    renderAt('/');
    expect(screen.getByRole('heading', { level: 1, name: /Today/i })).toBeInTheDocument();
  });

  it('renders the KDP Catalog page at /kdp', () => {
    renderAt('/kdp');
    expect(screen.getByRole('heading', { level: 1, name: /KDP catalog/i })).toBeInTheDocument();
  });

  it('renders the Calendar page at /calendar', () => {
    renderAt('/calendar');
    expect(screen.getByRole('heading', { level: 1, name: /^Calendar$/i })).toBeInTheDocument();
  });

  it('Sidebar shows all 8 nav links (Home, KDP, Etsy, Plans, Calendar, Pinterest, Profile, Help)', () => {
    renderAt('/');
    const expected = ['Home', 'KDP', 'Etsy', 'Plans', 'Calendar', 'Pinterest', 'Profile', 'Help'];
    for (const label of expected) {
      // NavLink renders an <a>; we use accessible role 'link' with the label name.
      expect(screen.getByRole('link', { name: new RegExp(label, 'i') })).toBeInTheDocument();
    }
  });
});
