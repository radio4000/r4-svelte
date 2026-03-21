/** Demo state: fake API + collection for the TanStack Query + DB tutorial */
import {createCollection} from '@tanstack/svelte-db'
import {localOnlyCollectionOptions} from '@tanstack/db'

export type DemoTodo = {
	id: number
	todo: string
	completed: boolean
}

export const demoCollection = createCollection<DemoTodo, number>(
	localOnlyCollectionOptions({
		id: 'demo-todos',
		getKey: (item) => item.id
	})
)

// --- Single list (sections 1–6) ---
const initialTodos: DemoTodo[] = [
	{id: 1, todo: 'Buy groceries', completed: false},
	{id: 2, todo: 'Walk the dog', completed: false},
	{id: 3, todo: 'Read a book', completed: true}
]

let todos = $state<DemoTodo[]>([...initialTodos])

// --- Two overlapping lists (section 7: normalization) ---
const WORK: DemoTodo[] = [
	{id: 10, todo: 'Fix bug', completed: false},
	{id: 11, todo: 'Write tests', completed: false},
	{id: 12, todo: 'Code review', completed: true}
]
const HOME: DemoTodo[] = [
	{id: 12, todo: 'Code review', completed: true},
	{id: 13, todo: 'Buy groceries', completed: false},
	{id: 14, todo: 'Walk the dog', completed: false}
]
/** IDs shared between both lists */
export const SHARED_IDS = [12]

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export const fakeAPI = {
	/** Fetch the main todo list */
	async fetch(delay = 300): Promise<DemoTodo[]> {
		demoState.networkRequests++
		await sleep(delay)
		return [...todos]
	},

	/** Fetch a named list (for normalization demo) */
	async fetchList(list: 'work' | 'home', delay = 300): Promise<DemoTodo[]> {
		demoState.networkRequests++
		await sleep(delay)
		return list === 'work' ? [...WORK] : [...HOME]
	},

	async add(todo: DemoTodo, delay = 200): Promise<DemoTodo> {
		demoState.networkRequests++
		await sleep(delay)
		todos = [todo, ...todos]
		return todo
	},

	reset() {
		todos = [...initialTodos]
	}
}

export const demoState = $state({
	networkRequests: 0,
	cacheHits: 0
})
