import { useState } from 'react';
import { Responsive, WidthProvider, type Layouts } from 'react-grid-layout';
import KdpTile from '../components/dashboard/KdpTile';
import EtsyTile from '../components/dashboard/EtsyTile';
import PlansTile from '../components/dashboard/PlansTile';
import CalendarTile from '../components/dashboard/CalendarTile';
import PinterestTile from '../components/dashboard/PinterestTile';

const ResponsiveGridLayout = WidthProvider(Responsive);

const LAYOUT_KEY = 'dashboard_layout_v1';

const DEFAULT_LAYOUT: Layouts = {
  lg: [
    { i: 'kdp',       x: 0, y: 0, w: 4, h: 6, minW: 3, minH: 4 },
    { i: 'etsy',      x: 4, y: 0, w: 4, h: 6, minW: 3, minH: 4 },
    { i: 'pinterest', x: 8, y: 0, w: 4, h: 6, minW: 3, minH: 4 },
    { i: 'plans',     x: 0, y: 6, w: 6, h: 6, minW: 3, minH: 4 },
    { i: 'calendar',  x: 6, y: 6, w: 6, h: 6, minW: 3, minH: 4 },
  ],
  md: [
    { i: 'kdp',       x: 0, y: 0, w: 4, h: 6, minW: 3, minH: 4 },
    { i: 'etsy',      x: 4, y: 0, w: 4, h: 6, minW: 3, minH: 4 },
    { i: 'pinterest', x: 8, y: 0, w: 4, h: 6, minW: 3, minH: 4 },
    { i: 'plans',     x: 0, y: 6, w: 6, h: 6, minW: 3, minH: 4 },
    { i: 'calendar',  x: 6, y: 6, w: 6, h: 6, minW: 3, minH: 4 },
  ],
  sm: [
    { i: 'kdp',       x: 0, y: 0,  w: 6, h: 6 },
    { i: 'etsy',      x: 0, y: 6,  w: 6, h: 6 },
    { i: 'pinterest', x: 0, y: 12, w: 6, h: 6 },
    { i: 'plans',     x: 0, y: 18, w: 6, h: 6 },
    { i: 'calendar',  x: 0, y: 24, w: 6, h: 6 },
  ],
};

function loadStoredLayouts(): Layouts {
  try {
    const stored = localStorage.getItem(LAYOUT_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Layouts;
      // Sanity check the shape — at minimum the lg key should be an array.
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_LAYOUT;
}

/**
 * Dashboard home — five draggable + resizable tiles backed by
 * react-grid-layout. The drag handle is the tile header (`.tile-header`).
 * Layout is persisted to `localStorage` under `dashboard_layout_v1`; the
 * "Reset layout" button restores defaults.
 */
export default function Home() {
  const [layouts, setLayouts] = useState<Layouts>(() => loadStoredLayouts());

  const handleLayoutChange = (_current: unknown, all: Layouts) => {
    setLayouts(all);
    try {
      localStorage.setItem(LAYOUT_KEY, JSON.stringify(all));
    } catch {
      /* ignore */
    }
  };

  const resetLayout = () => {
    setLayouts(DEFAULT_LAYOUT);
    try {
      localStorage.removeItem(LAYOUT_KEY);
    } catch {
      /* ignore */
    }
  };

  return (
    <section className="dashboard-home">
      <div className="dashboard-home-header page-header">
        <h1>Dashboard</h1>
        <div className="page-header-actions">
          <button
            type="button"
            className="reset-layout-btn"
            onClick={resetLayout}
          >
            Reset layout
          </button>
        </div>
      </div>
      <ResponsiveGridLayout
        className="dashboard-grid"
        layouts={layouts}
        breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
        cols={{ lg: 12, md: 12, sm: 6, xs: 4, xxs: 2 }}
        rowHeight={50}
        onLayoutChange={handleLayoutChange}
        draggableHandle=".tile-header"
        draggableCancel=".tile-view-all"
        margin={[16, 16]}
      >
        <div key="kdp"><KdpTile /></div>
        <div key="etsy"><EtsyTile /></div>
        <div key="pinterest"><PinterestTile /></div>
        <div key="plans"><PlansTile /></div>
        <div key="calendar"><CalendarTile /></div>
      </ResponsiveGridLayout>
    </section>
  );
}
