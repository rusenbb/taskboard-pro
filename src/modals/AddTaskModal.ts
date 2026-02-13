import { App, Modal, Setting, TFile, Notice } from 'obsidian';

export class AddTaskModal extends Modal {
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

		new Setting(contentEl)
			.setName('Task')
			.setDesc('What needs to be done?')
			.addText(text => {
				text.setPlaceholder('Enter task description')
					.onChange(value => {
						taskText = value;
					});
				setTimeout(() => text.inputEl.focus(), 10);
			});

		new Setting(contentEl)
			.setName('Due date')
			.setDesc('Optional - when is this due?')
			.addText(text => {
				text.inputEl.type = 'date';
				text.onChange(value => {
					dueDate = value;
				});
			});

		contentEl.createEl('p', {
			cls: 'taskboard-add-task-info',
			text: `Task will be added to: ${this.todoFilePath}`
		});

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
			let taskLine = `- [ ] ${text}`;

			if (dueDate) {
				taskLine += ` 📅 ${dueDate}`;
			}

			taskLine += ` #status/${this.columnId}`;

			const file = this.app.vault.getAbstractFileByPath(this.todoFilePath);
			let content = '';

			if (file && file instanceof TFile) {
				content = await this.app.vault.read(file);
			} else {
				const folderPath = this.todoFilePath.substring(0, this.todoFilePath.lastIndexOf('/'));
				if (folderPath) {
					const folder = this.app.vault.getAbstractFileByPath(folderPath);
					if (!folder) {
						await this.app.vault.createFolder(folderPath);
					}
				}
				content = '# To Do\n\nActive tasks go here.\n';
			}

			if (!content.endsWith('\n')) {
				content += '\n';
			}
			content += taskLine + '\n';

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
