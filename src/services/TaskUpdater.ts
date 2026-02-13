import { App, TFile } from 'obsidian';
import { Task } from '../types';
import { RecurrenceService } from './RecurrenceService';

/**
 * Updates task lines in source files.
 *
 * Uses vault.process() for atomic read-modify-write on single-file mutations.
 * For two-file operations (archive/unarchive), writes destination first so that
 * partial failure results in a duplicate (recoverable) rather than data loss.
 */
export class TaskUpdater {
	private app: App;

	constructor(app: App) {
		this.app = app;
	}

	/**
	 * Find the actual line index for a task, verifying content matches.
	 * Falls back to content-based search if the line has shifted.
	 */
	private findTaskLine(lines: string[], task: Task): number {
		const lineIndex = task.lineNumber - 1;

		// Primary: check if the expected line still matches
		if (lineIndex >= 0 && lineIndex < lines.length) {
			if (lines[lineIndex].trim() === task.rawText.trim()) {
				return lineIndex;
			}
		}

		// Fallback: search for the line by content
		for (let i = 0; i < lines.length; i++) {
			if (lines[i].trim() === task.rawText.trim()) {
				return i;
			}
		}

		return -1;
	}

	/**
	 * Atomically modify a single task line using vault.process().
	 * The transformFn receives the current line and returns the replacement.
	 */
	private async modifyTaskLine(
		task: Task,
		transformFn: (line: string) => string
	): Promise<boolean> {
		try {
			const file = this.app.vault.getAbstractFileByPath(task.filePath);
			if (!file || !(file instanceof TFile)) {
				console.error('TaskBoard: File not found:', task.filePath);
				return false;
			}

			let found = false;
			await this.app.vault.process(file, (content) => {
				const lines = content.split('\n');
				const idx = this.findTaskLine(lines, task);
				if (idx === -1) {
					console.error('TaskBoard: Could not locate task line in file');
					return content; // Return unchanged
				}
				found = true;
				lines[idx] = transformFn(lines[idx]);
				return lines.join('\n');
			});

			return found;
		} catch (error) {
			console.error('TaskBoard: Error modifying task line:', error);
			return false;
		}
	}

	/**
	 * Update a task's status tag in its source file
	 */
	async updateTaskStatus(task: Task, newStatus: string): Promise<boolean> {
		return this.modifyTaskLine(task, (line) => {
			line = line.replace(/#status\/[\w-]+/g, '').replace(/\s+/g, ' ').trim();
			return line + ` #status/${newStatus}`;
		});
	}

	/**
	 * Toggle task completion (checkbox)
	 */
	async toggleTaskCompletion(task: Task, completed: boolean): Promise<boolean> {
		return this.modifyTaskLine(task, (line) => {
			if (completed) {
				line = line.replace(/\[\s\]/, '[x]');
				if (!line.includes('✅')) {
					const today = new Date().toISOString().split('T')[0];
					line = line + ` ✅ ${today}`;
				}
			} else {
				line = line.replace(/\[[xX]\]/, '[ ]');
				line = line.replace(/✅\s*\d{4}-\d{2}-\d{2}/g, '').replace(/\s+/g, ' ').trim();
			}
			return line;
		});
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

		// Then toggle completion if needed — re-read task with updated rawText
		if (markComplete !== task.completed) {
			// After status update, the raw text has changed. Re-read to get current line.
			const file = this.app.vault.getAbstractFileByPath(task.filePath);
			if (!file || !(file instanceof TFile)) return false;

			const content = await this.app.vault.read(file);
			const lines = content.split('\n');
			const idx = this.findTaskLine(lines, { ...task, rawText: lines[task.lineNumber - 1] || '' });
			if (idx === -1) return false;

			const updatedTask: Task = { ...task, rawText: lines[idx], lineNumber: idx + 1 };
			return await this.toggleTaskCompletion(updatedTask, markComplete);
		}

		return true;
	}

	/**
	 * Complete a recurring task — marks current as done and inserts new instance above.
	 * Uses vault.process() directly since it needs line insertion, not just modification.
	 */
	async completeRecurringTask(task: Task, newStatus: string): Promise<boolean> {
		try {
			const file = this.app.vault.getAbstractFileByPath(task.filePath);
			if (!file || !(file instanceof TFile)) {
				console.error('TaskBoard: File not found:', task.filePath);
				return false;
			}

			let success = false;
			await this.app.vault.process(file, (content) => {
				const lines = content.split('\n');
				const idx = this.findTaskLine(lines, task);
				if (idx === -1) {
					console.error('TaskBoard: Could not locate recurring task line');
					return content;
				}

				const currentLine = lines[idx];

				const newTaskLine = RecurrenceService.createNextRecurringTaskLine(
					currentLine,
					task.recurrence!,
					task.dueDate!
				);

				if (!newTaskLine) {
					console.error('TaskBoard: Could not create next recurring instance');
					return content;
				}

				// Mark current task as done with status
				const today = new Date().toISOString().split('T')[0];
				let completedLine = currentLine
					.replace(/\[\s\]/, '[x]')
					.replace(/#status\/[\w-]+/, `#status/${newStatus}`);

				if (!completedLine.includes('✅')) {
					completedLine = completedLine + ` ✅ ${today}`;
				}

				// Insert new task above, update current task
				lines[idx] = completedLine;
				lines.splice(idx, 0, newTaskLine);

				success = true;
				return lines.join('\n');
			});

			if (!success) {
				// Fallback to normal completion
				return await this.toggleTaskCompletion(task, true);
			}

			return true;
		} catch (error) {
			console.error('TaskBoard: Error completing recurring task:', error);
			return false;
		}
	}

	/**
	 * Archive a task — adds #archived tag so it disappears from board
	 * (Used when three-file system is disabled)
	 */
	async archiveTask(task: Task): Promise<boolean> {
		return this.modifyTaskLine(task, (line) => {
			line = line.replace(/#status\/[\w-]+/g, '').replace(/\s+/g, ' ').trim();
			return line + ' #archived';
		});
	}

	/**
	 * Archive a task to a dedicated file (three-file system).
	 * Writes destination (archive) first, then removes from source.
	 * Partial failure = duplicate task (recoverable), not data loss.
	 */
	async archiveTaskToFile(task: Task, archiveFilePath: string): Promise<boolean> {
		try {
			const sourceFile = this.app.vault.getAbstractFileByPath(task.filePath);
			if (!sourceFile || !(sourceFile instanceof TFile)) {
				console.error('TaskBoard: Source file not found:', task.filePath);
				return false;
			}

			// Read source to get the task line
			const sourceContent = await this.app.vault.read(sourceFile);
			const sourceLines = sourceContent.split('\n');
			const lineIndex = this.findTaskLine(sourceLines, task);
			if (lineIndex === -1) {
				console.error('TaskBoard: Could not locate task line for archiving');
				return false;
			}

			// Prepare the archived line
			let archivedLine = sourceLines[lineIndex];
			archivedLine = archivedLine.replace(/#status\/[\w-]+/g, '').replace(/\s+/g, ' ').trim();
			const today = new Date().toISOString().split('T')[0];
			archivedLine = archivedLine + ` #archived 📥 ${today}`;

			// Step 1: Write to archive file FIRST (safe direction)
			const archiveFile = this.app.vault.getAbstractFileByPath(archiveFilePath);
			if (archiveFile && archiveFile instanceof TFile) {
				await this.app.vault.process(archiveFile, (content) => {
					if (!content.endsWith('\n')) content += '\n';
					return content + archivedLine + '\n';
				});
			} else {
				// Create archive file
				const folderPath = archiveFilePath.substring(0, archiveFilePath.lastIndexOf('/'));
				if (folderPath) {
					const folder = this.app.vault.getAbstractFileByPath(folderPath);
					if (!folder) {
						await this.app.vault.createFolder(folderPath);
					}
				}
				const header = '# Archive\n\nCompleted and archived tasks are stored here.\n\n';
				await this.app.vault.create(archiveFilePath, header + archivedLine + '\n');
			}

			// Step 2: Remove from source file
			await this.app.vault.process(sourceFile, (content) => {
				const lines = content.split('\n');
				const idx = this.findTaskLine(lines, task);
				if (idx === -1) return content; // Task already gone, no-op
				lines.splice(idx, 1);
				return lines.join('\n');
			});

			return true;
		} catch (error) {
			console.error('TaskBoard: Error archiving task to file:', error);
			return false;
		}
	}

	/**
	 * Set or update the due date for a task
	 */
	async setTaskDueDate(task: Task, date: string): Promise<boolean> {
		return this.modifyTaskLine(task, (line) => {
			const dueDatePattern = /📅\s*\d{4}-\d{2}-\d{2}/;
			if (dueDatePattern.test(line)) {
				line = line.replace(dueDatePattern, `📅 ${date}`);
			} else {
				const statusMatch = line.match(/#status\/[\w-]+/);
				if (statusMatch) {
					const statusIndex = line.indexOf(statusMatch[0]);
					line = line.slice(0, statusIndex) + `📅 ${date} ` + line.slice(statusIndex);
				} else {
					line = line + ` 📅 ${date}`;
				}
			}
			return line.replace(/\s+/g, ' ').trim();
		});
	}

	/**
	 * Unarchive a task — move from archive file back to todo file.
	 * Writes destination (todo) first, then removes from source (archive).
	 */
	async unarchiveTask(task: Task, archiveFilePath: string, todoFilePath: string): Promise<boolean> {
		try {
			const archiveFile = this.app.vault.getAbstractFileByPath(archiveFilePath);
			if (!archiveFile || !(archiveFile instanceof TFile)) {
				console.error('TaskBoard: Archive file not found:', archiveFilePath);
				return false;
			}

			// Read archive to get the task line
			const archiveContent = await this.app.vault.read(archiveFile);
			const archiveLines = archiveContent.split('\n');
			const lineIndex = this.findTaskLine(archiveLines, task);
			if (lineIndex === -1) {
				console.error('TaskBoard: Could not locate task line in archive');
				return false;
			}

			// Prepare the restored line
			let restoredLine = archiveLines[lineIndex];
			restoredLine = restoredLine.replace(/\[[xX]\]/, '[ ]');
			restoredLine = restoredLine
				.replace(/#archived/g, '')
				.replace(/📥\s*\d{4}-\d{2}-\d{2}/g, '')
				.replace(/✅\s*\d{4}-\d{2}-\d{2}/g, '')
				.replace(/\s+/g, ' ')
				.trim();
			restoredLine = restoredLine + ' #status/todo';

			// Step 1: Write to todo file FIRST (safe direction)
			const todoFile = this.app.vault.getAbstractFileByPath(todoFilePath);
			if (todoFile && todoFile instanceof TFile) {
				await this.app.vault.process(todoFile, (content) => {
					if (!content.endsWith('\n')) content += '\n';
					return content + restoredLine + '\n';
				});
			} else {
				// Create todo file
				const folderPath = todoFilePath.substring(0, todoFilePath.lastIndexOf('/'));
				if (folderPath) {
					const folder = this.app.vault.getAbstractFileByPath(folderPath);
					if (!folder) {
						await this.app.vault.createFolder(folderPath);
					}
				}
				const header = '# To Do\n\nActive tasks go here.\n\n';
				await this.app.vault.create(todoFilePath, header + restoredLine + '\n');
			}

			// Step 2: Remove from archive file
			await this.app.vault.process(archiveFile, (content) => {
				const lines = content.split('\n');
				const idx = this.findTaskLine(lines, task);
				if (idx === -1) return content;
				lines.splice(idx, 1);
				return lines.join('\n');
			});

			return true;
		} catch (error) {
			console.error('TaskBoard: Error unarchiving task:', error);
			return false;
		}
	}
}
