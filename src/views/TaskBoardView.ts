import { ItemView, WorkspaceLeaf, Notice, Platform, Menu, debounce } from 'obsidian';
import type TaskBoardPlugin from '../main';
import { Task, ColumnConfig, TimeFilter, TimeFilterPreset } from '../types';
import { VIEW_TYPE_TASKBOARD } from '../constants';
import { TaskScanner } from '../services/TaskScanner';
import { TaskUpdater } from '../services/TaskUpdater';
import { DateUtils } from '../utils/DateUtils';
import { AddTaskModal } from '../modals/AddTaskModal';
import { ScheduleTaskModal } from '../modals/ScheduleTaskModal';

export class TaskBoardView extends ItemView {
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

	// Collapsible filter bar (defaults to collapsed on mobile)
	filterBarCollapsed: boolean = Platform.isMobile;

	// When true, vault events skip triggering a refresh (because we just did one)
	private suppressAutoRefresh: boolean = false;

	// Debounced auto-refresh (1 second)
	private debouncedRefresh = debounce(() => {
		if (!this.suppressAutoRefresh) {
			this.refresh();
		}
	}, 1000, true);

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
		// Register vault event listeners for auto-refresh (auto-cleaned on view close)
		this.registerEvent(this.app.vault.on('modify', () => this.debouncedRefresh()));
		this.registerEvent(this.app.vault.on('delete', () => this.debouncedRefresh()));
		this.registerEvent(this.app.vault.on('rename', () => this.debouncedRefresh()));

		await this.refresh();
	}

	async refresh() {
		// Suppress auto-refresh events while we're already refreshing
		this.suppressAutoRefresh = true;
		try {
			const scanner = new TaskScanner(this.app, this.plugin.settings);
			this.tasks = await scanner.getTasks();

			if (this.plugin.settings.useThreeFileSystem && this.showArchive) {
				this.archivedTasks = await scanner.scanArchiveFile();
			} else {
				this.archivedTasks = [];
			}

			this.availableTags = this.collectAvailableTags(this.tasks);
			this.render();
		} finally {
			// Re-enable after a short delay so the vault event from our own write is ignored
			setTimeout(() => { this.suppressAutoRefresh = false; }, 500);
		}
	}

	collectAvailableTags(tasks: Task[]): string[] {
		const tagSet = new Set<string>();

		for (const task of tasks) {
			for (const tag of task.tags) {
				if (tag.startsWith('#status/') || tag === '#archived') {
					continue;
				}
				tagSet.add(tag);
			}
		}

		return Array.from(tagSet).sort();
	}

	applyTagFilter(tasks: Task[]): Task[] {
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

		const board = container.createEl('div', { cls: 'taskboard-container' });

		// Header
		const header = board.createEl('div', { cls: 'taskboard-header' });
		const headerRow = header.createEl('div', { cls: 'taskboard-header-row' });
		headerRow.createEl('h2', { text: 'TaskBoard Pro' });

		const headerButtons = headerRow.createEl('div', { cls: 'taskboard-header-buttons' });

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

		const refreshBtn = headerButtons.createEl('button', {
			cls: 'taskboard-refresh-btn',
			text: '↻ Refresh'
		});
		refreshBtn.addEventListener('click', () => this.refresh());

		// Apply filters
		let filteredTasks = this.applyTimeFilter(this.tasks);
		filteredTasks = this.applyTagFilter(filteredTasks);

		header.createEl('p', { text: `${filteredTasks.length} of ${this.tasks.length} tasks` });

		// Filter bar
		this.renderFilterBar(board, filteredTasks.length);

		// Columns
		const columnsContainer = board.createEl('div', { cls: 'taskboard-columns' });

		for (const col of this.plugin.settings.columns) {
			this.renderColumn(columnsContainer, col, filteredTasks);
		}

		// Archive section
		if (this.showArchive && this.plugin.settings.useThreeFileSystem) {
			this.renderArchiveSection(board);
		}

		// Status
		const status = board.createEl('div', { cls: 'taskboard-status' });
		status.createEl('span', {
			text: Platform.isMobile ? 'Tap a card to move it' : 'Drag & drop to change status'
		});
	}

	renderArchiveSection(container: HTMLElement) {
		const archiveSection = container.createEl('div', { cls: 'taskboard-archive-section' });

		const header = archiveSection.createEl('div', { cls: 'taskboard-archive-header' });
		header.createEl('span', { text: `Archived Tasks (${this.archivedTasks.length})` });

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

			row.createEl('span', { cls: 'taskboard-archive-text', text: task.text });

			if (task.dueDate) {
				row.createEl('span', {
					cls: 'taskboard-archive-date',
					text: `📅 ${task.dueDate}`
				});
			}

			const unarchiveBtn = row.createEl('button', {
				cls: 'taskboard-unarchive-btn',
				text: 'Unarchive'
			});
			unarchiveBtn.addEventListener('click', async () => {
				await this.unarchiveTask(task);
			});
		}
	}

	renderFilterBar(container: HTMLElement, taskCount: number) {
		const filterBar = container.createEl('div', { cls: 'taskboard-filter-bar' });

		// On mobile, add a toggle button for the filter content
		if (Platform.isMobile) {
			const toggleBtn = filterBar.createEl('button', {
				cls: 'taskboard-filter-toggle-btn',
				text: this.filterBarCollapsed
					? `Filters (${this.timeFilter.preset})  ▼`
					: `Filters  ▲`
			});
			toggleBtn.addEventListener('click', () => {
				this.filterBarCollapsed = !this.filterBarCollapsed;
				this.render();
			});

			if (this.filterBarCollapsed) {
				return; // Don't render filter content when collapsed
			}
		}

		// Filter content wrapper
		const filterContent = filterBar.createEl('div', { cls: 'taskboard-filter-content' });

		// Preset buttons
		const presetsRow = filterContent.createEl('div', { cls: 'taskboard-filter-presets' });

		const presets: { id: TimeFilterPreset; label: string }[] = [
			{ id: 'overdue', label: 'Overdue' },
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

		// Date pickers
		const dateRow = filterContent.createEl('div', { cls: 'taskboard-filter-dates' });

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

		dateRow.createEl('span', {
			cls: 'taskboard-filter-count',
			text: `Showing: ${taskCount} tasks`
		});

		// Tag filter
		if (this.availableTags.length > 0) {
			this.renderTagFilter(filterContent);
		}

		// Unscheduled toggle
		if (this.timeFilter.preset !== 'all') {
			this.renderUnscheduledToggle(filterContent);
		}
	}

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

		const unscheduledCount = this.tasks.filter(t => !t.dueDate).length;
		if (unscheduledCount > 0) {
			toggleRow.createEl('span', {
				cls: 'taskboard-unscheduled-count',
				text: `(${unscheduledCount} unscheduled)`
			});
		}
	}

	renderTagFilter(container: HTMLElement) {
		const tagRow = container.createEl('div', { cls: 'taskboard-filter-tags' });

		tagRow.createEl('span', { cls: 'taskboard-filter-tags-label', text: 'Tags:' });

		const chipsContainer = tagRow.createEl('div', { cls: 'taskboard-tag-chips' });

		for (const tag of this.availableTags) {
			const isSelected = this.selectedTags.has(tag);
			const chip = chipsContainer.createEl('button', {
				cls: 'taskboard-tag-chip' + (isSelected ? ' selected' : ''),
				text: tag
			});
			chip.addEventListener('click', () => this.toggleTagFilter(tag));
		}

		if (this.selectedTags.size > 0) {
			const clearBtn = tagRow.createEl('button', {
				cls: 'taskboard-tag-clear-btn',
				text: 'Clear'
			});
			clearBtn.addEventListener('click', () => this.clearTagFilter());
		}
	}

	toggleTagFilter(tag: string) {
		if (this.selectedTags.has(tag)) {
			this.selectedTags.delete(tag);
		} else {
			this.selectedTags.add(tag);
		}
		this.render();
	}

	clearTagFilter() {
		this.selectedTags.clear();
		this.render();
	}

	setFilterPreset(preset: TimeFilterPreset) {
		this.timeFilter = DateUtils.createFilter(preset);
		this.render();
	}

	setCustomDateRange(from: string, to: string) {
		const normalized = DateUtils.normalizeRange(from, to);
		this.timeFilter = {
			preset: 'custom',
			fromDate: normalized.from,
			toDate: normalized.to
		};
		this.render();
	}

	applyTimeFilter(tasks: Task[]): Task[] {
		if (this.timeFilter.preset === 'all') {
			return tasks;
		}

		if (this.timeFilter.preset === 'overdue') {
			return tasks.filter(task => {
				if (!task.dueDate) {
					return this.showUnscheduled;
				}
				return DateUtils.isInRange(task.dueDate, this.timeFilter.fromDate, this.timeFilter.toDate);
			});
		}

		return tasks.filter(task => {
			if (!task.dueDate) {
				return this.showUnscheduled;
			}
			return DateUtils.isInRange(task.dueDate, this.timeFilter.fromDate, this.timeFilter.toDate);
		});
	}

	renderColumn(container: HTMLElement, config: ColumnConfig, tasks: Task[]) {
		const column = container.createEl('div', {
			cls: 'taskboard-column',
			attr: { 'data-column-id': config.id }
		});

		const headerEl = column.createEl('div', { cls: 'taskboard-column-header' });

		const columnTasks = TaskScanner.filterTasksByStatus(
			tasks,
			config.id,
			this.plugin.settings.includeCompleted
		);

		const headerLeft = headerEl.createEl('div', { cls: 'taskboard-column-header-left' });
		headerLeft.createEl('span', { text: config.name });
		headerLeft.createEl('span', {
			cls: 'taskboard-column-count',
			text: `(${columnTasks.length})`
		});

		if (this.plugin.settings.useThreeFileSystem) {
			const addBtn = headerEl.createEl('button', {
				cls: 'taskboard-add-task-btn',
				attr: { title: `Add task to ${config.name}` }
			});
			addBtn.setText('+');
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

		const cardContainer = column.createEl('div', {
			cls: 'taskboard-cards',
			attr: { 'data-column-id': config.id }
		});

		// Desktop: set up HTML5 drag-and-drop zone
		if (!Platform.isMobile) {
			this.setupDropZone(cardContainer, config);
		}

		if (columnTasks.length === 0) {
			cardContainer.createEl('div', {
				cls: 'taskboard-card-empty',
				text: Platform.isMobile ? 'No tasks' : 'Drop tasks here'
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

		dropZone.addEventListener('dragleave', () => {
			dropZone.removeClass('taskboard-drop-active');
		});

		dropZone.addEventListener('drop', async (e) => {
			e.preventDefault();
			dropZone.removeClass('taskboard-drop-active');

			if (!this.draggedTask) return;

			const task = this.draggedTask;
			const newStatus = config.id;
			const isDoneColumn = config.id === 'done';

			if (task.status === newStatus) {
				this.draggedTask = null;
				return;
			}

			new Notice(`Moving task to ${config.name}...`);

			const success = await this.taskUpdater.moveTask(task, newStatus, isDoneColumn);

			if (success) {
				if (isDoneColumn && task.isRecurring) {
					new Notice('Recurring task completed - new instance created!');
				} else {
					new Notice(`Task moved to ${config.name}`);
				}
				await this.refresh();
			} else {
				new Notice('Failed to move task');
			}

			this.draggedTask = null;
		});
	}

	/**
	 * Show a context menu for moving a task to another column (mobile replacement for drag).
	 */
	showMoveMenu(e: MouseEvent | TouchEvent, task: Task) {
		const menu = new Menu();

		for (const col of this.plugin.settings.columns) {
			if (col.id === task.status) continue; // Skip current column

			menu.addItem((item) => {
				item.setTitle(`Move to ${col.name}`)
					.onClick(async () => {
						const isDoneColumn = col.id === 'done';
						new Notice(`Moving task to ${col.name}...`);
						const success = await this.taskUpdater.moveTask(task, col.id, isDoneColumn);
						if (success) {
							if (isDoneColumn && task.isRecurring) {
								new Notice('Recurring task completed - new instance created!');
							} else {
								new Notice(`Task moved to ${col.name}`);
							}
							await this.refresh();
						} else {
							new Notice('Failed to move task');
						}
					});
			});
		}

		if (e instanceof MouseEvent) {
			menu.showAtMouseEvent(e);
		} else {
			// For touch events, show at position
			const touch = e.changedTouches[0];
			menu.showAtPosition({ x: touch.clientX, y: touch.clientY });
		}
	}

	renderCard(container: HTMLElement, task: Task, showArchive: boolean = false) {
		const isMobile = Platform.isMobile;

		const card = container.createEl('div', {
			cls: 'taskboard-card' + (task.completed ? ' taskboard-card-completed' : ''),
			attr: {
				'data-task-id': task.id,
				// Only make draggable on desktop
				...(isMobile ? {} : { draggable: 'true' })
			}
		});

		if (isMobile) {
			// Mobile: tap to show move menu
			card.addEventListener('click', (e) => {
				// Don't trigger on button clicks within the card
				if ((e.target as HTMLElement).closest('button, a')) return;
				this.showMoveMenu(e, task);
			});
		} else {
			// Desktop: drag events
			card.addEventListener('dragstart', (e) => {
				this.draggedTask = task;
				card.addClass('taskboard-card-dragging');

				if (e.dataTransfer) {
					e.dataTransfer.effectAllowed = 'move';
					e.dataTransfer.setData('text/plain', task.id);
				}
			});

			card.addEventListener('dragend', () => {
				card.removeClass('taskboard-card-dragging');
				this.draggedTask = null;

				this.containerEl.querySelectorAll('.taskboard-drop-active').forEach(el => {
					el.removeClass('taskboard-drop-active');
				});
			});
		}

		// Card header
		const headerEl = card.createEl('div', { cls: 'taskboard-card-header' });

		headerEl.createEl('div', { cls: 'taskboard-card-text', text: task.text });

		if (showArchive) {
			const archiveBtn = headerEl.createEl('button', {
				cls: 'taskboard-archive-btn',
				attr: { title: 'Archive task' }
			});
			archiveBtn.setText('📦');
			archiveBtn.addEventListener('click', async (e) => {
				e.preventDefault();
				e.stopPropagation();
				await this.archiveTask(task);
			});
		}

		// Metadata row
		const metaEl = card.createEl('div', { cls: 'taskboard-card-meta' });

		if (task.dueDate) {
			const dueEl = metaEl.createEl('span', { cls: 'taskboard-card-due' });
			dueEl.createEl('span', { text: '📅 ' });
			dueEl.createEl('span', { text: this.formatDate(task.dueDate) });
		} else {
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

		if (task.isRecurring) {
			metaEl.createEl('span', { cls: 'taskboard-card-recurring', text: '🔁' });
		}

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
			success = await this.taskUpdater.archiveTaskToFile(
				task,
				this.plugin.settings.archiveFile
			);
		} else {
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

	async scheduleTaskForToday(task: Task) {
		const today = new Date().toISOString().split('T')[0];
		await this.scheduleTask(task, today);
	}

	async scheduleTaskForTomorrow(task: Task) {
		const tomorrow = new Date();
		tomorrow.setDate(tomorrow.getDate() + 1);
		const dateStr = tomorrow.toISOString().split('T')[0];
		await this.scheduleTask(task, dateStr);
	}

	openDatePickerForTask(task: Task) {
		new ScheduleTaskModal(
			this.app,
			task,
			this.taskUpdater,
			() => this.refresh()
		).open();
	}

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
