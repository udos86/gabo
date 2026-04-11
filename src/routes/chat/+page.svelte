<script lang="ts">
  import { onMount } from "svelte";
  import { Experimental_StructuredObject } from "@ai-sdk/svelte";
  import type { PageProps } from "./$types";
  import { Play } from "$lib/screenplay/screenplay";
  import { agentOutputSchema, type GaboUIMessage } from "$lib/ai/schema";
  import { fade, fly } from "svelte/transition";

  let { data }: PageProps = $props();

  let chatElement: HTMLElement | null = $state(null);
  let chatInput = $state("");
  let play = $derived(new Play({ screenplay: data.screenplay }));
  let animatedMessageId: string | null = $state(null);
  let animatedMessageLength = $state(0);
  let animationResolvers = new Map<string, () => void>();
  let pendingMessageId: string | null = $derived.by(() => {
    const pendingMessage = messages.at(-1);
    return pendingMessage?.metadata?.pending === true
      ? pendingMessage.id
      : null;
  });
  let messages: Array<GaboUIMessage> = $state([]);

  function waitForMessageAnimation(messageId: string): Promise<void> {
    return new Promise((resolve) => {
      const message = messages.find((message) => message.id === messageId);
      const lastPart = message?.parts.at(-1);
      const text = lastPart?.type === "text" ? lastPart.text : "";

      if (
        animatedMessageId === messageId &&
        animatedMessageLength >= text.length
      ) {
        resolve();
      } else {
        animationResolvers.set(messageId, resolve);
      }
    });
  }

  $inspect(pendingMessageId).with(console.log);

  const agentStructuredObject = new Experimental_StructuredObject({
    api: "/api/agent",
    schema: agentOutputSchema,
    onFinish: async (output) => {
      if (output.object === undefined) return;
      let message: GaboUIMessage | undefined;

      if (pendingMessageId === null) {
        message = {
          id: crypto.randomUUID(),
          parts: [{ type: "text", text: output.object.text }],
          role: "assistant",
          metadata: {
            agent: output.object.agent,
            position: play.position,
          },
        };
        messages.push(message);
      } else {
        message = messages.find((message) => message.id === pendingMessageId);
        if (message === undefined) return;
        message.parts = [{ type: "text", text: output.object.text }];
        delete message.metadata?.pending;
      }

      if (output.object.agent === "teacher" && !output.object.passed) {
        // End the lesson
        return;
      }

      await waitForMessageAnimation(message.id);
      nextTurn();
    },
  });

  onMount(() => nextTurn());

  function nextTurn() {
    play.next();
    const { beat, character, slugline } = play;

    if (character.actor === "assistant") {
      // request actor response
      agentStructuredObject.submit({
        agent: "actor",
        language: "French",
        slugline,
        role: character.role,
        actions: beat.actions,
      });
      // add pending actor message
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
    }
  }

  function onSubmit(event: Event) {
    event.preventDefault();
    console.log(play.position);
    const { slugline, character, beat, position } = play;
    // add user message
    messages.push({
      id: crypto.randomUUID(),
      parts: [{ type: "text", text: chatInput }],
      role: "user",
      metadata: {
        position,
      },
    });
    // request teacher response
    agentStructuredObject.submit({
      agent: "teacher",
      language: "French",
      slugline: slugline,
      role: character.role,
      actions: beat.actions,
      input: chatInput,
    });
    // add pending teacher message
    messages.push({
      id: crypto.randomUUID(),
      parts: [{ type: "text", text: "" }],
      role: "assistant",
      metadata: {
        agent: "teacher",
        position,
        pending: true,
      },
    });
    // clear input
    chatInput = "";
  }

  function scrollToChatEnd() {
    chatElement?.scroll({
      behavior: "smooth",
      top: chatElement.scrollHeight,
    });
  }

  $effect(() => {
    const lastMessage = messages.at(-1);
    scrollToChatEnd();

    if (lastMessage?.id !== animatedMessageId) {
      if (animatedMessageId && animationResolvers.has(animatedMessageId)) {
        animationResolvers.get(animatedMessageId)!();
        animationResolvers.delete(animatedMessageId);
      }
      animatedMessageId = null;
      animatedMessageLength = 0;
    }

    if (lastMessage?.role !== "assistant") return;

    animatedMessageId = lastMessage.id;
    const lastPart = lastMessage?.parts.at(-1);
    const text = lastPart?.type === "text" ? lastPart.text : "";

    if (animatedMessageLength < text.length) {
      const timeout = setTimeout(() => animatedMessageLength++, 30);
      return () => clearTimeout(timeout);
    }

    if (animationResolvers.has(lastMessage.id)) {
      animationResolvers.get(lastMessage.id)!();
      animationResolvers.delete(lastMessage.id);
    }
  });

  function messageIn(node: Element, params: { role: string }) {
    if (params.role === "user") {
      return fade(node, { duration: 200 });
    }
    return fly(node, { y: -60, duration: 200, opacity: 0 });
  }
</script>

<ul
  class="grow divide-y divide-gray-300 overflow-y-auto shadow-inner"
  bind:this={chatElement}
>
  {#each messages as message (message.id)}
    <li
      in:messageIn={{ role: message.role }}
      out:fade={{ duration: 200 }}
      class="flex items-center even:bg-gray-100 px-12 py-6 {message.role ===
      'user'
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
      {/if}
      {#if message.role === "assistant"}
        <img
          width="64"
          height="64"
          src="/waiter.png"
          alt="avatar"
          class="rounded-full border border-slate-500"
        />
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
                : ''}">{part.text} | {message.metadata?.position}</span
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
