import { describe, it, expect } from 'vitest';
import { validateColumnId } from '../src/types';

describe('validateColumnId', () => {
	const existing = ['todo', 'doing', 'done'];

	it('accepts valid alphanumeric IDs', () => {
		expect(validateColumnId('review', existing)).toBeNull();
		expect(validateColumnId('in-progress', existing)).toBeNull();
		expect(validateColumnId('stage_1', existing)).toBeNull();
	});

	it('rejects empty ID', () => {
		expect(validateColumnId('', existing)).toBe('Column ID cannot be empty');
		expect(validateColumnId('   ', existing)).toBe('Column ID cannot be empty');
	});

	it('rejects special characters', () => {
		expect(validateColumnId('has space', existing)).toBe(
			'Column ID can only contain letters, numbers, underscores, and hyphens'
		);
		expect(validateColumnId('has/slash', existing)).toBe(
			'Column ID can only contain letters, numbers, underscores, and hyphens'
		);
		expect(validateColumnId('has.dot', existing)).toBe(
			'Column ID can only contain letters, numbers, underscores, and hyphens'
		);
	});

	it('rejects reserved IDs', () => {
		expect(validateColumnId('archived', existing)).toBe('"archived" is a reserved ID');
	});

	it('rejects duplicate IDs', () => {
		expect(validateColumnId('todo', existing)).toBe('Column ID must be unique');
		expect(validateColumnId('doing', existing)).toBe('Column ID must be unique');
	});

	it('allows current ID when editing', () => {
		// When editing "todo", the current ID "todo" should be allowed
		expect(validateColumnId('todo', existing, 'todo')).toBeNull();
	});

	it('still rejects duplicates of other columns when editing', () => {
		// When editing "todo", using "doing" should still fail
		expect(validateColumnId('doing', existing, 'todo')).toBe('Column ID must be unique');
	});

	it('normalizes to lowercase', () => {
		// The function trims and lowercases
		expect(validateColumnId('TODO', existing)).toBe('Column ID must be unique');
	});
});
