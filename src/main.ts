import { App, Plugin, WorkspaceLeaf, ItemView, PluginSettingTab, Setting, Notice } from 'obsidian';
import { Task, TaskBoardSettings, DEFAULT_SETTINGS, ColumnConfig } from './types';
import { TaskScanner } from './services/TaskScanner';
import { TaskUpdater } from './services/TaskUpdater';

// View type identifier
const VIEW_TYPE_TASKBOARD = 'taskboard-view';

// Main plugin class
export default class TaskBoardPlugin extends Plugin {
	settings: TaskBoardSettings;

	async onload() {
		console.log('TaskBoard Pro: Loading plugin');

		await this.loadSettings();

		// Register the custom view
		this.registerView(
			VIEW_TYPE_TASKBOARD,
			(leaf) => new TaskBoardView(leaf, this)
		);

		// Add ribbon icon
		this.addRibbonIcon('kanban', 'Open TaskBoard', () => {
			this.activateView();
		});

		// Add command to open board
		this.addCommand({
			id: 'open-taskboard',
			name: 'Open TaskBoard',
			callback: () => {
				this.activateView();
			}
		});

		// Add command to refresh board
		this.addCommand({
			id: 'refresh-taskboard',
			name: 'Refresh TaskBoard',
			callback: () => {
				this.refreshBoard();
			}
		});

		// Add settings tab
		this.addSettingTab(new TaskBoardSettingTab(this.app, this));

		console.log('TaskBoard Pro: Plugin loaded successfully');
	}

	onunload() {
		console.log('TaskBoard Pro: Unloading plugin');
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async activateView() {
		const { workspace } = this.app;

		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(VIEW_TYPE_TASKBOARD);

		if (leaves.length > 0) {
			leaf = leaves[0];
		} else {
			leaf = workspace.getRightLeaf(false);
			if (leaf) {
				await leaf.setViewState({ type: VIEW_TYPE_TASKBOARD, active: true });
			}
		}

		if (leaf) {
			workspace.revealLeaf(leaf);
		}
	}

	async refreshBoard() {
		const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_TASKBOARD);
		for (const leaf of leaves) {
			const view = leaf.view as TaskBoardView;
			if (view && view.refresh) {
				await view.refresh();
			}
		}
	}
}

// TaskBoard View
class TaskBoardView extends ItemView {
	plugin: TaskBoardPlugin;
	tasks: Task[] = [];
	taskUpdater: TaskUpdater;
	draggedTask: Task | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: TaskBoardPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.taskUpdater = new TaskUpdater(this.app);
	}

	getViewType() {
		return VIEW_TYPE_TASKBOARD;
	}

	getDisplayText() {
		return 'TaskBoard';
	}

	getIcon() {
		return 'kanban';
	}

	async onOpen() {
		await this.refresh();
	}

	async refresh() {
		// Scan vault for tasks
		const scanner = new TaskScanner(this.app, this.plugin.settings);
		this.tasks = await scanner.scanVault();

		// Render the board
		this.render();
	}

	render() {
		const container = this.containerEl.children[1];
		container.empty();

		// Create board container
		const board = container.createEl('div', { cls: 'taskboard-container' });

		// Header
		const header = board.createEl('div', { cls: 'taskboard-header' });
		const headerRow = header.createEl('div', { cls: 'taskboard-header-row' });
		headerRow.createEl('h2', { text: 'TaskBoard Pro' });

		// Refresh button
		const refreshBtn = headerRow.createEl('button', {
			cls: 'taskboard-refresh-btn',
			text: '↻ Refresh'
		});
		refreshBtn.addEventListener('click', () => this.refresh());

		header.createEl('p', { text: `${this.tasks.length} tasks found in vault` });

		// Columns container
		const columnsContainer = board.createEl('div', { cls: 'taskboard-columns' });

		// Render columns
		for (const col of this.plugin.settings.columns) {
			this.renderColumn(columnsContainer, col);
		}

		// Status
		const status = board.createEl('div', { cls: 'taskboard-status' });
		status.createEl('span', { text: 'M3/M4 Complete - Drag & drop working' });
	}

	renderColumn(container: HTMLElement, config: ColumnConfig) {
		const column = container.createEl('div', {
			cls: 'taskboard-column',
			attr: { 'data-column-id': config.id }
		});

		// Column header
		const headerEl = column.createEl('div', { cls: 'taskboard-column-header' });

		// Filter tasks for this column
		const columnTasks = TaskScanner.filterTasks(this.tasks, config.filter);

		headerEl.createEl('span', { text: config.name });
		headerEl.createEl('span', {
			cls: 'taskboard-column-count',
			text: `(${columnTasks.length})`
		});

		// Cards container (drop zone)
		const cardContainer = column.createEl('div', {
			cls: 'taskboard-cards',
			attr: { 'data-column-id': config.id, 'data-column-filter': config.filter }
		});

		// Setup drop zone
		this.setupDropZone(cardContainer, config);

		if (columnTasks.length === 0) {
			cardContainer.createEl('div', {
				cls: 'taskboard-card-empty',
				text: 'Drop tasks here'
			});
		} else {
			for (const task of columnTasks) {
				this.renderCard(cardContainer, task, config.id === 'done');
			}
		}
	}

	setupDropZone(dropZone: HTMLElement, config: ColumnConfig) {
		dropZone.addEventListener('dragover', (e) => {
			e.preventDefault();
			dropZone.addClass('taskboard-drop-active');
		});

		dropZone.addEventListener('dragleave', (e) => {
			dropZone.removeClass('taskboard-drop-active');
		});

		dropZone.addEventListener('drop', async (e) => {
			e.preventDefault();
			dropZone.removeClass('taskboard-drop-active');

			if (!this.draggedTask) return;

			const task = this.draggedTask;
			const newStatus = config.id; // 'todo', 'doing', 'done'
			const isDoneColumn = config.id === 'done';

			// Check if actually moving to different column
			if (task.status === newStatus) {
				this.draggedTask = null;
				return;
			}

			// Show feedback
			new Notice(`Moving task to ${config.name}...`);

			// moveTask handles recurring tasks automatically now
			const success = await this.taskUpdater.moveTask(task, newStatus, isDoneColumn);

			if (success) {
				// Special message for recurring tasks
				if (isDoneColumn && task.isRecurring) {
					new Notice('Recurring task completed - new instance created!');
				} else {
					new Notice(`Task moved to ${config.name}`);
				}
				// Refresh to show updated state
				await this.refresh();
			} else {
				new Notice('Failed to move task');
			}

			this.draggedTask = null;
		});
	}

	renderCard(container: HTMLElement, task: Task, showArchive: boolean = false) {
		const card = container.createEl('div', {
			cls: 'taskboard-card' + (task.completed ? ' taskboard-card-completed' : ''),
			attr: {
				draggable: 'true',
				'data-task-id': task.id
			}
		});

		// Drag events
		card.addEventListener('dragstart', (e) => {
			this.draggedTask = task;
			card.addClass('taskboard-card-dragging');

			// Set drag image
			if (e.dataTransfer) {
				e.dataTransfer.effectAllowed = 'move';
				e.dataTransfer.setData('text/plain', task.id);
			}
		});

		card.addEventListener('dragend', () => {
			card.removeClass('taskboard-card-dragging');
			this.draggedTask = null;

			// Remove all drop-active classes
			this.containerEl.querySelectorAll('.taskboard-drop-active').forEach(el => {
				el.removeClass('taskboard-drop-active');
			});
		});

		// Card header with text and archive button
		const headerEl = card.createEl('div', { cls: 'taskboard-card-header' });

		// Task text
		headerEl.createEl('div', { cls: 'taskboard-card-text', text: task.text });

		// Archive button (only in Done column)
		if (showArchive) {
			const archiveBtn = headerEl.createEl('button', {
				cls: 'taskboard-archive-btn',
				attr: { title: 'Archive task' }
			});
			archiveBtn.innerHTML = '📦';
			archiveBtn.addEventListener('click', async (e) => {
				e.preventDefault();
				e.stopPropagation();
				await this.archiveTask(task);
			});
		}

		// Metadata row
		const metaEl = card.createEl('div', { cls: 'taskboard-card-meta' });

		// Due date
		if (task.dueDate) {
			const dueEl = metaEl.createEl('span', { cls: 'taskboard-card-due' });
			dueEl.createEl('span', { text: '📅 ' });
			dueEl.createEl('span', { text: this.formatDate(task.dueDate) });
		}

		// Recurrence indicator
		if (task.isRecurring) {
			metaEl.createEl('span', { cls: 'taskboard-card-recurring', text: '🔁' });
		}

		// Completed indicator
		if (task.completed) {
			metaEl.createEl('span', { cls: 'taskboard-card-done', text: '✅' });
		}

		// Source file link
		const sourceEl = card.createEl('div', { cls: 'taskboard-card-source' });
		const link = sourceEl.createEl('a', {
			text: this.getFileName(task.filePath),
			cls: 'taskboard-card-link'
		});
		link.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			this.openTaskFile(task);
		});
	}

	async archiveTask(task: Task) {
		new Notice('Archiving task...');
		const success = await this.taskUpdater.archiveTask(task);
		if (success) {
			new Notice('Task archived');
			await this.refresh();
		} else {
			new Notice('Failed to archive task');
		}
	}

	formatDate(dateStr: string): string {
		const today = new Date();
		today.setHours(0, 0, 0, 0);

		const taskDate = new Date(dateStr);
		taskDate.setHours(0, 0, 0, 0);

		const diffDays = Math.floor((taskDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

		if (diffDays === 0) return 'Today';
		if (diffDays === 1) return 'Tomorrow';
		if (diffDays === -1) return 'Yesterday';
		if (diffDays < -1) return `${Math.abs(diffDays)} days ago`;
		if (diffDays <= 7) return `In ${diffDays} days`;

		return dateStr;
	}

	getFileName(path: string): string {
		const parts = path.split('/');
		return parts[parts.length - 1].replace('.md', '');
	}

	async openTaskFile(task: Task) {
		const file = this.app.vault.getAbstractFileByPath(task.filePath);
		if (file) {
			const leaf = this.app.workspace.getLeaf(false);
			await leaf.openFile(file as any, {
				eState: { line: task.lineNumber }
			});
		}
	}

	async onClose() {
		// Cleanup
	}
}

// Settings Tab
class TaskBoardSettingTab extends PluginSettingTab {
	plugin: TaskBoardPlugin;

	constructor(app: App, plugin: TaskBoardPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'TaskBoard Pro Settings' });

		new Setting(containerEl)
			.setName('Include only these folders')
			.setDesc('Comma-separated list of folders to scan. Leave empty to scan entire vault.')
			.addText(text => text
				.setPlaceholder('7-Kanban-Boards, Projects')
				.setValue(this.plugin.settings.includeFolders.join(', '))
				.onChange(async (value) => {
					this.plugin.settings.includeFolders = value
						.split(',')
						.map(s => s.trim())
						.filter(s => s.length > 0);
					await this.plugin.saveSettings();
					await this.plugin.refreshBoard();
				}));

		new Setting(containerEl)
			.setName('Excluded folders')
			.setDesc('Comma-separated list of folders to exclude')
			.addText(text => text
				.setPlaceholder('.obsidian, templates')
				.setValue(this.plugin.settings.excludeFolders.join(', '))
				.onChange(async (value) => {
					this.plugin.settings.excludeFolders = value.split(',').map(s => s.trim());
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Include completed tasks')
			.setDesc('Show completed tasks in the board')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.includeCompleted)
				.onChange(async (value) => {
					this.plugin.settings.includeCompleted = value;
					await this.plugin.saveSettings();
					await this.plugin.refreshBoard();
				}));
	}
}
