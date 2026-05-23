<script lang="ts">
  import { onMount } from 'svelte';
  import ChatBubble from './ChatBubble.svelte';
  import ChatInput from './ChatInput.svelte';
  import { ChatSession } from './chatSession.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  const session = new ChatSession(() => data.screenplay);

  let chatElement = $state<HTMLElement | null>(null);

  // Scroll to bottom when messages or typewriter length updates
  $effect(() => {
    session.messages;
    session.animatedMessageLength;
    chatElement?.scroll({ behavior: 'smooth', top: chatElement.scrollHeight });
  });

  onMount(() => session.nextTurn());
</script>

<ul class="grow overflow-y-auto pt-8 scroll-smooth" bind:this={chatElement}>
  {#each session.messages as message (message.id)}
    {@const isAnimating = message.id === session.animatedMessageId}
    {@const animatedLength = isAnimating ? session.animatedMessageLength : undefined}
    <ChatBubble {message} {isAnimating} {animatedLength} />
  {/each}
</ul>

<ChatInput bind:value={session.chatInput} onSubmit={(e) => session.onSubmit(e)} />
