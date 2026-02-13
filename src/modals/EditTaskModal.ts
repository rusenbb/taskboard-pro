import { App, Modal, Setting, Notice } from 'obsidian';
import { Task } from '../types';
import { TaskUpdater } from '../services/TaskUpdater';

export class EditTaskModal extends Modal {
	task: Task;
	taskUpdater: TaskUpdater;
	onSaved: () => void;

	constructor(
		app: App,
		task: Task,
		taskUpdater: TaskUpdater,
		onSaved: () => void
	) {
		super(app);
		this.task = task;
		this.taskUpdater = taskUpdater;
		this.onSaved = onSaved;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('taskboard-edit-task-modal');

		contentEl.createEl('h3', { text: 'Edit Task' });

		let newText = this.task.text;
		let newDueDate = this.task.dueDate || '';

		new Setting(contentEl)
			.setName('Task')
			.addText(text => {
				text.setValue(this.task.text)
					.setPlaceholder('Task description')
					.onChange(value => {
						newText = value;
					});
				text.inputEl.style.width = '100%';
				setTimeout(() => text.inputEl.focus(), 10);
			});

		new Setting(contentEl)
			.setName('Due date')
			.addText(text => {
				text.inputEl.type = 'date';
				text.setValue(newDueDate);
				text.onChange(value => {
					newDueDate = value;
				});
			});

		new Setting(contentEl)
			.addButton(btn => btn
				.setButtonText('Cancel')
				.onClick(() => this.close()))
			.addButton(btn => btn
				.setButtonText('Save')
				.setCta()
				.onClick(async () => {
					if (!newText.trim()) {
						new Notice('Task description cannot be empty');
						return;
					}
					await this.saveTask(newText.trim(), newDueDate || null);
					this.close();
				}));
	}

	async saveTask(text: string, dueDate: string | null) {
		new Notice('Saving task...');
		const success = await this.taskUpdater.updateTaskText(this.task, text, dueDate);
		if (success) {
			new Notice('Task updated');
			this.onSaved();
		} else {
			new Notice('Failed to update task');
		}
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
