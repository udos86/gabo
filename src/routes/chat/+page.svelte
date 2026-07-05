<script lang="ts">
  import { onMount } from 'svelte';
  import { SvelteMap } from 'svelte/reactivity';
  import { Experimental_StructuredObject, type UIMessage } from '@ai-sdk/svelte';

  import { convertToDialogue } from '$lib/ai/actor';
  import { agentOutputSchema, type AgentInput, type AgentName, type AssistantMessageMetadata, type GaboUIMessage } from '$lib/ai/schema';
  import { Play } from '$lib/screenplay/screenplay';
  import { Resolver } from '$lib/utils/resolver';

  import type { PageProps } from './$types';

  import ChatBubble from './ChatBubble.svelte';
  import ChatInput from './ChatInput.svelte';

  let { data }: PageProps = $props();

  let messages = $state<Array<GaboUIMessage>>([]);
  let chatInput = $state('');
  let chatElement = $state<HTMLElement | null>(null);
  let play = $derived(new Play({ screenplay: data.screenplay }));

  let animatedMessage = $derived(messages.find((message) => message.metadata?.status === 'animating'));
  let animatedMessageLength = $state(0);
  let isAnimating = $derived(animatedMessage !== undefined);

  let animationResolver: Resolver<void> | null = null;
  let structuredObjects = new SvelteMap<string, Experimental_StructuredObject<typeof agentOutputSchema>>();

  function createStructuredObject(messageId: string, agent: AgentName, input: AgentInput) {
    const object = new Experimental_StructuredObject({
      api: `/api/agent/${agent}`,
      schema: agentOutputSchema,
      onFinish: async ({ object }) => {
        if (object == undefined) return;
        await animationResolver;

        switch (object.agent) {
          case 'actor': {
            const parts: UIMessage['parts'] = [{ type: 'text', text: object.text }];
            const metadata: AssistantMessageMetadata = { agent: object.agent, position: play.position, status: 'ready' };
            const pendingMessage = messages.find(({ id, metadata }) => id === messageId && metadata?.status === 'pending');

            if (pendingMessage === undefined) {
              const message: GaboUIMessage = { id: messageId, parts, role: 'assistant', metadata };
              messages.push(message);
            } else {
              pendingMessage.parts = parts;
              pendingMessage.metadata = metadata;
            }

            scheduleNextMessageAnimation();
            nextTurn();
            break;
          }

          case 'teacher': {
            // TODO - irrelevant for now
            break;
          }
        }

        structuredObjects.delete(messageId);
      },
    });

    structuredObjects.set(messageId, object);

    object.submit(input);
  }

  async function scheduleNextMessageAnimation() {
    if (isAnimating) return;
    const nextAnimatedMessage = messages.find(({ metadata }) => metadata?.status === 'ready');
    if (nextAnimatedMessage === undefined) return;

    nextAnimatedMessage.metadata!.status = 'animating';
    animatedMessageLength = 0;
    animationResolver = new Resolver();

    await animationResolver;
    nextAnimatedMessage.metadata!.status = 'done';
    scheduleNextMessageAnimation();
  }

  function clearAnimation() {
    animationResolver?.resolve();
    animationResolver = null;
    animatedMessageLength = 0;
  }

  function nextTurn() {
    const done = play.next();
    if (done) return;
    const { beat, character, position, slugline } = play;

    if (character.actor === 'assistant') {
      const actorMessage: GaboUIMessage = {
        id: globalThis.crypto.randomUUID(),
        parts: [{ type: 'text', text: '' }],
        role: 'assistant',
        metadata: { agent: 'actor', position, status: 'pending' },
      };

      messages.push(actorMessage);

      createStructuredObject(actorMessage.id, 'actor', {
        language: 'French',
        slugline,
        role: character.role,
        actions: beat.actions,
        interlocutors: play.others.map(({ role }) => role),
        dialogue: convertToDialogue(messages, play),
      });
    }
  }

  function onSubmit(event: Event) {
    event.preventDefault();
    clearAnimation();

    const position = play.position;

    const userMessage: GaboUIMessage = {
      id: globalThis.crypto.randomUUID(),
      parts: [{ type: 'text', text: chatInput }],
      role: 'user',
      metadata: { position, status: 'done' },
    };

    messages.push(userMessage);

    nextTurn();

    chatInput = '';
  }

  $effect(() => {
    if (animatedMessage === undefined) return;

    const lastPart = animatedMessage.parts.at(-1);
    const text = animatedMessage.role === 'user' ? (animatedMessage.metadata.feedbackText ?? '') : lastPart?.type === 'text' ? lastPart.text : '';

    if (animatedMessageLength < text.length) {
      const timeout = globalThis.setTimeout(() => animatedMessageLength++, 30);
      return () => globalThis.clearTimeout(timeout);
    }

    clearAnimation();
  });

  $effect(() => {
    void messages.length;
    void animatedMessageLength;
    chatElement?.scroll({ behavior: 'smooth', top: chatElement.scrollHeight });
  });

  onMount(() => nextTurn());
</script>

<ul class="grow overflow-y-auto pt-8 scroll-smooth" bind:this={chatElement}>
  {#each messages as message (message.id)}
    {@const isAnimatedMessage = message === animatedMessage}
    {@const animatedLength = isAnimatedMessage ? animatedMessageLength : undefined}
    <ChatBubble {message} {animatedLength} />
  {/each}
</ul>

<ChatInput bind:value={chatInput} onSubmit={(event) => onSubmit(event)} />
