import { Plugin, WorkspaceLeaf } from 'obsidian';
import { TaskBoardSettings, DEFAULT_SETTINGS } from './types';
import { VIEW_TYPE_TASKBOARD } from './constants';
import { TaskBoardView } from './views/TaskBoardView';
import { TaskBoardSettingTab } from './settings/TaskBoardSettingTab';

export default class TaskBoardPlugin extends Plugin {
	settings: TaskBoardSettings;

	async onload() {
		await this.loadSettings();

		this.registerView(
			VIEW_TYPE_TASKBOARD,
			(leaf) => new TaskBoardView(leaf, this)
		);

		this.addRibbonIcon('kanban', 'Open TaskBoard', () => {
			this.activateView();
		});

		this.addCommand({
			id: 'open-taskboard',
			name: 'Open TaskBoard',
			callback: () => {
				this.activateView();
			}
		});

		this.addCommand({
			id: 'refresh-taskboard',
			name: 'Refresh TaskBoard',
			callback: () => {
				this.refreshBoard();
			}
		});

		this.addSettingTab(new TaskBoardSettingTab(this.app, this));
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
