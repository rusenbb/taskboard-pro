import { App, TFile } from 'obsidian';
import { Task } from '../types';
import { RecurrenceService } from './RecurrenceService';

/**
 * Updates task lines in source files
 */
export class TaskUpdater {
	private app: App;

	constructor(app: App) {
		this.app = app;
	}

	/**
	 * Update a task's status tag in its source file
	 */
	async updateTaskStatus(task: Task, newStatus: string): Promise<boolean> {
		try {
			const file = this.app.vault.getAbstractFileByPath(task.filePath);
			if (!file || !(file instanceof TFile)) {
				console.error('TaskBoard: File not found:', task.filePath);
				return false;
			}

			const content = await this.app.vault.read(file);
			const lines = content.split('\n');
			const lineIndex = task.lineNumber - 1;

			if (lineIndex < 0 || lineIndex >= lines.length) {
				console.error('TaskBoard: Line number out of range');
				return false;
			}

			let line = lines[lineIndex];

			// Remove existing status tag
			line = line.replace(/#status\/[\w-]+/g, '').replace(/\s+/g, ' ').trim();

			// Add new status tag at the end
			line = line + ` #status/${newStatus}`;

			lines[lineIndex] = line;

			await this.app.vault.modify(file, lines.join('\n'));

			console.log(`TaskBoard: Updated task status to ${newStatus}`);
			return true;
		} catch (error) {
			console.error('TaskBoard: Error updating task:', error);
			return false;
		}
	}

	/**
	 * Toggle task completion (checkbox)
	 */
	async toggleTaskCompletion(task: Task, completed: boolean): Promise<boolean> {
		try {
			const file = this.app.vault.getAbstractFileByPath(task.filePath);
			if (!file || !(file instanceof TFile)) {
				console.error('TaskBoard: File not found:', task.filePath);
				return false;
			}

			const content = await this.app.vault.read(file);
			const lines = content.split('\n');
			const lineIndex = task.lineNumber - 1;

			if (lineIndex < 0 || lineIndex >= lines.length) {
				console.error('TaskBoard: Line number out of range');
				return false;
			}

			let line = lines[lineIndex];

			if (completed) {
				// Mark as done: [ ] -> [x]
				line = line.replace(/\[\s\]/, '[x]');

				// Add done date if not present
				if (!line.includes('✅')) {
					const today = new Date().toISOString().split('T')[0];
					line = line + ` ✅ ${today}`;
				}
			} else {
				// Mark as not done: [x] -> [ ]
				line = line.replace(/\[[xX]\]/, '[ ]');

				// Remove done date
				line = line.replace(/✅\s*\d{4}-\d{2}-\d{2}/g, '').replace(/\s+/g, ' ').trim();
			}

			lines[lineIndex] = line;

			await this.app.vault.modify(file, lines.join('\n'));

			console.log(`TaskBoard: Toggled task completion to ${completed}`);
			return true;
		} catch (error) {
			console.error('TaskBoard: Error toggling task:', error);
			return false;
		}
	}

	/**
	 * Move task to a new status and optionally complete it
	 */
	async moveTask(task: Task, newStatus: string, markComplete: boolean = false): Promise<boolean> {
		// Special handling for recurring tasks being completed
		if (markComplete && task.isRecurring && task.recurrence && task.dueDate) {
			return await this.completeRecurringTask(task, newStatus);
		}

		// First update status
		const statusUpdated = await this.updateTaskStatus(task, newStatus);
		if (!statusUpdated) return false;

		// Then toggle completion if needed
		if (markComplete !== task.completed) {
			return await this.toggleTaskCompletion(
				{ ...task, rawText: '' }, // Re-read from file
				markComplete
			);
		}

		return true;
	}

	/**
	 * Complete a recurring task - marks current as done and creates new instance
	 */
	async completeRecurringTask(task: Task, newStatus: string): Promise<boolean> {
		try {
			const file = this.app.vault.getAbstractFileByPath(task.filePath);
			if (!file || !(file instanceof TFile)) {
				console.error('TaskBoard: File not found:', task.filePath);
				return false;
			}

			const content = await this.app.vault.read(file);
			const lines = content.split('\n');
			const lineIndex = task.lineNumber - 1;

			if (lineIndex < 0 || lineIndex >= lines.length) {
				console.error('TaskBoard: Line number out of range');
				return false;
			}

			const currentLine = lines[lineIndex];

			// Create the new recurring task instance
			const newTaskLine = RecurrenceService.createNextRecurringTaskLine(
				currentLine,
				task.recurrence!,
				task.dueDate!
			);

			if (!newTaskLine) {
				console.error('TaskBoard: Could not create next recurring instance');
				// Fallback to normal completion
				return await this.toggleTaskCompletion(task, true);
			}

			// Mark current task as done with status
			const today = new Date().toISOString().split('T')[0];
			let completedLine = currentLine
				.replace(/\[\s\]/, '[x]')
				.replace(/#status\/[\w-]+/, `#status/${newStatus}`);

			// Add done date if not present
			if (!completedLine.includes('✅')) {
				completedLine = completedLine + ` ✅ ${today}`;
			}

			// Update the file: insert new task above, update current task
			lines[lineIndex] = completedLine;
			lines.splice(lineIndex, 0, newTaskLine); // Insert new task above

			await this.app.vault.modify(file, lines.join('\n'));

			console.log('TaskBoard: Recurring task completed, new instance created');
			return true;
		} catch (error) {
			console.error('TaskBoard: Error completing recurring task:', error);
			return false;
		}
	}

	/**
	 * Archive a task - adds #archived tag so it disappears from board
	 */
	async archiveTask(task: Task): Promise<boolean> {
		try {
			const file = this.app.vault.getAbstractFileByPath(task.filePath);
			if (!file || !(file instanceof TFile)) {
				console.error('TaskBoard: File not found:', task.filePath);
				return false;
			}

			const content = await this.app.vault.read(file);
			const lines = content.split('\n');
			const lineIndex = task.lineNumber - 1;

			if (lineIndex < 0 || lineIndex >= lines.length) {
				console.error('TaskBoard: Line number out of range');
				return false;
			}

			let line = lines[lineIndex];

			// Remove status tag and add #archived
			line = line.replace(/#status\/[\w-]+/g, '').replace(/\s+/g, ' ').trim();
			line = line + ' #archived';

			lines[lineIndex] = line;

			await this.app.vault.modify(file, lines.join('\n'));

			console.log('TaskBoard: Task archived');
			return true;
		} catch (error) {
			console.error('TaskBoard: Error archiving task:', error);
			return false;
		}
	}
}
