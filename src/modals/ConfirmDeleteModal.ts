import { App, Modal, Setting } from 'obsidian';

export class ConfirmDeleteModal extends Modal {
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
