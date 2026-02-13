import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import type TaskBoardPlugin from '../main';
import { EditColumnIdModal } from '../modals/EditColumnIdModal';
import { ConfirmDeleteModal } from '../modals/ConfirmDeleteModal';

export class TaskBoardSettingTab extends PluginSettingTab {
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

		const columnListEl = containerEl.createEl('div', { cls: 'taskboard-settings-columns' });
		this.renderColumnList(columnListEl);

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
					this.display();
				}));

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

	renderColumnList(container: HTMLElement) {
		container.empty();
		const columns = this.plugin.settings.columns;

		for (let i = 0; i < columns.length; i++) {
			const col = columns[i];
			const row = container.createEl('div', { cls: 'taskboard-settings-column-row' });

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

			const nameInput = row.createEl('input', {
				type: 'text',
				cls: 'taskboard-settings-column-name',
				value: col.name,
				attr: { placeholder: 'Column name' }
			});
			nameInput.addEventListener('change', async (e) => {
				const target = e.target as HTMLInputElement;
				col.name = target.value || col.id;
				await this.plugin.saveSettings();
				await this.plugin.refreshBoard();
			});

			row.createEl('span', {
				cls: 'taskboard-settings-column-tag',
				text: `#status/${col.id}`
			});

			const colorInput = row.createEl('input', {
				type: 'color',
				cls: 'taskboard-settings-column-color',
				value: col.color || '#7b68ee',
				attr: { title: 'Column accent color' }
			});
			colorInput.addEventListener('change', async (e) => {
				const target = e.target as HTMLInputElement;
				col.color = target.value;
				await this.plugin.saveSettings();
				await this.plugin.refreshBoard();
			});

			const editIdBtn = row.createEl('button', {
				text: 'Edit ID',
				cls: 'taskboard-settings-edit-id-btn',
				attr: { title: 'Change status ID' }
			});
			editIdBtn.addEventListener('click', () => this.editColumnId(i));

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

	async addColumn() {
		const existingIds = this.plugin.settings.columns.map(c => c.id);

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
		this.display();
	}

	async moveColumn(index: number, direction: -1 | 1) {
		const columns = this.plugin.settings.columns;
		const newIndex = index + direction;

		if (newIndex < 0 || newIndex >= columns.length) return;

		[columns[index], columns[newIndex]] = [columns[newIndex], columns[index]];

		await this.plugin.saveSettings();
		await this.plugin.refreshBoard();
		this.display();
	}

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

	normalizePath(path: string): string {
		let normalized = path.trim();
		if (normalized.startsWith('/')) {
			normalized = normalized.substring(1);
		}
		if (!normalized.endsWith('.md')) {
			normalized = normalized + '.md';
		}
		return normalized;
	}

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

			const folderPath = path.substring(0, path.lastIndexOf('/'));
			if (folderPath) {
				const folder = this.app.vault.getAbstractFileByPath(folderPath);
				if (!folder) {
					await this.app.vault.createFolder(folderPath);
				}
			}

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
