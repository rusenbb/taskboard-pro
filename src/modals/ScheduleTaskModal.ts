import { App, Modal, Setting, Notice } from 'obsidian';
import { Task } from '../types';
import { TaskUpdater } from '../services/TaskUpdater';

export class ScheduleTaskModal extends Modal {
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

		contentEl.createEl('p', {
			cls: 'taskboard-schedule-task-text',
			text: this.task.text
		});

		let selectedDate = '';

		new Setting(contentEl)
			.setName('Due date')
			.setDesc('When should this task be due?')
			.addText(text => {
				text.inputEl.type = 'date';
				const today = new Date().toISOString().split('T')[0];
				text.setValue(today);
				selectedDate = today;
				text.onChange(value => {
					selectedDate = value;
				});
				setTimeout(() => text.inputEl.focus(), 10);
			});

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
