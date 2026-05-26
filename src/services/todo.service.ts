import * as fs from 'fs';
import * as path from 'path';

export interface TodoItem {
    id: number;
    task: string;
    completed: boolean;
    createdAt: string;
}

export interface UserTodo {
    userId: number;
    items: TodoItem[];
}

export class TodoService {
    private dataPath: string;
    private todos: Map<number, TodoItem[]>;

    constructor() {
        this.dataPath = path.resolve(__dirname, '../../data/todos.json');
        this.todos = new Map();
        this.loadData();
    }

    private loadData() {
        if (fs.existsSync(this.dataPath)) {
            try {
                const rawData = fs.readFileSync(this.dataPath, 'utf-8');
                const parsed = JSON.parse(rawData);
                if (Array.isArray(parsed)) {
                    parsed.forEach((u: UserTodo) => this.todos.set(u.userId, u.items));
                }
            } catch (error) {
                console.error('Error loading todo data:', error);
            }
        }
    }

    private saveData() {
        try {
            const data: UserTodo[] = Array.from(this.todos.entries()).map(([userId, items]) => ({
                userId,
                items
            }));
            fs.writeFileSync(this.dataPath, JSON.stringify(data, null, 2));
        } catch (error) {
            console.error('Error saving todo data:', error);
        }
    }

    getTodos(userId: number): TodoItem[] {
        if (!this.todos.has(userId)) {
            this.todos.set(userId, []);
        }
        return this.todos.get(userId)!;
    }

    addTodo(userId: number, task: string) {
        const items = this.getTodos(userId);
        const newItem: TodoItem = {
            id: Date.now(),
            task,
            completed: false,
            createdAt: new Date().toISOString()
        };
        items.push(newItem);
        this.saveData();
    }

    completeTodo(userId: number, keywordOrIndex: string) {
        const items = this.getTodos(userId);
        // Try to parse as index (1-based)
        const index = parseInt(keywordOrIndex);
        if (!isNaN(index) && index > 0 && index <= items.length) {
            items[index - 1].completed = true;
            this.saveData();
            return items[index - 1]; // Return completed item
        }

        // Try to match by text
        const found = items.find(i => i.task.toLowerCase().includes(keywordOrIndex.toLowerCase()) && !i.completed);
        if (found) {
            found.completed = true;
            this.saveData();
            return found;
        }
        return null;
    }

    clearCompleted(userId: number) {
        let items = this.getTodos(userId);
        items = items.filter(i => !i.completed);
        this.todos.set(userId, items);
        this.saveData();
    }
}
