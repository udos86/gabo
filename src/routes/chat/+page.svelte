<script lang='ts'>
  import { onMount } from 'svelte';
  import { Experimental_StructuredObject, type UIMessage } from '@ai-sdk/svelte';

  import { convertToDialogue } from '$lib/ai/actor';
  import { agentOutputSchema, type GaboPendingUIMessage, type GaboUIMessage } from '$lib/ai/schema';
  import { Play } from '$lib/screenplay/screenplay';
  import { Resolver } from '$lib/utils/resolver';
  
  import type { PageProps } from './$types';

  import ChatBubble from './ChatBubble.svelte';
  import ChatInput from './ChatInput.svelte';

  let { data }: PageProps = $props();

  let messages = $state<Array<GaboUIMessage>>([]);
  let chatInput = $state('');
  let chatElement = $state<HTMLElement | null>(null);
  let play = $derived.by(() => new Play({ screenplay: data.screenplay }));

  let animatedMessageId = $state<string | null>(null);
  let animatedMessage = $derived(messages.find(message => message.id === animatedMessageId));
  let animatedMessageLength = $state(0);
  let animationResolver: Resolver<void> | null = null;

  const agentStructuredObject = new Experimental_StructuredObject({
    api: '/api/agent',
    schema: agentOutputSchema,
    onFinish: async ({ object }) => {
      if (object == undefined) return;

      // Wait for the message to finish animating before we trigger the next turn
      if (animationResolver instanceof Resolver) await animationResolver;

      let message: GaboUIMessage | undefined;

      const parts: UIMessage['parts'] = [{ type: 'text', text: object.text }];

      const metadata = (() => {
        switch (object.agent) {
          case 'actor':
            return { agent: 'actor', position: play.position } as const;
          case 'teacher':
            return { agent: 'teacher', position: play.position, passed: object.passed } as const;
        }
      })();

      const pendingMessage = messages.findLast(message => {
        return message.role === 'assistant' && message.metadata?.pending === true && message.metadata.agent === object.agent;
      });

      if (pendingMessage === undefined) {
        const id = globalThis.crypto.randomUUID();
        message = { id, parts, role: 'assistant', metadata };
        messages.push(message);
      } else {
        message = pendingMessage;
        message.parts = parts;
        message.metadata = metadata;
      }

      animatedMessageId = message.id;
      animationResolver = new Resolver();

      if (object.agent === 'teacher' && !object.passed) return;

      nextTurn();
    },
  });

  function nextTurn() {
    const done = play.next();
    if (done) return;
    const { beat, character, position, slugline } = play;

    if (character.actor === 'assistant') {
      agentStructuredObject.submit({
        agent: 'actor',
        language: 'French',
        slugline,
        role: character.role,
        actions: beat.actions,
        interlocutors: play.others.map(({ role }) => role),
        dialogue: convertToDialogue(messages, play),
      });

      const message: GaboPendingUIMessage = {
        id: globalThis.crypto.randomUUID(),
        parts: [{ type: 'text', text: '' }],
        role: 'assistant',
        metadata: { agent: 'actor', position, pending: true},
      };

      messages.push(message);
    }
  }

  function onSubmit(event: Event) {
    event.preventDefault();
    const { slugline, character, beat, position } = play;

    // Add user message
    messages.push({
      id: globalThis.crypto.randomUUID(),
      parts: [{ type: 'text', text: chatInput }],
      role: 'user',
      metadata: { position },
    });

    // Request teacher (LLM judge) to evaluate user input
    agentStructuredObject.submit({
      agent: 'teacher',
      language: 'French',
      input: chatInput,
      slugline,
      role: character.role,
      actions: beat.actions,
      interlocutors: play.others.map(({ role }) => role),
      dialogue: convertToDialogue(messages, play),
    });

    // Add pending teacher agent message
    messages.push({
      id: globalThis.crypto.randomUUID(),
      parts: [{ type: 'text', text: '' }],
      role: 'assistant',
      metadata: { agent: 'teacher', position, pending: true },
    });

    chatInput = '';
  }

  $effect(() => {
    if (animatedMessage === undefined) return;

    const lastPart = animatedMessage.parts.at(-1);
    const text = lastPart?.type === 'text' ? lastPart.text : '';

    if (animatedMessageLength < text.length) {
      const timeout = globalThis.setTimeout(() => animatedMessageLength++, 30);
      return () => globalThis.clearTimeout(timeout);
    }

    if (animationResolver instanceof Resolver) {
      animationResolver.resolve();
      animationResolver = null;
    }

    animatedMessageId = null;
    animatedMessageLength = 0;
  });

  $effect(() => {
    messages;
    animatedMessageLength;
    chatElement?.scroll({ behavior: 'smooth', top: chatElement.scrollHeight });
  });

  onMount(() => nextTurn());
</script>

<ul class="grow overflow-y-auto pt-8 scroll-smooth" bind:this={chatElement}>
  {#each messages as message (message.id)}
    {@const isAnimating = message.id === animatedMessageId}
    {@const animatedLength = isAnimating ? animatedMessageLength : undefined}
    <ChatBubble {message} {isAnimating} {animatedLength} />
  {/each}
</ul>

<ChatInput bind:value={chatInput} onSubmit={event => onSubmit(event)} />
