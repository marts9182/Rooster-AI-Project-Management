/**
 * Tests for the <PuzzleAuditCard> component.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PuzzleAuditCard from '../components/PuzzleAuditCard';
import type { KdpBook } from '../api/kdp';

function makeBook(overrides: Partial<KdpBook> = {}): KdpBook {
  return {
    id: 1,
    slug: 'book-a',
    title: 'Book A',
    subtitle: null,
    asin: null,
    status: 'built',
    release_date: null,
    listing_url: null,
    page_count: 120,
    trim_size: null,
    price_usd: null,
    cover_path: null,
    output_dir: '/x',
    updated_at: '2026-05-26T00:00:00Z',
    puzzle_audit_status: null,
    puzzle_audit_at: null,
    puzzle_audit_summary_json: null,
    ...overrides,
  };
}

const SUMMARY_PASSED = JSON.stringify({
  puzzles: [
    {
      index: 1,
      difficulty: 'easy',
      clue_count: 42,
      is_unique: true,
      symmetric_180: true,
      technique_tier: 'naked_singles',
      match_difficulty: true,
    },
  ],
  totals: {
    checked: 1,
    passed: 1,
    failed: 0,
    uniqueness_failures: 0,
    symmetry_failures: 0,
    tier_mismatches: 0,
  },
});

describe('<PuzzleAuditCard>', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders unchecked chip when no audit has run', () => {
    const book = makeBook({ puzzle_audit_status: null });
    render(<PuzzleAuditCard book={book} onAudited={() => {}} />);
    expect(screen.getByText(/unchecked/i)).toBeInTheDocument();
  });

  it('renders passed chip + last-audit-at when status=passed', () => {
    const book = makeBook({
      puzzle_audit_status: 'passed',
      puzzle_audit_at: '2026-05-26T01:23:45Z',
      puzzle_audit_summary_json: SUMMARY_PASSED,
    });
    render(<PuzzleAuditCard book={book} onAudited={() => {}} />);
    // Chip text — match exactly "Passed" (the totals line uses "puzzles passed")
    expect(screen.getByText(/^Passed$/)).toBeInTheDocument();
    expect(screen.getByText(/2026-05-26/)).toBeInTheDocument();
  });

  it('renders failed chip when status=failed', () => {
    const book = makeBook({
      puzzle_audit_status: 'failed',
      puzzle_audit_at: '2026-05-26T01:23:45Z',
      puzzle_audit_summary_json: JSON.stringify({
        puzzles: [],
        totals: {
          checked: 0,
          passed: 0,
          failed: 0,
          uniqueness_failures: 0,
          symmetry_failures: 0,
          tier_mismatches: 0,
        },
        error: 'boom',
      }),
    });
    render(<PuzzleAuditCard book={book} onAudited={() => {}} />);
    expect(screen.getByText(/failed/i)).toBeInTheDocument();
  });

  it('clicking Re-audit calls the API and reports the updated book', async () => {
    const updatedBook = makeBook({
      puzzle_audit_status: 'passed',
      puzzle_audit_at: '2026-05-26T02:00:00Z',
      puzzle_audit_summary_json: SUMMARY_PASSED,
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ book: updatedBook }), { status: 200 }),
    );
    const onAudited = vi.fn();
    render(<PuzzleAuditCard book={makeBook()} onAudited={onAudited} />);
    await userEvent.click(screen.getByRole('button', { name: /re-audit/i }));
    await waitFor(() => expect(onAudited).toHaveBeenCalledWith(updatedBook));
  });

  it('collapses and expands the per-puzzle breakdown', async () => {
    const book = makeBook({
      puzzle_audit_status: 'passed',
      puzzle_audit_at: '2026-05-26T01:00:00Z',
      puzzle_audit_summary_json: SUMMARY_PASSED,
    });
    render(<PuzzleAuditCard book={book} onAudited={() => {}} />);
    // Breakdown collapsed by default — clue_count value (42) not visible
    expect(screen.queryByText(/^42$/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /show details/i }));
    expect(screen.getByText(/42/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /hide details/i }));
    await waitFor(() => expect(screen.queryByText(/^42$/)).not.toBeInTheDocument());
  });
});
