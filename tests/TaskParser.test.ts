import { describe, it, expect } from 'vitest';
import { TaskParser } from '../src/services/TaskParser';

describe('TaskParser.isTask', () => {
	it('recognizes standard checkbox lines', () => {
		expect(TaskParser.isTask('- [ ] Some task')).toBe(true);
		expect(TaskParser.isTask('- [x] Completed task')).toBe(true);
		expect(TaskParser.isTask('- [X] Completed task')).toBe(true);
	});

	it('recognizes indented tasks', () => {
		expect(TaskParser.isTask('  - [ ] Indented task')).toBe(true);
		expect(TaskParser.isTask('\t- [x] Tab indented')).toBe(true);
	});

	it('recognizes asterisk and plus list markers', () => {
		expect(TaskParser.isTask('* [ ] Asterisk task')).toBe(true);
		expect(TaskParser.isTask('+ [ ] Plus task')).toBe(true);
	});

	it('rejects non-task lines', () => {
		expect(TaskParser.isTask('- Regular list item')).toBe(false);
		expect(TaskParser.isTask('# Heading')).toBe(false);
		expect(TaskParser.isTask('Some regular text')).toBe(false);
		expect(TaskParser.isTask('')).toBe(false);
		expect(TaskParser.isTask('- [] Missing space in checkbox')).toBe(false);
	});
});

describe('TaskParser.parse', () => {
	it('parses a basic task', () => {
		const task = TaskParser.parse('- [ ] Buy groceries', 'todo.md', 5);
		expect(task).not.toBeNull();
		expect(task!.text).toBe('Buy groceries');
		expect(task!.completed).toBe(false);
		expect(task!.filePath).toBe('todo.md');
		expect(task!.lineNumber).toBe(5);
		expect(task!.id).toBe('todo.md:5');
	});

	it('parses a completed task', () => {
		const task = TaskParser.parse('- [x] Done task', 'file.md', 1);
		expect(task).not.toBeNull();
		expect(task!.completed).toBe(true);
	});

	it('parses due date', () => {
		const task = TaskParser.parse('- [ ] Pay bills 📅 2025-03-15', 'todo.md', 1);
		expect(task).not.toBeNull();
		expect(task!.dueDate).toBe('2025-03-15');
		expect(task!.text).toBe('Pay bills');
	});

	it('parses scheduled date', () => {
		const task = TaskParser.parse('- [ ] Meeting ⏳ 2025-04-01', 'todo.md', 1);
		expect(task).not.toBeNull();
		expect(task!.scheduledDate).toBe('2025-04-01');
	});

	it('parses done date', () => {
		const task = TaskParser.parse('- [x] Finished ✅ 2025-02-10', 'todo.md', 1);
		expect(task).not.toBeNull();
		expect(task!.doneDate).toBe('2025-02-10');
	});

	it('parses recurrence', () => {
		const task = TaskParser.parse('- [ ] Daily standup 🔁 every day 📅 2025-03-01', 'todo.md', 1);
		expect(task).not.toBeNull();
		expect(task!.isRecurring).toBe(true);
		expect(task!.recurrence).toBe('every day');
	});

	it('parses status tag', () => {
		const task = TaskParser.parse('- [ ] Build feature #status/doing', 'todo.md', 1);
		expect(task).not.toBeNull();
		expect(task!.status).toBe('doing');
	});

	it('parses multiple tags', () => {
		const task = TaskParser.parse('- [ ] Task #project/alpha #priority/high #status/todo', 'todo.md', 1);
		expect(task).not.toBeNull();
		expect(task!.tags).toContain('#project/alpha');
		expect(task!.tags).toContain('#priority/high');
		expect(task!.tags).toContain('#status/todo');
		expect(task!.status).toBe('todo');
	});

	it('strips metadata from display text', () => {
		const task = TaskParser.parse(
			'- [ ] Do thing 📅 2025-01-01 🔁 every week #status/todo #priority/high',
			'todo.md', 1
		);
		expect(task).not.toBeNull();
		expect(task!.text).toBe('Do thing');
	});

	it('preserves rawText', () => {
		const raw = '- [ ] Raw line 📅 2025-01-01 #status/todo';
		const task = TaskParser.parse(raw, 'file.md', 3);
		expect(task).not.toBeNull();
		expect(task!.rawText).toBe(raw);
	});

	it('returns null for non-task lines', () => {
		expect(TaskParser.parse('# Heading', 'file.md', 1)).toBeNull();
		expect(TaskParser.parse('Regular text', 'file.md', 1)).toBeNull();
	});

	it('handles task with no metadata', () => {
		const task = TaskParser.parse('- [ ] Simple task', 'file.md', 1);
		expect(task).not.toBeNull();
		expect(task!.dueDate).toBeNull();
		expect(task!.scheduledDate).toBeNull();
		expect(task!.doneDate).toBeNull();
		expect(task!.recurrence).toBeNull();
		expect(task!.isRecurring).toBe(false);
		expect(task!.status).toBeNull();
		expect(task!.tags).toEqual([]);
	});
});
