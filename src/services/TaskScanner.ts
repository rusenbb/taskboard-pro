import { App, TFile } from 'obsidian';
import { Task, TaskBoardSettings } from '../types';
import { TaskParser } from './TaskParser';

/**
 * Scans the vault or configured files for tasks
 */
export class TaskScanner {
	private app: App;
	private settings: TaskBoardSettings;

	constructor(app: App, settings: TaskBoardSettings) {
		this.app = app;
		this.settings = settings;
	}

	/**
	 * Get tasks based on current settings (three-file or vault-wide)
	 */
	async getTasks(): Promise<Task[]> {
		if (this.settings.useThreeFileSystem) {
			return this.scanConfiguredFiles();
		}
		return this.scanVault();
	}

	/**
	 * Scan only the configured recurring and todo files (three-file mode)
	 */
	async scanConfiguredFiles(): Promise<Task[]> {
		const tasks: Task[] = [];
		const filePaths = [
			this.settings.recurringTasksFile,
			this.settings.todoFile
		];

		for (const filePath of filePaths) {
			const file = this.app.vault.getAbstractFileByPath(filePath);
			if (file && file instanceof TFile) {
				const fileTasks = await this.scanFile(file);
				tasks.push(...fileTasks);
			} else {
				console.warn(`TaskBoard: Configured file not found: ${filePath}`);
			}
		}

		console.log(`TaskBoard: Scanned ${filePaths.length} configured files, found ${tasks.length} tasks`);
		return tasks;
	}

	/**
	 * Scan the archive file for archived tasks
	 */
	async scanArchiveFile(): Promise<Task[]> {
		const filePath = this.settings.archiveFile;
		const file = this.app.vault.getAbstractFileByPath(filePath);

		if (!file || !(file instanceof TFile)) {
			console.warn(`TaskBoard: Archive file not found: ${filePath}`);
			return [];
		}

		const tasks = await this.scanFile(file);
		console.log(`TaskBoard: Scanned archive file, found ${tasks.length} archived tasks`);
		return tasks;
	}

	/**
	 * Scan all markdown files in the vault and extract tasks
	 */
	async scanVault(): Promise<Task[]> {
		const tasks: Task[] = [];
		const files = this.app.vault.getMarkdownFiles();

		for (const file of files) {
			// Skip excluded folders
			if (this.isExcluded(file.path)) {
				continue;
			}

			const fileTasks = await this.scanFile(file);
			tasks.push(...fileTasks);
		}

		console.log(`TaskBoard: Scanned ${files.length} files, found ${tasks.length} tasks`);
		return tasks;
	}

	/**
	 * Scan a single file for tasks
	 */
	async scanFile(file: TFile): Promise<Task[]> {
		const tasks: Task[] = [];

		try {
			const content = await this.app.vault.cachedRead(file);
			const lines = content.split('\n');

			for (let i = 0; i < lines.length; i++) {
				const line = lines[i];

				if (TaskParser.isTask(line)) {
					const task = TaskParser.parse(line, file.path, i + 1);

					if (task) {
						// Always include tasks - filtering happens at column level
						// This ensures Done column can show completed tasks
						tasks.push(task);
					}
				}
			}
		} catch (error) {
			console.error(`TaskBoard: Error scanning ${file.path}:`, error);
		}

		return tasks;
	}

	/**
	 * Check if a path should be excluded
	 */
	private isExcluded(path: string): boolean {
		// First check exclude folders
		const isInExcluded = this.settings.excludeFolders.some(folder =>
			path.startsWith(folder + '/') || path === folder
		);
		if (isInExcluded) return true;

		// If includeFolders is set, only include files in those folders
		if (this.settings.includeFolders && this.settings.includeFolders.length > 0) {
			const isInIncluded = this.settings.includeFolders.some(folder =>
				path.startsWith(folder + '/') || path === folder
			);
			return !isInIncluded;  // Exclude if NOT in included folders
		}

		return false;
	}

	/**
	 * Filter tasks by status (for column display)
	 * This is the primary method used by columns - simpler than filterTasks()
	 */
	static filterTasksByStatus(tasks: Task[], statusId: string, includeCompleted: boolean = false): Task[] {
		// For 'done' status, always show completed tasks
		const showCompleted = includeCompleted || statusId === 'done';

		// Pre-filter: exclude archived tasks, then filter by completion status
		let filteredTasks = tasks.filter(t => !t.tags.includes('#archived'));
		filteredTasks = showCompleted ? filteredTasks : filteredTasks.filter(t => !t.completed);

		// For done column, show tasks that are either:
		// 1. Have #status/done tag, OR
		// 2. Are completed (checkbox marked)
		if (statusId === 'done') {
			return filteredTasks.filter(t => t.status === 'done' || t.completed);
		}

		return filteredTasks.filter(t => t.status === statusId);
	}

	/**
	 * Filter tasks by column filter string
	 * Supports: status:xxx, tag:xxx, due:today, due:overdue
	 * @deprecated Use filterTasksByStatus() for column filtering
	 */
	static filterTasks(tasks: Task[], filter: string, includeCompleted: boolean = false): Task[] {
		const [filterType, filterValue] = filter.split(':');

		// For 'done' status, always show completed tasks
		const showCompleted = includeCompleted || filterValue === 'done';

		// Pre-filter: exclude archived tasks, then filter by completion status
		let filteredTasks = tasks.filter(t => !t.tags.includes('#archived'));
		filteredTasks = showCompleted ? filteredTasks : filteredTasks.filter(t => !t.completed);

		switch (filterType) {
			case 'status':
				// For done column, show tasks that are either:
				// 1. Have #status/done tag, OR
				// 2. Are completed (checkbox marked)
				// Note: filteredTasks already excludes #archived
				if (filterValue === 'done') {
					return filteredTasks.filter(t => t.status === 'done' || t.completed);
				}
				return filteredTasks.filter(t => t.status === filterValue);

			case 'tag':
				return filteredTasks.filter(t => t.tags.includes(`#${filterValue}`));

			case 'due':
				return this.filterByDue(filteredTasks, filterValue);

			case 'completed':
				return tasks.filter(t => t.completed === (filterValue === 'true'));

			case 'recurring':
				return filteredTasks.filter(t => t.isRecurring === (filterValue === 'true'));

			default:
				// No filter or unknown filter - return all
				return filteredTasks;
		}
	}

	/**
	 * Filter tasks by due date
	 */
	private static filterByDue(tasks: Task[], value: string): Task[] {
		const today = new Date();
		today.setHours(0, 0, 0, 0);

		return tasks.filter(task => {
			if (!task.dueDate) return value === 'none';

			const dueDate = new Date(task.dueDate);
			dueDate.setHours(0, 0, 0, 0);

			const diffDays = Math.floor((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

			switch (value) {
				case 'today':
					return diffDays === 0;
				case 'tomorrow':
					return diffDays === 1;
				case 'week':
					return diffDays >= 0 && diffDays <= 7;
				case 'overdue':
					return diffDays < 0;
				case 'none':
					return !task.dueDate;
				default:
					return true;
			}
		});
	}
}
