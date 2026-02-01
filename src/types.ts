// Task data structure
export interface Task {
	// Identity
	id: string;
	filePath: string;
	lineNumber: number;
	rawText: string;

	// Content
	text: string;
	completed: boolean;

	// Dates (ISO strings or null)
	dueDate: string | null;
	scheduledDate: string | null;
	doneDate: string | null;

	// Recurrence
	recurrence: string | null;
	isRecurring: boolean;

	// Organization
	tags: string[];
	status: string | null; // extracted from #status/xxx tag
}

// Column configuration
export interface ColumnConfig {
	id: string;
	name: string;
	filter: string;
}

// Plugin settings
export interface TaskBoardSettings {
	columns: ColumnConfig[];
	excludeFolders: string[];
	includeFolders: string[];  // Empty = scan all, otherwise only these folders
	includeCompleted: boolean;
}

export const DEFAULT_SETTINGS: TaskBoardSettings = {
	columns: [
		{ id: 'todo', name: 'To Do', filter: 'status:todo' },
		{ id: 'doing', name: 'Doing', filter: 'status:doing' },
		{ id: 'done', name: 'Done', filter: 'status:done' },
	],
	excludeFolders: ['.obsidian', 'templates'],
	includeFolders: [],  // Empty = scan entire vault
	includeCompleted: false,
};
