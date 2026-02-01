import { Task } from '../types';

/**
 * Parse a single line of markdown into a Task object
 * Supports Tasks plugin emoji format
 */
export class TaskParser {
	// Regex patterns for Tasks plugin format
	private static readonly TASK_REGEX = /^(\s*)[-*+]\s*\[([ xX])\]\s*(.*)$/;
	private static readonly DUE_DATE_REGEX = /📅\s*(\d{4}-\d{2}-\d{2})/;
	private static readonly SCHEDULED_REGEX = /⏳\s*(\d{4}-\d{2}-\d{2})/;
	private static readonly DONE_DATE_REGEX = /✅\s*(\d{4}-\d{2}-\d{2})/;
	private static readonly RECURRENCE_REGEX = /🔁\s*([^📅⏳✅]+)/;
	private static readonly TAG_REGEX = /#[\w/-]+/g;
	private static readonly STATUS_TAG_REGEX = /#status\/([\w-]+)/;

	/**
	 * Check if a line is a task
	 */
	static isTask(line: string): boolean {
		return this.TASK_REGEX.test(line);
	}

	/**
	 * Parse a task line into a Task object
	 */
	static parse(line: string, filePath: string, lineNumber: number): Task | null {
		const match = line.match(this.TASK_REGEX);
		if (!match) return null;

		const [, , checkbox, content] = match;
		const completed = checkbox.toLowerCase() === 'x';

		// Extract dates
		const dueMatch = content.match(this.DUE_DATE_REGEX);
		const scheduledMatch = content.match(this.SCHEDULED_REGEX);
		const doneMatch = content.match(this.DONE_DATE_REGEX);
		const recurrenceMatch = content.match(this.RECURRENCE_REGEX);

		// Extract tags
		const tags = content.match(this.TAG_REGEX) || [];

		// Extract status from #status/xxx tag
		const statusMatch = content.match(this.STATUS_TAG_REGEX);
		const status = statusMatch ? statusMatch[1] : null;

		// Clean text (remove emoji metadata)
		const text = this.cleanText(content);

		// Generate unique ID
		const id = `${filePath}:${lineNumber}`;

		return {
			id,
			filePath,
			lineNumber,
			rawText: line,
			text,
			completed,
			dueDate: dueMatch ? dueMatch[1] : null,
			scheduledDate: scheduledMatch ? scheduledMatch[1] : null,
			doneDate: doneMatch ? doneMatch[1] : null,
			recurrence: recurrenceMatch ? recurrenceMatch[1].trim() : null,
			isRecurring: !!recurrenceMatch,
			tags,
			status,
		};
	}

	/**
	 * Remove emoji metadata from task text for display
	 */
	private static cleanText(content: string): string {
		return content
			.replace(this.DUE_DATE_REGEX, '')
			.replace(this.SCHEDULED_REGEX, '')
			.replace(this.DONE_DATE_REGEX, '')
			.replace(this.RECURRENCE_REGEX, '')
			.replace(this.TAG_REGEX, '')
			.replace(/\s+/g, ' ')
			.trim();
	}
}
