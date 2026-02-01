# TaskBoard Pro

A Kanban-style task board plugin for Obsidian with built-in recurring task support.

## Features

- **Vault-wide task scanning** - Finds tasks across your entire vault (or specific folders)
- **Drag & drop Kanban board** - Move tasks between To Do, Doing, and Done columns
- **Recurring tasks** - Automatic new instance creation when completing recurring tasks
- **No dependencies** - Works standalone, no Tasks plugin required
- **Archive support** - Archive completed tasks to hide them from the board

## Task Format

Tasks use emoji-based syntax compatible with the Tasks plugin:

```markdown
- [ ] My task #status/todo
- [ ] Weekly review 🔁 every week on Friday 📅 2026-02-07 #status/todo
- [ ] Pay rent 🔁 every month on the 1st 📅 2026-02-01 #status/todo
```

### Required
- `#status/todo`, `#status/doing`, or `#status/done` tag for column placement

### Optional
- `📅 YYYY-MM-DD` - Due date
- `🔁 every ...` - Recurrence pattern (every day, every week on Monday, every month on the 1st, etc.)

## Installation

### Manual Installation
1. Download `main.js`, `manifest.json`, and `styles.css`
2. Create folder: `<vault>/.obsidian/plugins/taskboard-pro/`
3. Copy files into the folder
4. Enable in Settings → Community plugins

### From Source
```bash
git clone https://github.com/rusenask/taskboard-pro.git
cd taskboard-pro
npm install
npm run build
```

## Settings

- **Include only these folders** - Restrict scanning to specific folders
- **Excluded folders** - Folders to skip during scanning
- **Include completed tasks** - Show/hide completed tasks

## Usage

1. Add `#status/todo` tag to your tasks
2. Open TaskBoard from the ribbon icon or command palette
3. Drag tasks between columns
4. For recurring tasks, dropping in Done creates a new instance automatically

## Recurring Task Examples

| Pattern | Syntax |
|---------|--------|
| Daily | `🔁 every day` |
| Weekly on specific day | `🔁 every week on Monday` |
| Bi-weekly | `🔁 every 2 weeks` |
| Monthly on date | `🔁 every month on the 15th` |
| Every N days | `🔁 every 3 days` |

## License

MIT
