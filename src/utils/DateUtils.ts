import { TimeFilterPreset, TimeFilter } from '../types';

/**
 * Date utilities for time-based filtering
 */
export class DateUtils {
	/**
	 * Get today's date as YYYY-MM-DD string
	 */
	static today(): string {
		return this.formatDate(new Date());
	}

	/**
	 * Format a Date object to YYYY-MM-DD string
	 */
	static formatDate(date: Date): string {
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		return `${year}-${month}-${day}`;
	}

	/**
	 * Parse YYYY-MM-DD string to Date object (at midnight local time)
	 */
	static parseDate(dateStr: string): Date {
		const [year, month, day] = dateStr.split('-').map(Number);
		return new Date(year, month - 1, day);
	}

	/**
	 * Get the date range for a preset filter
	 */
	static getPresetRange(preset: TimeFilterPreset): { from: string; to: string } | null {
		if (preset === 'all') {
			return null; // No filter
		}

		const now = new Date();
		const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
		const from = this.formatDate(today);

		switch (preset) {
			case 'overdue': {
				// From distant past to yesterday
				const yesterday = new Date(today);
				yesterday.setDate(today.getDate() - 1);
				return { from: '1970-01-01', to: this.formatDate(yesterday) };
			}

			case 'today':
				return { from, to: from };

			case 'this_week': {
				// End of week (Sunday)
				const dayOfWeek = today.getDay(); // 0 = Sunday
				const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
				const endOfWeek = new Date(today);
				endOfWeek.setDate(today.getDate() + daysUntilSunday);
				return { from, to: this.formatDate(endOfWeek) };
			}

			case 'this_month': {
				// Last day of current month
				const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
				return { from, to: this.formatDate(endOfMonth) };
			}

			case 'this_quarter': {
				// End of current quarter (Mar 31, Jun 30, Sep 30, Dec 31)
				const currentMonth = today.getMonth();
				const quarterEndMonth = Math.floor(currentMonth / 3) * 3 + 2; // 2, 5, 8, or 11
				const endOfQuarter = new Date(today.getFullYear(), quarterEndMonth + 1, 0);
				return { from, to: this.formatDate(endOfQuarter) };
			}

			case 'this_year': {
				// Dec 31 of current year
				return { from, to: `${today.getFullYear()}-12-31` };
			}

			case 'custom':
				// Custom should use the provided dates, not calculate
				return { from, to: from };

			default:
				return null;
		}
	}

	/**
	 * Check if a date string (YYYY-MM-DD) is within the given range (inclusive)
	 * If dateStr is null/undefined, it's treated as "today"
	 */
	static isInRange(dateStr: string | null | undefined, fromDate: string, toDate: string): boolean {
		// Tasks without due date are treated as "due today"
		const effectiveDate = dateStr || this.today();

		const date = this.parseDate(effectiveDate);
		const from = this.parseDate(fromDate);
		const to = this.parseDate(toDate);

		// Normalize to midnight for comparison
		date.setHours(0, 0, 0, 0);
		from.setHours(0, 0, 0, 0);
		to.setHours(0, 0, 0, 0);

		return date >= from && date <= to;
	}

	/**
	 * Create a default TimeFilter (preset: 'all')
	 */
	static defaultFilter(): TimeFilter {
		const today = this.today();
		return {
			preset: 'all',
			fromDate: today,
			toDate: today
		};
	}

	/**
	 * Create a TimeFilter for a given preset
	 */
	static createFilter(preset: TimeFilterPreset): TimeFilter {
		const range = this.getPresetRange(preset);
		return {
			preset,
			fromDate: range?.from || this.today(),
			toDate: range?.to || this.today()
		};
	}

	/**
	 * Ensure from <= to, swap if necessary
	 */
	static normalizeRange(from: string, to: string): { from: string; to: string } {
		const fromDate = this.parseDate(from);
		const toDate = this.parseDate(to);

		if (fromDate > toDate) {
			return { from: to, to: from };
		}
		return { from, to };
	}
}
