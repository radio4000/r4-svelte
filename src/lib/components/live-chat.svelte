<script>
	import {sdk} from '@radio4000/sdk'
	import {onMount} from 'svelte'
	import * as m from '$lib/paraglide/messages'

	let message = $state('')
	/** @type {{text: string, username: string, timestamp: string}[]} */
	let messages = $state([])
	/** @type {ReturnType<typeof sdk.supabase.channel> | null} */
	let channel = $state(null)
	let username = $state('')

	onMount(() => {
		username = `user-${Math.random().toString(36).substr(2, 9)}`

		channel = sdk.supabase.channel('global-chat')

		channel
			.on('broadcast', {event: 'message'}, (payload) => {
				messages.push(payload.payload)
			})
			.subscribe((status) => {
				if (status === 'SUBSCRIBED') {
					console.log('chat:subscribed')
				}
			})

		return () => {
			if (channel) {
				channel.unsubscribe()
			}
		}
	})

	function sendMessage() {
		if (!message.trim() || !channel) return

		const chatMessage = {
			text: message.trim(),
			username,
			timestamp: new Date().toISOString()
		}

		// Add your own message locally
		messages.push(chatMessage)

		// Send to other users
		channel.send({
			type: 'broadcast',
			event: 'message',
			payload: chatMessage
		})

		message = ''
	}

	function handleKeydown(event) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault()
			sendMessage()
		}
	}
</script>

<section class="chat">
	<div class="messages">
		{#each messages as msg (msg.timestamp)}
			<div class="message">
				<strong>{msg.username}:</strong>
				<span>{msg.text}</span>
				<time>{new Date(msg.timestamp).toLocaleTimeString()}</time>
			</div>
		{/each}
		{#if messages.length === 0}
			<p class="empty">{m.chat_empty_state()}</p>
		{/if}
	</div>

	<form onsubmit={sendMessage}>
		<input bind:value={message} onkeydown={handleKeydown} placeholder={m.chat_input_placeholder()} maxlength="280" />
		<button type="submit" disabled={!message.trim()}>{m.chat_send_button()}</button>
	</form>
</section>

<style>
	.chat {
		max-width: 400px;
		height: 500px;
		display: flex;
		flex-direction: column;
	}

	.messages {
		flex: 1;
		overflow-y: auto;
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.message {
		display: flex;
		gap: 0.5rem;
	}

	.message time {
		opacity: 0.5;
		margin-left: auto;
		flex-shrink: 0;
	}

	.empty {
		text-align: center;
		opacity: 0.5;
		font-style: italic;
		margin: auto;
	}

	form {
		padding: 0.5rem;
		display: flex;
		gap: 0.5rem;
	}

	input {
		flex: 1;
	}

	button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
