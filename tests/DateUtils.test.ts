import { describe, it, expect } from 'vitest';
import { DateUtils } from '../src/utils/DateUtils';

describe('DateUtils.formatDate', () => {
	it('formats date as YYYY-MM-DD', () => {
		const date = new Date(2025, 0, 15); // Jan 15
		expect(DateUtils.formatDate(date)).toBe('2025-01-15');
	});

	it('pads single digits', () => {
		const date = new Date(2025, 2, 5); // March 5
		expect(DateUtils.formatDate(date)).toBe('2025-03-05');
	});
});

describe('DateUtils.parseDate', () => {
	it('parses YYYY-MM-DD to Date at midnight local', () => {
		const date = DateUtils.parseDate('2025-06-15');
		expect(date.getFullYear()).toBe(2025);
		expect(date.getMonth()).toBe(5); // June is 5
		expect(date.getDate()).toBe(15);
	});
});

describe('DateUtils.isInRange', () => {
	it('returns true for date within range', () => {
		expect(DateUtils.isInRange('2025-03-15', '2025-03-01', '2025-03-31')).toBe(true);
	});

	it('returns true for date on range boundaries', () => {
		expect(DateUtils.isInRange('2025-03-01', '2025-03-01', '2025-03-31')).toBe(true);
		expect(DateUtils.isInRange('2025-03-31', '2025-03-01', '2025-03-31')).toBe(true);
	});

	it('returns false for date outside range', () => {
		expect(DateUtils.isInRange('2025-04-01', '2025-03-01', '2025-03-31')).toBe(false);
		expect(DateUtils.isInRange('2025-02-28', '2025-03-01', '2025-03-31')).toBe(false);
	});

	it('returns true for single-day range when date matches', () => {
		expect(DateUtils.isInRange('2025-03-15', '2025-03-15', '2025-03-15')).toBe(true);
	});

	it('returns false for single-day range when date differs', () => {
		expect(DateUtils.isInRange('2025-03-14', '2025-03-15', '2025-03-15')).toBe(false);
	});
});

describe('DateUtils.normalizeRange', () => {
	it('returns unchanged when from <= to', () => {
		const result = DateUtils.normalizeRange('2025-01-01', '2025-12-31');
		expect(result.from).toBe('2025-01-01');
		expect(result.to).toBe('2025-12-31');
	});

	it('swaps when from > to', () => {
		const result = DateUtils.normalizeRange('2025-12-31', '2025-01-01');
		expect(result.from).toBe('2025-01-01');
		expect(result.to).toBe('2025-12-31');
	});

	it('handles equal dates', () => {
		const result = DateUtils.normalizeRange('2025-06-15', '2025-06-15');
		expect(result.from).toBe('2025-06-15');
		expect(result.to).toBe('2025-06-15');
	});
});

describe('DateUtils.getPresetRange', () => {
	it('returns null for "all"', () => {
		expect(DateUtils.getPresetRange('all')).toBeNull();
	});

	it('returns same-day range for "today"', () => {
		const range = DateUtils.getPresetRange('today');
		expect(range).not.toBeNull();
		expect(range!.from).toBe(range!.to);
	});

	it('returns range for "overdue" ending before today', () => {
		const range = DateUtils.getPresetRange('overdue');
		expect(range).not.toBeNull();
		expect(range!.from).toBe('1970-01-01');
		// to should be yesterday
		const yesterday = new Date();
		yesterday.setDate(yesterday.getDate() - 1);
		expect(range!.to).toBe(DateUtils.formatDate(yesterday));
	});

	it('returns range for "this_week"', () => {
		const range = DateUtils.getPresetRange('this_week');
		expect(range).not.toBeNull();
		// from should be today
		expect(range!.from).toBe(DateUtils.today());
		// to should be >= from
		expect(range!.to >= range!.from).toBe(true);
	});

	it('returns range for "this_month"', () => {
		const range = DateUtils.getPresetRange('this_month');
		expect(range).not.toBeNull();
		expect(range!.from).toBe(DateUtils.today());
		// to should be last day of current month
		const now = new Date();
		const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
		expect(range!.to).toBe(DateUtils.formatDate(lastDay));
	});

	it('returns range for "this_year"', () => {
		const range = DateUtils.getPresetRange('this_year');
		expect(range).not.toBeNull();
		const year = new Date().getFullYear();
		expect(range!.to).toBe(`${year}-12-31`);
	});
});

describe('DateUtils.createFilter', () => {
	it('creates filter with correct preset', () => {
		const filter = DateUtils.createFilter('today');
		expect(filter.preset).toBe('today');
	});

	it('creates "all" filter with today as dates', () => {
		const filter = DateUtils.createFilter('all');
		expect(filter.preset).toBe('all');
		expect(filter.fromDate).toBe(DateUtils.today());
		expect(filter.toDate).toBe(DateUtils.today());
	});
});

describe('DateUtils.defaultFilter', () => {
	it('returns "all" preset', () => {
		const filter = DateUtils.defaultFilter();
		expect(filter.preset).toBe('all');
	});
});
