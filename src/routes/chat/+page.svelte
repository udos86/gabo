<script lang="ts">
  import { onMount } from 'svelte';
  import { SvelteMap } from 'svelte/reactivity';
  import { Experimental_StructuredObject, type UIMessage } from '@ai-sdk/svelte';

  import { convertToDialogue } from '$lib/ai/actor';
  import { buildDirectorInput } from '$lib/ai/director';
  import { actorOutputSchema, type AssistantMessageMetadata, type GaboUIMessage, type UserMessageMetadata } from '$lib/ai/schema';
  import { createInitialState, reduce } from '$lib/scenario/reducer';
  import { directorOutputSchema, type LessonState } from '$lib/scenario/state';
  import { Resolver } from '$lib/utils/resolver';

  import type { PageProps } from './$types';

  import ChatBubble from './ChatBubble.svelte';
  import ChatInput from './ChatInput.svelte';
  import MilestonesPanel from './MilestonesPanel.svelte';

  let { data }: PageProps = $props();

  const scenario = $derived(data.scenario);

  let messages = $state<Array<GaboUIMessage>>([]);
  let lessonState = $state<LessonState | null>(null);
  let chatInput = $state('');
  let chatElement = $state<HTMLElement | null>(null);

  let animatedMessage = $derived(messages.find((message) => message.metadata?.status === 'animating'));
  let animatedMessageLength = $state(0);
  let isAnimating = $derived(animatedMessage !== undefined);

  let animationResolver: Resolver<void> | null = null;
  let structuredObjects = new SvelteMap<string, Experimental_StructuredObject<typeof actorOutputSchema>>();

  const isFinished = $derived(lessonState !== null && lessonState.status !== 'in_progress');

  function interlocutorRoles(excludeCharacterId: string) {
    return Object.values(scenario.characters)
      .filter((character) => character.id !== excludeCharacterId)
      .map((character) => character.role);
  }

  /** The hidden Director senses milestone deltas and authors the NPC's next stage directions. */
  function runDirectorTurn(studentInput: string) {
    if (lessonState === null) return;

    const dialogue = convertToDialogue(messages, scenario.characters);
    const input = buildDirectorInput(scenario, lessonState, dialogue, studentInput);

    const director = new Experimental_StructuredObject({
      api: '/api/agent/director',
      schema: directorOutputSchema,
      onFinish: async ({ object }) => {
        if (object === undefined || lessonState === null) return;

        // The reducer is the sole authority: it validates the Director's proposals.
        lessonState = reduce(lessonState, scenario, object);
        runActorTurn(object.stageDirections);
      },
    });

    director.submit(input);
  }

  /** The Actor improvises the NPC's spoken line from the Director's stage directions. */
  function runActorTurn(stageDirections: Array<string>) {
    if (lessonState === null) return;

    const npc = scenario.characters[scenario.npcCharacterId];
    if (npc === undefined) return;

    const messageId = globalThis.crypto.randomUUID();
    const pending: GaboUIMessage = {
      id: messageId,
      parts: [{ type: 'text', text: '' }],
      role: 'assistant',
      metadata: { agent: 'actor', characterId: npc.id, status: 'pending' },
    };
    messages.push(pending);

    const actor = new Experimental_StructuredObject({
      api: '/api/agent/actor',
      schema: actorOutputSchema,
      onFinish: async ({ object }) => {
        if (object === undefined) return;
        await animationResolver;

        const parts: UIMessage['parts'] = [{ type: 'text', text: object.text }];
        const metadata: AssistantMessageMetadata = { agent: 'actor', characterId: npc.id, status: 'ready' };
        const pendingMessage = messages.find(({ id, metadata }) => id === messageId && metadata?.status === 'pending');

        if (pendingMessage === undefined) {
          messages.push({ id: messageId, parts, role: 'assistant', metadata });
        } else {
          pendingMessage.parts = parts;
          pendingMessage.metadata = metadata;
        }

        scheduleNextMessageAnimation();
        structuredObjects.delete(messageId);
      },
    });

    structuredObjects.set(messageId, actor);

    actor.submit({
      language: scenario.language,
      slugline: scenario.setting.slugline,
      role: npc.role,
      stageDirections,
      interlocutors: interlocutorRoles(npc.id),
      dialogue: convertToDialogue(messages, scenario.characters),
      worldFacts: lessonState.worldFacts,
      variables: lessonState.variables,
    });
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

  function onSubmit(event: Event) {
    event.preventDefault();
    clearAnimation();

    if (lessonState === null || isFinished || chatInput.trim() === '') return;

    const userMessage: GaboUIMessage = {
      id: globalThis.crypto.randomUUID(),
      parts: [{ type: 'text', text: chatInput }],
      role: 'user',
      metadata: { characterId: scenario.playerCharacterId, status: 'done' } satisfies UserMessageMetadata,
    };

    messages.push(userMessage);

    const studentInput = chatInput;
    chatInput = '';

    runDirectorTurn(studentInput);
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

  onMount(() => {
    lessonState = createInitialState(scenario);
    // Opening turn: the Director authors the NPC's first line with no student input yet.
    runDirectorTurn('');
  });
</script>

<MilestonesPanel milestones={scenario.milestones} statuses={lessonState?.milestones} />

<ul class="grow overflow-y-auto pt-8 scroll-smooth" bind:this={chatElement}>
  {#each messages as message (message.id)}
    {@const isAnimatedMessage = message === animatedMessage}
    {@const animatedLength = isAnimatedMessage ? animatedMessageLength : undefined}
    <ChatBubble {message} {animatedLength} />
  {/each}
</ul>

<ChatInput bind:value={chatInput} disabled={isFinished} onSubmit={(event) => onSubmit(event)} />
