<script lang="ts">
  import { onMount } from "svelte";
  import { Experimental_StructuredObject } from "@ai-sdk/svelte";
  import type { PageProps } from "./$types";
  import { Play } from "$lib/screenplay/screenplay";
  import { agentOutputSchema, type GaboUIMessage } from "$lib/ai/schema";

  let { data }: PageProps = $props();

  let chatElement: HTMLElement | null = $state(null);
  let chatInput = $state("");
  let play = $derived(new Play({ screenplay: data.screenplay }));
  let animatedMessageId: string | null = $state(null);
  let animatedMessageLength = $state(0);
  let pendingMessageId: string | null = $derived.by(() => {
    const pendingMessage = messages.at(-1);
    return pendingMessage?.metadata?.pending === true
      ? pendingMessage.id
      : null;
  });
  let messages: Array<GaboUIMessage> = $state([]);

  $inspect(pendingMessageId).with(console.log);

  const agentStructuredObject = new Experimental_StructuredObject({
    api: "/api/agent",
    schema: agentOutputSchema,
    onFinish: (output) => {
      scrollToChatEnd();
      if (output.object === undefined) return;
      if (pendingMessageId === null) {
        messages.push({
          id: crypto.randomUUID(),
          parts: [{ type: "text", text: output.object.text }],
          role: "assistant",
          metadata: {
            agent: output.object.agent,
            position: play.position,
          },
        });
      } else {
        const pendingMessage = messages.find(
          (message) => message.id === pendingMessageId,
        );
        if (pendingMessage === undefined) return;
        pendingMessage.parts = [{ type: "text", text: output.object.text }];
        delete pendingMessage.metadata?.pending;
      }

      if (output.object.agent === "teacher" && output.object.passed) turn();
      scrollToChatEnd();
    },
  });

  onMount(() => turn());

  function turn() {
    play.next();
    const { slugline, character, beat } = play;

    agentStructuredObject.submit({
      agent: "actor",
      language: "French",
      slugline,
      role: character.role,
      actions: beat.actions,
    });

    messages.push({
      id: crypto.randomUUID(),
      parts: [{ type: "text", text: "" }],
      role: "assistant",
      metadata: {
        agent: "actor",
        position: play.position,
        pending: true,
      },
    });

    play.next();
  }

  function onSubmit(event: Event) {
    event.preventDefault();
    const { slugline, character, beat } = play;

    messages.push({
      id: crypto.randomUUID(),
      parts: [{ type: "text", text: chatInput }],
      role: "user",
      metadata: {
        position: play.position,
      },
    });

    agentStructuredObject.submit({
      agent: "teacher",
      language: "French",
      slugline: slugline,
      role: character.role,
      actions: beat.actions,
      input: chatInput,
    });

    chatInput = "";

    messages.push({
      id: crypto.randomUUID(),
      parts: [{ type: "text", text: "" }],
      role: "assistant",
      metadata: {
        agent: "teacher",
        position: play.position,
        pending: true,
      },
    });
  }

  function scrollToChatEnd() {
    chatElement?.scroll({
      behavior: "smooth",
      top: chatElement.scrollHeight,
    });
  }

  $effect(() => {
    const lastMessage = messages.at(-1);

    if (lastMessage?.id !== animatedMessageId) {
      animatedMessageId = null;
      animatedMessageLength = 0;
    }

    if (lastMessage?.role !== "assistant") return;

    animatedMessageId = lastMessage.id;
    const lastPart = lastMessage?.parts.at(-1);
    const text = lastPart?.type === "text" ? lastPart.text : "";

    if (animatedMessageLength < text.length) {
      const timeout = setTimeout(() => {
        animatedMessageLength++;
        scrollToChatEnd();
      }, 30);

      return () => {
        clearTimeout(timeout);
      };
    }
  });
</script>

<ul
  class="grow divide-y divide-gray-300 overflow-y-auto shadow-inner"
  bind:this={chatElement}
>
  {#each messages as message (message.id)}
    <li
      class="flex items-center even:bg-gray-100 p-4 {message.role === 'user'
        ? 'flex-row-reverse'
        : ''}"
    >
      {#if message.role === "user"}
        <img
          width="64"
          height="64"
          src="/user.png"
          alt="avatar"
          class="rounded-full border border-slate-500"
        />
        <!--span class="font-bold">User: </span-->
      {/if}
      {#if message.role === "assistant"}
        <img
          width="64"
          height="64"
          src="/waiter.png"
          alt="avatar"
          class="rounded-full border border-slate-500"
        />
        <!--span class="font-bold">{message.metadata?.role}: </span-->
      {/if}
      {#each message.parts as part, index (index)}
        {#if part.type === "text"}
          {#if animatedMessageId === message.id}
            <span
              class="grow max-w-lg mx-2 {message.role === 'user'
                ? 'text-right'
                : ''}"
            >
              {part.text.slice(0, animatedMessageLength)}
              {#if message.metadata?.pending || animatedMessageLength < part.text.length}
                <span class="animate-pulse">▊</span>
              {/if}
            </span>
          {:else}
            <span
              class="grow max-w-lg mx-2 {message.role === 'user'
                ? 'text-right'
                : ''}">{part.text}</span
            >
          {/if}
        {/if}
      {/each}
    </li>
  {/each}
</ul>

<footer class="pb-7 pt-5 flex-inital border-t border-gray-300 shadow-lg">
  <form onsubmit={onSubmit} class="flex justify-center">
    <label for="chatMessage" class="hidden">Message</label>
    <input
      bind:value={chatInput}
      type="text"
      name="message"
      id="chatMessage"
      placeholder="Send a message"
      class="h-12 grow max-w-lg border-2 focus:ring-0 focus:outline-none focus:border-petrol-500 rounded"
      required
    />
    <input type="submit" hidden />
  </form>
</footer>
