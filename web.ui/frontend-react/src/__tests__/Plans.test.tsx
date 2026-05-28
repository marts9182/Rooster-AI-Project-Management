import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Plans from '../pages/Plans';
import type { PlanEntry } from '../api/plans';

const samples: PlanEntry[] = [
  {
    kind: 'spec',
    slug: 'shipped-thing',
    title: 'Shipped Thing Design',
    date: '2026-05-20',
    status: 'open',
    path: '/x/specs/2026-05-20-shipped-thing-design.md',
    completedAt: null,
    shipped: true,
  },
  {
    kind: 'spec',
    slug: 'open-thing',
    title: 'Open Thing Design',
    date: '2026-05-22',
    status: 'open',
    path: '/x/specs/2026-05-22-open-thing-design.md',
    completedAt: null,
  },
  {
    kind: 'plan',
    slug: 'in-flight-thing',
    title: 'In-Flight Thing',
    date: '2026-05-21',
    status: 'in-flight',
    path: '/x/plans/2026-05-21-in-flight-thing.md',
    progress: { open: 1, done: 2, total: 3, percent: 67 },
    completedAt: null,
  },
  {
    kind: 'plan',
    slug: 'done-thing',
    title: 'Done Thing',
    date: '2026-05-18',
    status: 'done',
    path: '/x/plans/2026-05-18-done-thing.md',
    progress: { open: 0, done: 5, total: 5, percent: 100 },
    completedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

function mockListPlans(entries: PlanEntry[]): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ entries }),
    text: async () => JSON.stringify({ entries }),
  } as unknown as Response;
}

describe('Plans page', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });
  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('renders a done plan card with the collapsed visual + completedAt copy', async () => {
    fetchSpy.mockResolvedValueOnce(mockListPlans(samples));
    render(
      <MemoryRouter>
        <Plans />
      </MemoryRouter>,
    );
    const doneCard = await screen.findByText('Done Thing');
    const cardEl = doneCard.closest('.plan-card');
    expect(cardEl).not.toBeNull();
    expect(cardEl?.classList.contains('plan-card--done-collapsed')).toBe(true);
    expect(within(cardEl as HTMLElement).queryByRole('progressbar')).toBeNull();
    expect(within(cardEl as HTMLElement).getByText(/Completed\s*—/)).toBeInTheDocument();
  });

  it('renders a shipped spec with the green "shipped" badge instead of "open"', async () => {
    fetchSpy.mockResolvedValueOnce(mockListPlans(samples));
    render(
      <MemoryRouter>
        <Plans />
      </MemoryRouter>,
    );
    const specCard = (await screen.findByText('Shipped Thing Design')).closest('.plan-card');
    expect(specCard).not.toBeNull();
    const badges = within(specCard as HTMLElement).getAllByText(/shipped|open/i);
    expect(badges.some((b) => /shipped/i.test(b.textContent ?? ''))).toBe(true);
    expect(badges.some((b) => /^open$/i.test((b.textContent ?? '').trim()))).toBe(false);
  });

  it('renders an in-flight plan card with progress bar and no dimming', async () => {
    fetchSpy.mockResolvedValueOnce(mockListPlans(samples));
    render(
      <MemoryRouter>
        <Plans />
      </MemoryRouter>,
    );
    const inflightCard = (await screen.findByText('In-Flight Thing')).closest('.plan-card');
    expect(inflightCard).not.toBeNull();
    expect(inflightCard?.classList.contains('plan-card--done-collapsed')).toBe(false);
    expect(within(inflightCard as HTMLElement).getByRole('progressbar')).toBeInTheDocument();
  });
});
