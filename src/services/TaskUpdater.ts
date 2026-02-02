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
	 * (Used when three-file system is disabled)
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

	/**
	 * Archive a task to a dedicated file (three-file system)
	 * Moves the task line from source file to archive file with metadata
	 */
	async archiveTaskToFile(task: Task, archiveFilePath: string): Promise<boolean> {
		try {
			// Get source file
			const sourceFile = this.app.vault.getAbstractFileByPath(task.filePath);
			if (!sourceFile || !(sourceFile instanceof TFile)) {
				console.error('TaskBoard: Source file not found:', task.filePath);
				return false;
			}

			// Read source file
			const sourceContent = await this.app.vault.read(sourceFile);
			const sourceLines = sourceContent.split('\n');
			const lineIndex = task.lineNumber - 1;

			if (lineIndex < 0 || lineIndex >= sourceLines.length) {
				console.error('TaskBoard: Line number out of range');
				return false;
			}

			// Prepare the archived line
			let archivedLine = sourceLines[lineIndex];
			// Remove #status/* tags
			archivedLine = archivedLine.replace(/#status\/[\w-]+/g, '').replace(/\s+/g, ' ').trim();
			// Add archive metadata
			const today = new Date().toISOString().split('T')[0];
			archivedLine = archivedLine + ` #archived 📥 ${today}`;

			// Get or create archive file
			const archiveFile = this.app.vault.getAbstractFileByPath(archiveFilePath);
			let archiveContent = '';

			if (archiveFile && archiveFile instanceof TFile) {
				archiveContent = await this.app.vault.read(archiveFile);
			} else {
				// Create archive file with header
				const folderPath = archiveFilePath.substring(0, archiveFilePath.lastIndexOf('/'));
				if (folderPath) {
					const folder = this.app.vault.getAbstractFileByPath(folderPath);
					if (!folder) {
						await this.app.vault.createFolder(folderPath);
					}
				}
				archiveContent = '# Archive\n\nCompleted and archived tasks are stored here.\n';
			}

			// Append task to archive file
			if (!archiveContent.endsWith('\n')) {
				archiveContent += '\n';
			}
			archiveContent += archivedLine + '\n';

			// Write to archive file
			if (archiveFile && archiveFile instanceof TFile) {
				await this.app.vault.modify(archiveFile, archiveContent);
			} else {
				await this.app.vault.create(archiveFilePath, archiveContent);
			}

			// Remove line from source file
			sourceLines.splice(lineIndex, 1);
			await this.app.vault.modify(sourceFile, sourceLines.join('\n'));

			console.log('TaskBoard: Task archived to file');
			return true;
		} catch (error) {
			console.error('TaskBoard: Error archiving task to file:', error);
			return false;
		}
	}

	/**
	 * Unarchive a task - move from archive file back to todo file
	 */
	async unarchiveTask(task: Task, archiveFilePath: string, todoFilePath: string): Promise<boolean> {
		try {
			// Get archive file
			const archiveFile = this.app.vault.getAbstractFileByPath(archiveFilePath);
			if (!archiveFile || !(archiveFile instanceof TFile)) {
				console.error('TaskBoard: Archive file not found:', archiveFilePath);
				return false;
			}

			// Read archive file
			const archiveContent = await this.app.vault.read(archiveFile);
			const archiveLines = archiveContent.split('\n');
			const lineIndex = task.lineNumber - 1;

			if (lineIndex < 0 || lineIndex >= archiveLines.length) {
				console.error('TaskBoard: Line number out of range in archive');
				return false;
			}

			// Prepare the restored line
			let restoredLine = archiveLines[lineIndex];
			// Reset checkbox [x] -> [ ]
			restoredLine = restoredLine.replace(/\[[xX]\]/, '[ ]');
			// Remove #archived tag and 📥 date
			restoredLine = restoredLine
				.replace(/#archived/g, '')
				.replace(/📥\s*\d{4}-\d{2}-\d{2}/g, '')
				.replace(/✅\s*\d{4}-\d{2}-\d{2}/g, '') // Also remove done date
				.replace(/\s+/g, ' ')
				.trim();
			// Add #status/todo
			restoredLine = restoredLine + ' #status/todo';

			// Get or create todo file
			const todoFile = this.app.vault.getAbstractFileByPath(todoFilePath);
			let todoContent = '';

			if (todoFile && todoFile instanceof TFile) {
				todoContent = await this.app.vault.read(todoFile);
			} else {
				// Create todo file with header
				const folderPath = todoFilePath.substring(0, todoFilePath.lastIndexOf('/'));
				if (folderPath) {
					const folder = this.app.vault.getAbstractFileByPath(folderPath);
					if (!folder) {
						await this.app.vault.createFolder(folderPath);
					}
				}
				todoContent = '# To Do\n\nActive tasks go here.\n';
			}

			// Append task to todo file
			if (!todoContent.endsWith('\n')) {
				todoContent += '\n';
			}
			todoContent += restoredLine + '\n';

			// Write to todo file
			if (todoFile && todoFile instanceof TFile) {
				await this.app.vault.modify(todoFile, todoContent);
			} else {
				await this.app.vault.create(todoFilePath, todoContent);
			}

			// Remove line from archive file
			archiveLines.splice(lineIndex, 1);
			await this.app.vault.modify(archiveFile, archiveLines.join('\n'));

			console.log('TaskBoard: Task unarchived');
			return true;
		} catch (error) {
			console.error('TaskBoard: Error unarchiving task:', error);
			return false;
		}
	}
}
