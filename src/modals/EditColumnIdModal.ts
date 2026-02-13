import { App, Modal, Setting, Notice } from 'obsidian';
import { validateColumnId } from '../types';

export class EditColumnIdModal extends Modal {
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
