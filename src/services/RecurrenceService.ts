import { RRule, RRuleSet, rrulestr } from 'rrule';

/**
 * Service for handling recurring task logic
 * Parses recurrence patterns and calculates next dates
 */
export class RecurrenceService {

	/**
	 * Parse a recurrence text like "every day" or "every week on Monday"
	 * and return the next occurrence date after the reference date
	 */
	static getNextOccurrence(recurrenceText: string, referenceDate: Date): Date | null {
		try {
			// Clean up the recurrence text
			const cleanText = recurrenceText
				.toLowerCase()
				.replace(/^every\s+/, '')
				.trim();

			// Try to parse with RRule
			const rule = this.textToRRule(cleanText, referenceDate);
			if (!rule) return null;

			// Get the next occurrence after reference date
			const nextDate = rule.after(referenceDate, false);
			return nextDate;
		} catch (error) {
			console.error('RecurrenceService: Error parsing recurrence:', error);
			return null;
		}
	}

	/**
	 * Convert human-readable text to RRule
	 */
	private static textToRRule(text: string, dtstart: Date): RRule | null {
		try {
			// Common patterns mapping
			const patterns: { [key: string]: Partial<any> } = {
				'day': { freq: RRule.DAILY },
				'daily': { freq: RRule.DAILY },
				'week': { freq: RRule.WEEKLY },
				'weekly': { freq: RRule.WEEKLY },
				'month': { freq: RRule.MONTHLY },
				'monthly': { freq: RRule.MONTHLY },
				'year': { freq: RRule.YEARLY },
				'yearly': { freq: RRule.YEARLY },
			};

			// Day name mapping
			const dayMap: { [key: string]: any } = {
				'monday': RRule.MO,
				'tuesday': RRule.TU,
				'wednesday': RRule.WE,
				'thursday': RRule.TH,
				'friday': RRule.FR,
				'saturday': RRule.SA,
				'sunday': RRule.SU,
			};

			let options: Partial<any> = { dtstart };

			// Parse "every X days/weeks/months"
			const intervalMatch = text.match(/^(\d+)\s*(day|week|month|year)s?$/);
			if (intervalMatch) {
				const interval = parseInt(intervalMatch[1]);
				const unit = intervalMatch[2];
				options = { ...options, ...patterns[unit], interval };
				return new RRule(options);
			}

			// Parse "week on Monday" or just "monday"
			const weekdayMatch = text.match(/(?:week\s+on\s+)?(\w+day)/i);
			if (weekdayMatch) {
				const dayName = weekdayMatch[1].toLowerCase();
				if (dayMap[dayName]) {
					options = {
						...options,
						freq: RRule.WEEKLY,
						byweekday: [dayMap[dayName]],
					};
					return new RRule(options);
				}
			}

			// Parse "month on the Xth" or "month on the Xst/nd/rd"
			const monthDayMatch = text.match(/month\s+on\s+the\s+(\d+)(?:st|nd|rd|th)?/i);
			if (monthDayMatch) {
				const dayOfMonth = parseInt(monthDayMatch[1]);
				options = {
					...options,
					freq: RRule.MONTHLY,
					bymonthday: [dayOfMonth],
				};
				return new RRule(options);
			}

			// Parse "X weeks"
			const weeksMatch = text.match(/^(\d+)\s*weeks?$/);
			if (weeksMatch) {
				options = {
					...options,
					freq: RRule.WEEKLY,
					interval: parseInt(weeksMatch[1]),
				};
				return new RRule(options);
			}

			// Simple frequency match
			for (const [key, value] of Object.entries(patterns)) {
				if (text.includes(key)) {
					options = { ...options, ...value };
					return new RRule(options);
				}
			}

			// Try RRule's built-in text parser as fallback
			try {
				return RRule.fromText(text);
			} catch {
				return null;
			}
		} catch (error) {
			console.error('RecurrenceService: Error creating RRule:', error);
			return null;
		}
	}

	/**
	 * Format a date as YYYY-MM-DD
	 */
	static formatDate(date: Date): string {
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		return `${year}-${month}-${day}`;
	}

	/**
	 * Create a new task line with updated due date for next occurrence
	 */
	static createNextRecurringTaskLine(
		originalLine: string,
		recurrenceText: string,
		currentDueDate: string
	): string | null {
		// Parse current due date
		const currentDate = new Date(currentDueDate);
		if (isNaN(currentDate.getTime())) {
			console.error('RecurrenceService: Invalid current due date');
			return null;
		}

		// Get next occurrence
		const nextDate = this.getNextOccurrence(recurrenceText, currentDate);
		if (!nextDate) {
			console.error('RecurrenceService: Could not calculate next occurrence');
			return null;
		}

		const nextDateStr = this.formatDate(nextDate);

		// Create new task line:
		// 1. Reset checkbox to unchecked
		// 2. Update due date
		// 3. Remove done date if present
		// 4. Remove #archived if present
		// 5. Keep recurrence and other metadata

		let newLine = originalLine
			// Reset checkbox
			.replace(/\[[xX]\]/, '[ ]')
			// Update due date
			.replace(/📅\s*\d{4}-\d{2}-\d{2}/, `📅 ${nextDateStr}`)
			// Remove done date
			.replace(/✅\s*\d{4}-\d{2}-\d{2}/g, '')
			// Remove archived tag
			.replace(/#archived/g, '')
			// Clean up extra spaces
			.replace(/\s+/g, ' ')
			.trim();

		// Ensure status is todo for new instance
		newLine = newLine.replace(/#status\/[\w-]+/, '#status/todo');

		// If no status tag, add one
		if (!newLine.includes('#status/')) {
			newLine = newLine + ' #status/todo';
		}

		return newLine;
	}
}
