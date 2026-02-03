import { App, Plugin, WorkspaceLeaf, ItemView, PluginSettingTab, Setting, Notice, Modal, TFile } from 'obsidian';
import { Task, TaskBoardSettings, DEFAULT_SETTINGS, ColumnConfig, TimeFilter, TimeFilterPreset, validateColumnId } from './types';
import { TaskScanner } from './services/TaskScanner';
import { TaskUpdater } from './services/TaskUpdater';
import { DateUtils } from './utils/DateUtils';

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
	archivedTasks: Task[] = [];
	taskUpdater: TaskUpdater;
	draggedTask: Task | null = null;

	// Time filter state (not persisted - resets when view reopens)
	timeFilter: TimeFilter = DateUtils.defaultFilter();

	// Tag filter state
	selectedTags: Set<string> = new Set();
	availableTags: string[] = [];

	// Archive section state
	showArchive: boolean = false;

	// Unscheduled tasks visibility
	showUnscheduled: boolean = false;

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
		// Scan for tasks (uses three-file or vault-wide based on settings)
		const scanner = new TaskScanner(this.app, this.plugin.settings);
		this.tasks = await scanner.getTasks();

		// Load archived tasks if in three-file mode and archive is shown
		if (this.plugin.settings.useThreeFileSystem && this.showArchive) {
			this.archivedTasks = await scanner.scanArchiveFile();
		} else {
			this.archivedTasks = [];
		}

		// Collect available tags for filtering
		this.availableTags = this.collectAvailableTags(this.tasks);

		// Render the board
		this.render();
	}

	/**
	 * Collect unique tags from tasks (excluding status and archived tags)
	 */
	collectAvailableTags(tasks: Task[]): string[] {
		const tagSet = new Set<string>();

		for (const task of tasks) {
			for (const tag of task.tags) {
				// Skip status tags and archived tag
				if (tag.startsWith('#status/') || tag === '#archived') {
					continue;
				}
				tagSet.add(tag);
			}
		}

		// Return sorted array
		return Array.from(tagSet).sort();
	}

	/**
	 * Apply tag filter to tasks (OR logic - show tasks with ANY selected tag)
	 */
	applyTagFilter(tasks: Task[]): Task[] {
		// If no tags selected, return all tasks
		if (this.selectedTags.size === 0) {
			return tasks;
		}

		return tasks.filter(task =>
			task.tags.some(tag => this.selectedTags.has(tag))
		);
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

		// Header buttons container
		const headerButtons = headerRow.createEl('div', { cls: 'taskboard-header-buttons' });

		// Show Archive toggle (only in three-file mode)
		if (this.plugin.settings.useThreeFileSystem) {
			const archiveBtn = headerButtons.createEl('button', {
				cls: 'taskboard-archive-toggle-btn' + (this.showArchive ? ' active' : ''),
				text: this.showArchive ? 'Hide Archive' : 'Show Archive'
			});
			archiveBtn.addEventListener('click', async () => {
				this.showArchive = !this.showArchive;
				await this.refresh();
			});
		}

		// Refresh button
		const refreshBtn = headerButtons.createEl('button', {
			cls: 'taskboard-refresh-btn',
			text: '↻ Refresh'
		});
		refreshBtn.addEventListener('click', () => this.refresh());

		// Apply filters to tasks (time filter, then tag filter)
		let filteredTasks = this.applyTimeFilter(this.tasks);
		filteredTasks = this.applyTagFilter(filteredTasks);

		header.createEl('p', { text: `${filteredTasks.length} of ${this.tasks.length} tasks` });

		// Filter bar
		this.renderFilterBar(board, filteredTasks.length);

		// Columns container
		const columnsContainer = board.createEl('div', { cls: 'taskboard-columns' });

		// Render columns with time-filtered tasks
		for (const col of this.plugin.settings.columns) {
			this.renderColumn(columnsContainer, col, filteredTasks);
		}

		// Archive section (only when visible and in three-file mode)
		if (this.showArchive && this.plugin.settings.useThreeFileSystem) {
			this.renderArchiveSection(board);
		}

		// Status
		const status = board.createEl('div', { cls: 'taskboard-status' });
		status.createEl('span', { text: 'Drag & drop to change status' });
	}

	/**
	 * Render the archive section with unarchive buttons
	 */
	renderArchiveSection(container: HTMLElement) {
		const archiveSection = container.createEl('div', { cls: 'taskboard-archive-section' });

		// Header
		const header = archiveSection.createEl('div', { cls: 'taskboard-archive-header' });
		header.createEl('span', { text: `Archived Tasks (${this.archivedTasks.length})` });

		// Archive list
		const list = archiveSection.createEl('div', { cls: 'taskboard-archive-list' });

		if (this.archivedTasks.length === 0) {
			list.createEl('div', {
				cls: 'taskboard-archive-empty',
				text: 'No archived tasks'
			});
			return;
		}

		for (const task of this.archivedTasks) {
			const row = list.createEl('div', { cls: 'taskboard-archive-row' });

			// Task text
			row.createEl('span', { cls: 'taskboard-archive-text', text: task.text });

			// Due date if exists
			if (task.dueDate) {
				row.createEl('span', {
					cls: 'taskboard-archive-date',
					text: `📅 ${task.dueDate}`
				});
			}

			// Unarchive button
			const unarchiveBtn = row.createEl('button', {
				cls: 'taskboard-unarchive-btn',
				text: 'Unarchive'
			});
			unarchiveBtn.addEventListener('click', async () => {
				await this.unarchiveTask(task);
			});
		}
	}

	/**
	 * Render the time filter bar
	 */
	renderFilterBar(container: HTMLElement, taskCount: number) {
		const filterBar = container.createEl('div', { cls: 'taskboard-filter-bar' });

		// Preset buttons row
		const presetsRow = filterBar.createEl('div', { cls: 'taskboard-filter-presets' });

		const presets: { id: TimeFilterPreset; label: string }[] = [
			{ id: 'today', label: 'Today' },
			{ id: 'this_week', label: 'This Week' },
			{ id: 'this_month', label: 'This Month' },
			{ id: 'this_quarter', label: 'This Quarter' },
			{ id: 'this_year', label: 'This Year' },
			{ id: 'all', label: 'All' },
		];

		for (const preset of presets) {
			const btn = presetsRow.createEl('button', {
				cls: 'taskboard-filter-preset-btn' + (this.timeFilter.preset === preset.id ? ' active' : ''),
				text: preset.label
			});
			btn.addEventListener('click', () => this.setFilterPreset(preset.id));
		}

		// Date pickers row
		const dateRow = filterBar.createEl('div', { cls: 'taskboard-filter-dates' });

		// From date
		const fromLabel = dateRow.createEl('label', { cls: 'taskboard-filter-date-label' });
		fromLabel.createEl('span', { text: 'From:' });
		const fromInput = fromLabel.createEl('input', {
			type: 'date',
			cls: 'taskboard-filter-date-input',
			value: this.timeFilter.fromDate
		});
		fromInput.addEventListener('change', (e) => {
			const target = e.target as HTMLInputElement;
			this.setCustomDateRange(target.value, this.timeFilter.toDate);
		});

		// To date
		const toLabel = dateRow.createEl('label', { cls: 'taskboard-filter-date-label' });
		toLabel.createEl('span', { text: 'To:' });
		const toInput = toLabel.createEl('input', {
			type: 'date',
			cls: 'taskboard-filter-date-input',
			value: this.timeFilter.toDate
		});
		toInput.addEventListener('change', (e) => {
			const target = e.target as HTMLInputElement;
			this.setCustomDateRange(this.timeFilter.fromDate, target.value);
		});

		// Task count display
		dateRow.createEl('span', {
			cls: 'taskboard-filter-count',
			text: `Showing: ${taskCount} tasks`
		});

		// Tag filter row (only if there are tags)
		if (this.availableTags.length > 0) {
			this.renderTagFilter(filterBar);
		}

		// Unscheduled toggle row (only when not on 'all' preset)
		if (this.timeFilter.preset !== 'all') {
			this.renderUnscheduledToggle(filterBar);
		}
	}

	/**
	 * Render the unscheduled tasks toggle
	 */
	renderUnscheduledToggle(container: HTMLElement) {
		const toggleRow = container.createEl('div', { cls: 'taskboard-unscheduled-toggle-row' });

		const toggleBtn = toggleRow.createEl('button', {
			cls: 'taskboard-unscheduled-toggle-btn' + (this.showUnscheduled ? ' active' : ''),
			text: this.showUnscheduled ? 'Hide Unscheduled' : 'Show Unscheduled'
		});
		toggleBtn.addEventListener('click', () => {
			this.showUnscheduled = !this.showUnscheduled;
			this.render();
		});

		// Count of unscheduled tasks
		const unscheduledCount = this.tasks.filter(t => !t.dueDate).length;
		if (unscheduledCount > 0) {
			toggleRow.createEl('span', {
				cls: 'taskboard-unscheduled-count',
				text: `(${unscheduledCount} unscheduled)`
			});
		}
	}

	/**
	 * Render the tag filter chips
	 */
	renderTagFilter(container: HTMLElement) {
		const tagRow = container.createEl('div', { cls: 'taskboard-filter-tags' });

		// Label
		tagRow.createEl('span', { cls: 'taskboard-filter-tags-label', text: 'Tags:' });

		// Tag chips container
		const chipsContainer = tagRow.createEl('div', { cls: 'taskboard-tag-chips' });

		for (const tag of this.availableTags) {
			const isSelected = this.selectedTags.has(tag);
			const chip = chipsContainer.createEl('button', {
				cls: 'taskboard-tag-chip' + (isSelected ? ' selected' : ''),
				text: tag
			});
			chip.addEventListener('click', () => this.toggleTagFilter(tag));
		}

		// Clear button (only if tags are selected)
		if (this.selectedTags.size > 0) {
			const clearBtn = tagRow.createEl('button', {
				cls: 'taskboard-tag-clear-btn',
				text: 'Clear'
			});
			clearBtn.addEventListener('click', () => this.clearTagFilter());
		}
	}

	/**
	 * Toggle a tag in the filter
	 */
	toggleTagFilter(tag: string) {
		if (this.selectedTags.has(tag)) {
			this.selectedTags.delete(tag);
		} else {
			this.selectedTags.add(tag);
		}
		this.render();
	}

	/**
	 * Clear all selected tags
	 */
	clearTagFilter() {
		this.selectedTags.clear();
		this.render();
	}

	/**
	 * Set filter to a preset
	 */
	setFilterPreset(preset: TimeFilterPreset) {
		this.timeFilter = DateUtils.createFilter(preset);
		this.render();
	}

	/**
	 * Set custom date range (marks preset as 'custom')
	 */
	setCustomDateRange(from: string, to: string) {
		const normalized = DateUtils.normalizeRange(from, to);
		this.timeFilter = {
			preset: 'custom',
			fromDate: normalized.from,
			toDate: normalized.to
		};
		this.render();
	}

	/**
	 * Apply time filter to tasks
	 */
	applyTimeFilter(tasks: Task[]): Task[] {
		// 'all' preset means no time filtering
		if (this.timeFilter.preset === 'all') {
			return tasks;
		}

		return tasks.filter(task => {
			// Handle unscheduled tasks (no due date)
			if (!task.dueDate) {
				// Show unscheduled tasks only if toggle is on
				return this.showUnscheduled;
			}
			// For dated tasks, check if in range
			return DateUtils.isInRange(task.dueDate, this.timeFilter.fromDate, this.timeFilter.toDate);
		});
	}

	renderColumn(container: HTMLElement, config: ColumnConfig, tasks: Task[]) {
		const column = container.createEl('div', {
			cls: 'taskboard-column',
			attr: { 'data-column-id': config.id }
		});

		// Column header
		const headerEl = column.createEl('div', { cls: 'taskboard-column-header' });

		// Filter tasks for this column by status
		const columnTasks = TaskScanner.filterTasksByStatus(
			tasks,
			config.id,
			this.plugin.settings.includeCompleted
		);

		// Header left: name and count
		const headerLeft = headerEl.createEl('div', { cls: 'taskboard-column-header-left' });
		headerLeft.createEl('span', { text: config.name });
		headerLeft.createEl('span', {
			cls: 'taskboard-column-count',
			text: `(${columnTasks.length})`
		});

		// Add task button (only in three-file mode)
		if (this.plugin.settings.useThreeFileSystem) {
			const addBtn = headerEl.createEl('button', {
				cls: 'taskboard-add-task-btn',
				attr: { title: `Add task to ${config.name}` }
			});
			addBtn.innerHTML = '+';
			addBtn.addEventListener('click', () => {
				new AddTaskModal(
					this.app,
					config.id,
					config.name,
					this.plugin.settings.todoFile,
					() => this.refresh()
				).open();
			});
		}

		// Cards container (drop zone)
		const cardContainer = column.createEl('div', {
			cls: 'taskboard-cards',
			attr: { 'data-column-id': config.id }
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

		// Due date or quick-schedule buttons
		if (task.dueDate) {
			const dueEl = metaEl.createEl('span', { cls: 'taskboard-card-due' });
			dueEl.createEl('span', { text: '📅 ' });
			dueEl.createEl('span', { text: this.formatDate(task.dueDate) });
		} else {
			// Quick-schedule buttons for unscheduled tasks
			const scheduleContainer = metaEl.createEl('div', { cls: 'taskboard-quick-schedule' });

			const todayBtn = scheduleContainer.createEl('button', {
				cls: 'taskboard-quick-schedule-btn',
				text: 'Today'
			});
			todayBtn.addEventListener('click', async (e) => {
				e.preventDefault();
				e.stopPropagation();
				await this.scheduleTaskForToday(task);
			});

			const tomorrowBtn = scheduleContainer.createEl('button', {
				cls: 'taskboard-quick-schedule-btn',
				text: 'Tomorrow'
			});
			tomorrowBtn.addEventListener('click', async (e) => {
				e.preventDefault();
				e.stopPropagation();
				await this.scheduleTaskForTomorrow(task);
			});

			const pickerBtn = scheduleContainer.createEl('button', {
				cls: 'taskboard-quick-schedule-btn taskboard-quick-schedule-picker',
				text: '📅'
			});
			pickerBtn.addEventListener('click', async (e) => {
				e.preventDefault();
				e.stopPropagation();
				this.openDatePickerForTask(task);
			});
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

		let success: boolean;
		if (this.plugin.settings.useThreeFileSystem) {
			// Move to archive file
			success = await this.taskUpdater.archiveTaskToFile(
				task,
				this.plugin.settings.archiveFile
			);
		} else {
			// Add #archived tag in place
			success = await this.taskUpdater.archiveTask(task);
		}

		if (success) {
			new Notice('Task archived');
			await this.refresh();
		} else {
			new Notice('Failed to archive task');
		}
	}

	async unarchiveTask(task: Task) {
		new Notice('Restoring task...');
		const success = await this.taskUpdater.unarchiveTask(
			task,
			this.plugin.settings.archiveFile,
			this.plugin.settings.todoFile
		);
		if (success) {
			new Notice('Task restored to To Do');
			await this.refresh();
		} else {
			new Notice('Failed to restore task');
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
				eState: { line: task.lineNumber - 1 }
			});
		}
	}

	/**
	 * Schedule a task for today
	 */
	async scheduleTaskForToday(task: Task) {
		const today = new Date().toISOString().split('T')[0];
		await this.scheduleTask(task, today);
	}

	/**
	 * Schedule a task for tomorrow
	 */
	async scheduleTaskForTomorrow(task: Task) {
		const tomorrow = new Date();
		tomorrow.setDate(tomorrow.getDate() + 1);
		const dateStr = tomorrow.toISOString().split('T')[0];
		await this.scheduleTask(task, dateStr);
	}

	/**
	 * Open date picker modal for a task
	 */
	openDatePickerForTask(task: Task) {
		new ScheduleTaskModal(
			this.app,
			task,
			this.taskUpdater,
			() => this.refresh()
		).open();
	}

	/**
	 * Schedule a task with a specific date
	 */
	async scheduleTask(task: Task, date: string) {
		new Notice('Scheduling task...');
		const success = await this.taskUpdater.setTaskDueDate(task, date);
		if (success) {
			new Notice(`Task scheduled for ${this.formatDate(date)}`);
			await this.refresh();
		} else {
			new Notice('Failed to schedule task');
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

		// --- Columns Section ---
		containerEl.createEl('h3', { text: 'Columns' });
		containerEl.createEl('p', {
			text: 'Manage your board columns. Each column maps to a #status/{id} tag.',
			cls: 'setting-item-description'
		});

		// Column list container
		const columnListEl = containerEl.createEl('div', { cls: 'taskboard-settings-columns' });
		this.renderColumnList(columnListEl);

		// Add column button
		new Setting(containerEl)
			.addButton(btn => btn
				.setButtonText('+ Add Column')
				.setCta()
				.onClick(() => this.addColumn()));

		// --- Task Files Section ---
		containerEl.createEl('h3', { text: 'Task Files' });

		new Setting(containerEl)
			.setName('Use three-file system')
			.setDesc('Instead of scanning the vault, use dedicated files for recurring tasks, to-do items, and archive.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.useThreeFileSystem)
				.onChange(async (value) => {
					this.plugin.settings.useThreeFileSystem = value;
					await this.plugin.saveSettings();
					await this.plugin.refreshBoard();
					this.display(); // Re-render to show/hide file inputs
				}));

		// Only show file inputs when three-file system is enabled
		if (this.plugin.settings.useThreeFileSystem) {
			new Setting(containerEl)
				.setName('Recurring tasks file')
				.setDesc('File containing recurring task templates')
				.addText(text => text
					.setPlaceholder('Tasks/recurring.md')
					.setValue(this.plugin.settings.recurringTasksFile)
					.onChange(async (value) => {
						this.plugin.settings.recurringTasksFile = this.normalizePath(value);
						await this.plugin.saveSettings();
					}));

			new Setting(containerEl)
				.setName('To-do file')
				.setDesc('File for active tasks')
				.addText(text => text
					.setPlaceholder('Tasks/todo.md')
					.setValue(this.plugin.settings.todoFile)
					.onChange(async (value) => {
						this.plugin.settings.todoFile = this.normalizePath(value);
						await this.plugin.saveSettings();
					}));

			new Setting(containerEl)
				.setName('Archive file')
				.setDesc('File for archived/completed tasks')
				.addText(text => text
					.setPlaceholder('Tasks/archive.md')
					.setValue(this.plugin.settings.archiveFile)
					.onChange(async (value) => {
						this.plugin.settings.archiveFile = this.normalizePath(value);
						await this.plugin.saveSettings();
					}));

			// Create files button
			new Setting(containerEl)
				.setName('Create missing files')
				.setDesc('Create the configured files if they don\'t exist')
				.addButton(btn => btn
					.setButtonText('Create Files')
					.onClick(async () => {
						await this.createConfiguredFiles();
					}));
		}

		// --- Scanning Section ---
		containerEl.createEl('h3', { text: 'Scanning' });
		containerEl.createEl('p', {
			text: this.plugin.settings.useThreeFileSystem
				? 'These settings are ignored when using three-file system.'
				: 'Configure which folders to scan for tasks.',
			cls: 'setting-item-description'
		});

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

	/**
	 * Render the sortable column list
	 */
	renderColumnList(container: HTMLElement) {
		container.empty();
		const columns = this.plugin.settings.columns;

		for (let i = 0; i < columns.length; i++) {
			const col = columns[i];
			const row = container.createEl('div', { cls: 'taskboard-settings-column-row' });

			// Reorder buttons
			const reorderBtns = row.createEl('div', { cls: 'taskboard-settings-reorder' });

			const upBtn = reorderBtns.createEl('button', {
				text: '▲',
				cls: 'taskboard-settings-reorder-btn',
				attr: { disabled: i === 0 ? 'true' : null, title: 'Move up' }
			});
			upBtn.addEventListener('click', () => this.moveColumn(i, -1));

			const downBtn = reorderBtns.createEl('button', {
				text: '▼',
				cls: 'taskboard-settings-reorder-btn',
				attr: { disabled: i === columns.length - 1 ? 'true' : null, title: 'Move down' }
			});
			downBtn.addEventListener('click', () => this.moveColumn(i, 1));

			// Name input
			const nameInput = row.createEl('input', {
				type: 'text',
				cls: 'taskboard-settings-column-name',
				value: col.name,
				attr: { placeholder: 'Column name' }
			});
			nameInput.addEventListener('change', async (e) => {
				const target = e.target as HTMLInputElement;
				col.name = target.value || col.id; // Fallback to ID if empty
				await this.plugin.saveSettings();
				await this.plugin.refreshBoard();
			});

			// Status tag display
			row.createEl('span', {
				cls: 'taskboard-settings-column-tag',
				text: `#status/${col.id}`
			});

			// Edit ID button
			const editIdBtn = row.createEl('button', {
				text: 'Edit ID',
				cls: 'taskboard-settings-edit-id-btn',
				attr: { title: 'Change status ID' }
			});
			editIdBtn.addEventListener('click', () => this.editColumnId(i));

			// Delete button
			const deleteBtn = row.createEl('button', {
				text: 'Delete',
				cls: 'taskboard-settings-delete-btn',
				attr: {
					disabled: columns.length <= 1 ? 'true' : null,
					title: columns.length <= 1 ? 'Cannot delete last column' : 'Delete column'
				}
			});
			deleteBtn.addEventListener('click', () => this.deleteColumn(i));
		}
	}

	/**
	 * Add a new column
	 */
	async addColumn() {
		const existingIds = this.plugin.settings.columns.map(c => c.id);

		// Generate a unique default ID
		let newId = 'new';
		let counter = 1;
		while (existingIds.includes(newId)) {
			newId = `new-${counter}`;
			counter++;
		}

		this.plugin.settings.columns.push({
			id: newId,
			name: 'New Column'
		});

		await this.plugin.saveSettings();
		await this.plugin.refreshBoard();
		this.display(); // Re-render settings
	}

	/**
	 * Move a column up or down
	 */
	async moveColumn(index: number, direction: -1 | 1) {
		const columns = this.plugin.settings.columns;
		const newIndex = index + direction;

		if (newIndex < 0 || newIndex >= columns.length) return;

		// Swap columns
		[columns[index], columns[newIndex]] = [columns[newIndex], columns[index]];

		await this.plugin.saveSettings();
		await this.plugin.refreshBoard();
		this.display(); // Re-render settings
	}

	/**
	 * Edit a column's ID (with warning modal)
	 */
	editColumnId(index: number) {
		const col = this.plugin.settings.columns[index];
		const existingIds = this.plugin.settings.columns.map(c => c.id);

		new EditColumnIdModal(
			this.app,
			col.id,
			existingIds,
			async (newId: string) => {
				col.id = newId;
				await this.plugin.saveSettings();
				await this.plugin.refreshBoard();
				this.display();
			}
		).open();
	}

	/**
	 * Delete a column (with confirmation)
	 */
	async deleteColumn(index: number) {
		const columns = this.plugin.settings.columns;

		if (columns.length <= 1) {
			new Notice('Cannot delete the last column');
			return;
		}

		const col = columns[index];

		new ConfirmDeleteModal(
			this.app,
			col.name,
			col.id,
			async () => {
				columns.splice(index, 1);
				await this.plugin.saveSettings();
				await this.plugin.refreshBoard();
				this.display();
			}
		).open();
	}

	/**
	 * Normalize a file path (remove leading slash, ensure .md extension)
	 */
	normalizePath(path: string): string {
		let normalized = path.trim();
		// Remove leading slash
		if (normalized.startsWith('/')) {
			normalized = normalized.substring(1);
		}
		// Ensure .md extension
		if (!normalized.endsWith('.md')) {
			normalized = normalized + '.md';
		}
		return normalized;
	}

	/**
	 * Create the configured task files if they don't exist
	 */
	async createConfiguredFiles() {
		const settings = this.plugin.settings;
		const filesToCreate = [
			{ path: settings.recurringTasksFile, header: '# Recurring Tasks\n\nTasks with recurrence patterns (🔁) go here.\n' },
			{ path: settings.todoFile, header: '# To Do\n\nActive tasks go here.\n' },
			{ path: settings.archiveFile, header: '# Archive\n\nCompleted and archived tasks are stored here.\n' }
		];

		let created = 0;
		let skipped = 0;

		for (const { path, header } of filesToCreate) {
			const existing = this.app.vault.getAbstractFileByPath(path);
			if (existing) {
				skipped++;
				continue;
			}

			// Create parent folders if needed
			const folderPath = path.substring(0, path.lastIndexOf('/'));
			if (folderPath) {
				const folder = this.app.vault.getAbstractFileByPath(folderPath);
				if (!folder) {
					await this.app.vault.createFolder(folderPath);
				}
			}

			// Create the file
			await this.app.vault.create(path, header);
			created++;
		}

		if (created > 0) {
			new Notice(`Created ${created} file(s)`);
		}
		if (skipped > 0 && created === 0) {
			new Notice('All files already exist');
		}

		await this.plugin.refreshBoard();
	}
}

// Modal for editing column ID
class EditColumnIdModal extends Modal {
	currentId: string;
	existingIds: string[];
	onSave: (newId: string) => void;

	constructor(app: App, currentId: string, existingIds: string[], onSave: (newId: string) => void) {
		super(app);
		this.currentId = currentId;
		this.existingIds = existingIds;
		this.onSave = onSave;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h3', { text: 'Edit Column ID' });

		contentEl.createEl('p', {
			text: 'Warning: Changing the column ID will affect which tasks appear in this column. Tasks with the old #status/' + this.currentId + ' tag will no longer appear here.',
			cls: 'mod-warning'
		});

		let newIdValue = this.currentId;
		let errorEl: HTMLElement;

		new Setting(contentEl)
			.setName('Status ID')
			.setDesc('Alphanumeric, underscores, and hyphens only')
			.addText(text => {
				text.setValue(this.currentId)
					.setPlaceholder('e.g., in-review')
					.onChange(value => {
						newIdValue = value.trim().toLowerCase();
						const error = validateColumnId(newIdValue, this.existingIds, this.currentId);
						if (error) {
							errorEl.setText(error);
							errorEl.show();
						} else {
							errorEl.hide();
						}
					});
			});

		errorEl = contentEl.createEl('p', { cls: 'taskboard-settings-error' });
		errorEl.hide();

		new Setting(contentEl)
			.addButton(btn => btn
				.setButtonText('Cancel')
				.onClick(() => this.close()))
			.addButton(btn => btn
				.setButtonText('Save')
				.setCta()
				.onClick(() => {
					const error = validateColumnId(newIdValue, this.existingIds, this.currentId);
					if (error) {
						new Notice(error);
						return;
					}
					this.onSave(newIdValue);
					this.close();
				}));
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

// Modal for adding a new task
class AddTaskModal extends Modal {
	columnId: string;
	columnName: string;
	todoFilePath: string;
	onTaskCreated: () => void;

	constructor(
		app: App,
		columnId: string,
		columnName: string,
		todoFilePath: string,
		onTaskCreated: () => void
	) {
		super(app);
		this.columnId = columnId;
		this.columnName = columnName;
		this.todoFilePath = todoFilePath;
		this.onTaskCreated = onTaskCreated;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('taskboard-add-task-modal');

		contentEl.createEl('h3', { text: 'Add New Task' });

		let taskText = '';
		let dueDate = '';

		// Task text input
		new Setting(contentEl)
			.setName('Task')
			.setDesc('What needs to be done?')
			.addText(text => {
				text.setPlaceholder('Enter task description')
					.onChange(value => {
						taskText = value;
					});
				// Focus the input
				setTimeout(() => text.inputEl.focus(), 10);
			});

		// Due date input
		new Setting(contentEl)
			.setName('Due date')
			.setDesc('Optional - when is this due?')
			.addText(text => {
				text.inputEl.type = 'date';
				text.onChange(value => {
					dueDate = value;
				});
			});

		// Info text
		contentEl.createEl('p', {
			cls: 'taskboard-add-task-info',
			text: `Task will be added to: ${this.todoFilePath}`
		});

		// Buttons
		new Setting(contentEl)
			.addButton(btn => btn
				.setButtonText('Cancel')
				.onClick(() => this.close()))
			.addButton(btn => btn
				.setButtonText('Add Task')
				.setCta()
				.onClick(async () => {
					if (!taskText.trim()) {
						new Notice('Please enter a task description');
						return;
					}
					await this.createTask(taskText.trim(), dueDate);
					this.close();
				}));
	}

	async createTask(text: string, dueDate: string) {
		try {
			// Build the task line
			let taskLine = `- [ ] ${text}`;

			// Add due date if provided
			if (dueDate) {
				taskLine += ` 📅 ${dueDate}`;
			}

			// Add status tag
			taskLine += ` #status/${this.columnId}`;

			// Get or create the todo file
			const file = this.app.vault.getAbstractFileByPath(this.todoFilePath);
			let content = '';

			if (file && file instanceof TFile) {
				content = await this.app.vault.read(file);
			} else {
				// Create the file with header
				const folderPath = this.todoFilePath.substring(0, this.todoFilePath.lastIndexOf('/'));
				if (folderPath) {
					const folder = this.app.vault.getAbstractFileByPath(folderPath);
					if (!folder) {
						await this.app.vault.createFolder(folderPath);
					}
				}
				content = '# To Do\n\nActive tasks go here.\n';
			}

			// Append the task
			if (!content.endsWith('\n')) {
				content += '\n';
			}
			content += taskLine + '\n';

			// Write the file
			if (file && file instanceof TFile) {
				await this.app.vault.modify(file, content);
			} else {
				await this.app.vault.create(this.todoFilePath, content);
			}

			new Notice(`Task added to ${this.columnName}`);
			this.onTaskCreated();
		} catch (error) {
			console.error('TaskBoard: Error creating task:', error);
			new Notice('Failed to create task');
		}
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

// Modal for scheduling a task with a date picker
class ScheduleTaskModal extends Modal {
	task: Task;
	taskUpdater: TaskUpdater;
	onScheduled: () => void;

	constructor(
		app: App,
		task: Task,
		taskUpdater: TaskUpdater,
		onScheduled: () => void
	) {
		super(app);
		this.task = task;
		this.taskUpdater = taskUpdater;
		this.onScheduled = onScheduled;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('taskboard-schedule-modal');

		contentEl.createEl('h3', { text: 'Schedule Task' });

		// Show task text
		contentEl.createEl('p', {
			cls: 'taskboard-schedule-task-text',
			text: this.task.text
		});

		let selectedDate = '';

		// Date input
		new Setting(contentEl)
			.setName('Due date')
			.setDesc('When should this task be due?')
			.addText(text => {
				text.inputEl.type = 'date';
				// Default to today
				const today = new Date().toISOString().split('T')[0];
				text.setValue(today);
				selectedDate = today;
				text.onChange(value => {
					selectedDate = value;
				});
				// Focus the input
				setTimeout(() => text.inputEl.focus(), 10);
			});

		// Buttons
		new Setting(contentEl)
			.addButton(btn => btn
				.setButtonText('Cancel')
				.onClick(() => this.close()))
			.addButton(btn => btn
				.setButtonText('Schedule')
				.setCta()
				.onClick(async () => {
					if (!selectedDate) {
						new Notice('Please select a date');
						return;
					}
					await this.scheduleTask(selectedDate);
					this.close();
				}));
	}

	async scheduleTask(date: string) {
		new Notice('Scheduling task...');
		const success = await this.taskUpdater.setTaskDueDate(this.task, date);
		if (success) {
			new Notice('Task scheduled');
			this.onScheduled();
		} else {
			new Notice('Failed to schedule task');
		}
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

// Modal for confirming column deletion
class ConfirmDeleteModal extends Modal {
	columnName: string;
	columnId: string;
	onConfirm: () => void;

	constructor(app: App, columnName: string, columnId: string, onConfirm: () => void) {
		super(app);
		this.columnName = columnName;
		this.columnId = columnId;
		this.onConfirm = onConfirm;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h3', { text: 'Delete Column?' });

		contentEl.createEl('p', {
			text: `Are you sure you want to delete the "${this.columnName}" column?`
		});

		contentEl.createEl('p', {
			text: `Tasks with #status/${this.columnId} will remain in your files but won't appear on the board.`,
			cls: 'mod-warning'
		});

		new Setting(contentEl)
			.addButton(btn => btn
				.setButtonText('Cancel')
				.onClick(() => this.close()))
			.addButton(btn => btn
				.setButtonText('Delete')
				.setWarning()
				.onClick(() => {
					this.onConfirm();
					this.close();
				}));
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
