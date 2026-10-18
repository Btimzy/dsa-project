// Pure functions for filtering and sorting event summaries using mergeSort.
// Does not mutate input arrays or event objects.

import { DomainError } from './errors.js';
import { mergeSort } from './sorting.js';

function parseDateBoundary(value, isEndOfDay = false) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const iso = isEndOfDay ? `${trimmed}T23:59:59.999Z` : `${trimmed}T00:00:00.000Z`;
      const date = new Date(iso);
      if (Number.isNaN(date.getTime())) {
        throw new DomainError('VALIDATION', `Invalid date: ${value}`);
      }
      return date.getTime();
    }
    const date = new Date(trimmed);
    if (Number.isNaN(date.getTime())) {
      throw new DomainError('VALIDATION', `Invalid date: ${value}`);
    }
    return date.getTime();
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new DomainError('VALIDATION', 'Invalid date');
    }
    return value.getTime();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  throw new DomainError('VALIDATION', `Invalid date: ${value}`);
}

export function filterEvents(summaries, criteria = {}) {
  if (!Array.isArray(summaries)) {
    throw new DomainError('VALIDATION', 'summaries must be an array');
  }

  const {
    q,
    city,
    from,
    to,
    maxPriceCents,
    onlyAvailable,
  } = criteria;

  const fromTime = parseDateBoundary(from, false);
  const toTime = parseDateBoundary(to, true);

  if (fromTime !== null && toTime !== null && fromTime > toTime) {
    throw new DomainError('VALIDATION', '"from" date cannot be after "to" date');
  }

  let validatedMaxPrice = null;
  if (maxPriceCents !== undefined && maxPriceCents !== null) {
    if (!Number.isSafeInteger(maxPriceCents) || maxPriceCents < 0) {
      throw new DomainError('VALIDATION', 'maxPriceCents must be a non-negative whole number of cents');
    }
    validatedMaxPrice = maxPriceCents;
  }

  const queryTerm = typeof q === 'string' ? q.trim().toLowerCase() : null;
  const cityFilter = typeof city === 'string' ? city.trim().toLowerCase() : null;

  return summaries.filter((event) => {
    // 1. Text search on title or venue (case-insensitive substring)
    if (queryTerm) {
      const titleMatch = (event.title || '').toLowerCase().includes(queryTerm);
      const venueMatch = (event.venue || '').toLowerCase().includes(queryTerm);
      if (!titleMatch && !venueMatch) {
        return false;
      }
    }

    // 2. City filter (case-insensitive exact match)
    if (cityFilter) {
      if ((event.city || '').toLowerCase() !== cityFilter) {
        return false;
      }
    }

    // 3. Date range filter (from and to inclusive)
    const eventTime = new Date(event.startsAt).getTime();
    if (fromTime !== null && eventTime < fromTime) {
      return false;
    }
    if (toTime !== null && eventTime > toTime) {
      return false;
    }

    // 4. Max price filter
    if (validatedMaxPrice !== null) {
      if (event.minPriceCents === null || event.minPriceCents === undefined) {
        return false; // Events with no tiers are left out of price filters
      }
      if (event.minPriceCents > validatedMaxPrice) {
        return false;
      }
    }

    // 5. Availability filter
    if (onlyAvailable) {
      if ((event.seatsLeft || 0) <= 0) {
        return false;
      }
    }

    return true;
  });
}

function tieBreaker(a, b) {
  const titleA = a.title || '';
  const titleB = b.title || '';
  const titleComp = titleA.localeCompare(titleB);
  if (titleComp !== 0) return titleComp;

  const idA = a.id || '';
  const idB = b.id || '';
  return idA.localeCompare(idB);
}

export function sortEvents(summaries, sortBy = 'date') {
  if (!Array.isArray(summaries)) {
    throw new DomainError('VALIDATION', 'summaries must be an array');
  }

  const allowedSorts = new Set(['date', 'price', 'availability']);
  if (!allowedSorts.has(sortBy)) {
    throw new DomainError('VALIDATION', `Unknown sortBy: ${sortBy}`);
  }

  let comparator;

  if (sortBy === 'date') {
    comparator = (a, b) => {
      const timeA = new Date(a.startsAt).getTime();
      const timeB = new Date(b.startsAt).getTime();
      if (timeA !== timeB) {
        return timeA - timeB;
      }
      return tieBreaker(a, b);
    };
  } else if (sortBy === 'price') {
    comparator = (a, b) => {
      const priceA = a.minPriceCents;
      const priceB = b.minPriceCents;

      // Events with no price come last
      const hasPriceA = priceA !== null && priceA !== undefined;
      const hasPriceB = priceB !== null && priceB !== undefined;

      if (!hasPriceA && !hasPriceB) {
        return tieBreaker(a, b);
      }
      if (!hasPriceA) return 1;
      if (!hasPriceB) return -1;

      if (priceA !== priceB) {
        return priceA - priceB;
      }
      return tieBreaker(a, b);
    };
  } else if (sortBy === 'availability') {
    comparator = (a, b) => {
      const seatsA = a.seatsLeft || 0;
      const seatsB = b.seatsLeft || 0;
      if (seatsA !== seatsB) {
        return seatsB - seatsA; // Most seats left first
      }
      return tieBreaker(a, b);
    };
  }

  return mergeSort(summaries, comparator);
}

export function searchEvents(summaries, criteria = {}, sortBy = 'date') {
  const filtered = filterEvents(summaries, criteria);
  return sortEvents(filtered, sortBy);
}
