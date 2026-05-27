import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Header from '../components/Header';
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
import * as remindersApi from '../api/reminders';
import * as kdpApi from '../api/kdp';
import * as etsyApi from '../api/etsy';
import * as plansApi from '../api/plans';
import * as calendarApi from '../api/calendar';
import * as pinterestApi from '../api/pinterest';
import * as profileApi from '../api/profile';

// Mock react-grid-layout so the Home dashboard renders without measuring DOM
// widths (jsdom doesn't lay out, so the live layout engine crashes here).
vi.mock('react-grid-layout', () => ({
  Responsive: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="rgl-mock">{children}</div>
  ),
  WidthProvider: <P,>(C: React.ComponentType<P>) => C,
}));

beforeEach(() => {
  vi.spyOn(remindersApi, 'listReminders').mockResolvedValue([]);
  vi.spyOn(kdpApi, 'listBooks').mockResolvedValue([]);
  vi.spyOn(etsyApi, 'listListings').mockResolvedValue([]);
  vi.spyOn(plansApi, 'listPlans').mockResolvedValue([]);
  vi.spyOn(calendarApi, 'listEvents').mockResolvedValue([]);
  vi.spyOn(pinterestApi, 'listQueue').mockResolvedValue([]);
  vi.spyOn(pinterestApi, 'listHistory').mockResolvedValue([]);
  vi.spyOn(profileApi, 'getProfile').mockResolvedValue({
    id: 1,
    display_name: 'Test',
    pen_names: [],
    kdp_author_url: '',
    etsy_shop_url: '',
    pinterest_url: '',
    gmail_address: '',
    brand_palette: [],
    time_zone: '',
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Header />
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
  it('renders the Home (Dashboard) page at /', () => {
    renderAt('/');
    expect(
      screen.getByRole('heading', { level: 1, name: /Dashboard/i }),
    ).toBeInTheDocument();
  });

  it('renders the KDP Catalog page at /kdp', () => {
    renderAt('/kdp');
    expect(
      screen.getByRole('heading', { level: 1, name: /KDP catalog/i }),
    ).toBeInTheDocument();
  });

  it('renders the Calendar page at /calendar', () => {
    renderAt('/calendar');
    expect(
      screen.getByRole('heading', { level: 1, name: /^Calendar$/i }),
    ).toBeInTheDocument();
  });

  it('Header shows the 5 nav links (KDP, Etsy, Plans, Calendar, Pinterest)', () => {
    renderAt('/');
    const expected = ['KDP', 'Etsy', 'Plans', 'Calendar', 'Pinterest'];
    for (const label of expected) {
      expect(
        screen.getByRole('link', { name: new RegExp(`^${label}$`, 'i') }),
      ).toBeInTheDocument();
    }
  });
});
