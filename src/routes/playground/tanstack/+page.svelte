<script>
	import {useLiveQuery} from '$lib/tanstack-patches/useLiveQuery.svelte.js'
	import {createCollection, localOnlyCollectionOptions, eq} from '@tanstack/db'

	const todoCollectionOptions = localOnlyCollectionOptions({
		id: 'playground-todos',
		getKey: (item) => item.id,
		initialData: [
			{id: '1', text: 'Try TanStack DB', completed: false, created_at: Date.now()},
			{id: '2', text: 'Compare with r5 SDK', completed: false, created_at: Date.now()}
		]
	})
	const todoCollection = createCollection(todoCollectionOptions)

	const allTodos = useLiveQuery((q) => q.from({todo: todoCollection}))
	const completedTodos = useLiveQuery((q) => q.from({todo: todoCollection}).where(({todo}) => eq(todo.completed, true)))
	const pendingTodos = useLiveQuery((q) => q.from({todo: todoCollection}).where(({todo}) => eq(todo.completed, false)))

	let newTodoText = $state('')

	function addTodo() {
		if (!newTodoText.trim()) return

		todoCollection.insert({
			id: crypto.randomUUID(),
			text: newTodoText,
			completed: false,
			created_at: Date.now()
		})

		newTodoText = ''
	}

	function toggleTodo(todo) {
		todoCollection.update(todo.id, (draft) => {
			draft.completed = !draft.completed
		})
	}

	function deleteTodo(id) {
		todoCollection.delete(id)
	}
</script>

<div class="SmallContainer">
	<header>
		<h1>TanStack DB Playground</h1>
		<p>Testing local-only collection with live queries and optimistic mutations</p>
	</header>

	<section>
		<h2>Add Todo</h2>
		<form
			onsubmit={(e) => {
				e.preventDefault()
				addTodo()
			}}
		>
			<div class="row">
				<input type="text" bind:value={newTodoText} placeholder="Enter todo text..." style:flex="1" />
				<button type="submit">Add</button>
			</div>
		</form>
	</section>

	<section>
		<h2>All Todos ({allTodos.data?.length ?? 0})</h2>
		<ul class="list">
			{#each allTodos.data ?? [] as todo}
				<li>
					<div class="row">
						<label>
							<input type="checkbox" checked={todo.completed} onchange={() => toggleTodo(todo)} />
							<span style:text-decoration={todo.completed ? 'line-through' : 'none'}>
								{todo.text}
							</span>
						</label>
						<button onclick={() => deleteTodo(todo.id)}>Delete</button>
					</div>
				</li>
			{/each}
		</ul>
	</section>

	<section>
		<h2>Pending Todos ({pendingTodos.data?.length ?? 0})</h2>
		<ul class="list">
			{#each pendingTodos.data ?? [] as todo}
				<li style:padding="0.5rem">{todo.text}</li>
			{/each}
		</ul>
	</section>

	<section>
		<h2>Completed Todos ({completedTodos.data?.length ?? 0})</h2>
		<ul class="list">
			{#each completedTodos.data ?? [] as todo}
				<li style:padding="0.5rem">{todo.text}</li>
			{/each}
		</ul>
	</section>
</div>

<style>
	.SmallContainer {
		display: flex;
		flex-flow: column;
		gap: 1rem;
	}
</style>
