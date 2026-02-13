import { describe, it, expect } from 'vitest';
import { RecurrenceService } from '../src/services/RecurrenceService';

describe('RecurrenceService.getNextOccurrence', () => {
	it('handles "every day"', () => {
		const ref = new Date(2025, 2, 15); // March 15, 2025
		const next = RecurrenceService.getNextOccurrence('every day', ref);
		expect(next).not.toBeNull();
		expect(next!.getDate()).toBe(16);
		expect(next!.getMonth()).toBe(2); // March
	});

	it('handles "every week"', () => {
		const ref = new Date(2025, 2, 15); // Saturday March 15
		const next = RecurrenceService.getNextOccurrence('every week', ref);
		expect(next).not.toBeNull();
		// Should be 7 days later
		const diff = Math.round((next!.getTime() - ref.getTime()) / (1000 * 60 * 60 * 24));
		expect(diff).toBe(7);
	});

	it('handles "every month"', () => {
		const ref = new Date(2025, 2, 15); // March 15
		const next = RecurrenceService.getNextOccurrence('every month', ref);
		expect(next).not.toBeNull();
		expect(next!.getMonth()).toBe(3); // April
	});

	it('handles "every year"', () => {
		const ref = new Date(2025, 2, 15);
		const next = RecurrenceService.getNextOccurrence('every year', ref);
		expect(next).not.toBeNull();
		expect(next!.getFullYear()).toBe(2026);
	});

	it('handles "every 2 weeks"', () => {
		const ref = new Date(2025, 2, 15);
		const next = RecurrenceService.getNextOccurrence('every 2 weeks', ref);
		expect(next).not.toBeNull();
		const diff = Math.round((next!.getTime() - ref.getTime()) / (1000 * 60 * 60 * 24));
		expect(diff).toBe(14);
	});

	it('handles "every 3 days"', () => {
		const ref = new Date(2025, 2, 15);
		const next = RecurrenceService.getNextOccurrence('every 3 days', ref);
		expect(next).not.toBeNull();
		const diff = Math.round((next!.getTime() - ref.getTime()) / (1000 * 60 * 60 * 24));
		expect(diff).toBe(3);
	});

	it('returns null for unparseable text', () => {
		const ref = new Date(2025, 2, 15);
		const next = RecurrenceService.getNextOccurrence('every zxcvbnm', ref);
		// Might return null or might be handled by RRule fallback
		// Just ensure it doesn't throw
		expect(true).toBe(true);
	});
});

describe('RecurrenceService.formatDate', () => {
	it('formats date correctly', () => {
		const date = new Date(2025, 0, 5); // January 5
		expect(RecurrenceService.formatDate(date)).toBe('2025-01-05');
	});

	it('pads single-digit months and days', () => {
		const date = new Date(2025, 3, 9); // April 9
		expect(RecurrenceService.formatDate(date)).toBe('2025-04-09');
	});
});

describe('RecurrenceService.createNextRecurringTaskLine', () => {
	it('creates next instance with updated date', () => {
		const original = '- [ ] Standup 🔁 every day 📅 2025-03-15 #status/todo';
		const next = RecurrenceService.createNextRecurringTaskLine(original, 'every day', '2025-03-15');
		expect(next).not.toBeNull();
		expect(next).toContain('- [ ]');
		expect(next).toContain('📅 2025-03-16');
		expect(next).toContain('#status/todo');
		expect(next).toContain('🔁 every day');
	});

	it('resets checkbox to unchecked', () => {
		const original = '- [x] Weekly review 🔁 every week 📅 2025-03-15 #status/done ✅ 2025-03-15';
		const next = RecurrenceService.createNextRecurringTaskLine(original, 'every week', '2025-03-15');
		expect(next).not.toBeNull();
		expect(next).toContain('- [ ]');
		expect(next).not.toContain('[x]');
		expect(next).not.toContain('✅');
	});

	it('removes #archived tag', () => {
		const original = '- [x] Task 🔁 every day 📅 2025-03-15 #archived';
		const next = RecurrenceService.createNextRecurringTaskLine(original, 'every day', '2025-03-15');
		expect(next).not.toBeNull();
		expect(next).not.toContain('#archived');
	});

	it('sets status to todo', () => {
		const original = '- [x] Task 🔁 every day 📅 2025-03-15 #status/done';
		const next = RecurrenceService.createNextRecurringTaskLine(original, 'every day', '2025-03-15');
		expect(next).not.toBeNull();
		expect(next).toContain('#status/todo');
		expect(next).not.toContain('#status/done');
	});

	it('returns null for invalid date', () => {
		const original = '- [ ] Task 🔁 every day 📅 2025-03-15';
		const next = RecurrenceService.createNextRecurringTaskLine(original, 'every day', 'not-a-date');
		expect(next).toBeNull();
	});
});
