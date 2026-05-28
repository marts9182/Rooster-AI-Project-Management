import { describe, it, expect } from 'vitest';
import { kdpToDashboardStatus } from '../../kdp/status_map.js';

describe('kdpToDashboardStatus', () => {
  it('maps "Live" to published', () => {
    expect(kdpToDashboardStatus('Live')).toEqual({
      status: 'published',
      mappedFrom: 'Live',
    });
  });

  it('maps "In Review" to in_review', () => {
    expect(kdpToDashboardStatus('In Review')).toEqual({
      status: 'in_review',
      mappedFrom: 'In Review',
    });
  });

  it('maps "Draft" to built', () => {
    expect(kdpToDashboardStatus('Draft')).toEqual({
      status: 'built',
      mappedFrom: 'Draft',
    });
  });

  it('maps "Blocked" to archived', () => {
    expect(kdpToDashboardStatus('Blocked')).toEqual({
      status: 'archived',
      mappedFrom: 'Blocked',
    });
  });

  it('maps "Unpublished" to archived', () => {
    expect(kdpToDashboardStatus('Unpublished')).toEqual({
      status: 'archived',
      mappedFrom: 'Unpublished',
    });
  });

  it('is case-insensitive on the input label', () => {
    expect(kdpToDashboardStatus('LIVE')).toEqual({
      status: 'published',
      mappedFrom: 'LIVE',
    });
    expect(kdpToDashboardStatus('in review')).toEqual({
      status: 'in_review',
      mappedFrom: 'in review',
    });
  });

  it('returns {ambiguous:true} for unknown labels', () => {
    expect(kdpToDashboardStatus('Pending Review')).toEqual({ ambiguous: true });
    expect(kdpToDashboardStatus('')).toEqual({ ambiguous: true });
  });
});
