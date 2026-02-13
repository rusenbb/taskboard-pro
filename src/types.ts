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

// Column configuration (simplified - filter is always derivable as status:{id})
export interface ColumnConfig {
	id: string;      // Status value (e.g., "todo", "review") - used as #status/{id} tag
	name: string;    // Display name (e.g., "To Do", "In Review")
	color?: string;  // CSS color for column accent (header border, card left border)
}

// Time filter types
export type TimeFilterPreset = 'overdue' | 'today' | 'this_week' | 'this_month' | 'this_quarter' | 'this_year' | 'all' | 'custom';

export interface TimeFilter {
	preset: TimeFilterPreset;
	fromDate: string;  // YYYY-MM-DD
	toDate: string;    // YYYY-MM-DD
}

// Plugin settings
export interface TaskBoardSettings {
	columns: ColumnConfig[];
	excludeFolders: string[];
	includeFolders: string[];  // Empty = scan all, otherwise only these folders
	includeCompleted: boolean;

	// Three-file system settings
	useThreeFileSystem: boolean;   // Toggle between vault-wide and three-file modes
	recurringTasksFile: string;    // e.g., "Tasks/recurring.md"
	todoFile: string;              // e.g., "Tasks/todo.md"
	archiveFile: string;           // e.g., "Tasks/archive.md"
}

// Column ID validation
const COLUMN_ID_REGEX = /^[\w-]+$/;
const RESERVED_COLUMN_IDS = ['archived'];

export function validateColumnId(id: string, existingIds: string[], currentId?: string): string | null {
	const trimmedId = id.trim().toLowerCase();

	if (!trimmedId) {
		return 'Column ID cannot be empty';
	}

	if (!COLUMN_ID_REGEX.test(trimmedId)) {
		return 'Column ID can only contain letters, numbers, underscores, and hyphens';
	}

	if (RESERVED_COLUMN_IDS.includes(trimmedId)) {
		return `"${trimmedId}" is a reserved ID`;
	}

	// Check uniqueness (skip current ID when editing)
	const otherIds = currentId ? existingIds.filter(id => id !== currentId) : existingIds;
	if (otherIds.includes(trimmedId)) {
		return 'Column ID must be unique';
	}

	return null; // Valid
}

export const DEFAULT_SETTINGS: TaskBoardSettings = {
	columns: [
		{ id: 'todo', name: 'To Do' },
		{ id: 'doing', name: 'Doing' },
		{ id: 'done', name: 'Done' },
	],
	excludeFolders: ['.obsidian', 'templates'],
	includeFolders: [],  // Empty = scan entire vault
	includeCompleted: false,

	// Three-file system defaults
	useThreeFileSystem: false,
	recurringTasksFile: 'Tasks/recurring.md',
	todoFile: 'Tasks/todo.md',
	archiveFile: 'Tasks/archive.md',
};
