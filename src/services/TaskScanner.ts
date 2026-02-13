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

		return this.scanFile(file);
	}

	/**
	 * Scan all markdown files in the vault and extract tasks
	 */
	async scanVault(): Promise<Task[]> {
		const tasks: Task[] = [];
		const files = this.app.vault.getMarkdownFiles();

		for (const file of files) {
			if (this.isExcluded(file.path)) {
				continue;
			}

			const fileTasks = await this.scanFile(file);
			tasks.push(...fileTasks);
		}

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
		const isInExcluded = this.settings.excludeFolders.some(folder =>
			path.startsWith(folder + '/') || path === folder
		);
		if (isInExcluded) return true;

		if (this.settings.includeFolders && this.settings.includeFolders.length > 0) {
			const isInIncluded = this.settings.includeFolders.some(folder =>
				path.startsWith(folder + '/') || path === folder
			);
			return !isInIncluded;
		}

		return false;
	}

	/**
	 * Filter tasks by status (for column display)
	 */
	static filterTasksByStatus(tasks: Task[], statusId: string, includeCompleted: boolean = false): Task[] {
		const showCompleted = includeCompleted || statusId === 'done';

		let filteredTasks = tasks.filter(t => !t.tags.includes('#archived'));
		filteredTasks = showCompleted ? filteredTasks : filteredTasks.filter(t => !t.completed);

		if (statusId === 'done') {
			return filteredTasks.filter(t => t.status === 'done' || t.completed);
		}

		return filteredTasks.filter(t => t.status === statusId);
	}
}
