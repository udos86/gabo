<script lang="ts">
  import { onMount } from "svelte";
  import { Experimental_StructuredObject } from "@ai-sdk/svelte";
  import type { PageProps } from "./$types";
  import { Play } from "$lib/screenplay/screenplay";
  import { agentOutputSchema, type GaboUIMessage } from "$lib/ai/schema";

  let { data }: PageProps = $props();

  const agentStructuredObject = new Experimental_StructuredObject({
    api: "/api/agent",
    schema: agentOutputSchema,
    onFinish: (output) => {
      if (output.object === undefined) return;
      messages.push({
        id: crypto.randomUUID(),
        parts: [{ type: "text", text: output.object.text }],
        role: "assistant",
        metadata: {
          agent: output.object.agent,
          position: play.position,
        },
      });
      scrollToChatEnd();
    },
  });

  let chatElement: HTMLElement | null = $state(null);
  let chatInput = $state("");
  let play = $derived(new Play({ screenplay: data.screenplay }));
  let animatedMessageId: string | null = $state(null);
  let animatedMessageLength = $state(0);
  let messages: Array<GaboUIMessage> = $state([]);

  onMount(() => {
    play.start();
    const { slugline, character, beat } = play;

    agentStructuredObject.submit({
      agent: "actor",
      language: "French",
      slugline,
      role: character.role,
      actions: beat.actions,
    });
  });

  function onSubmit(event: Event) {
    event.preventDefault();

    const { slugline, character, beat } = play;

    agentStructuredObject.submit({
      agent: "teacher",
      language: "French",
      slugline: slugline,
      role: character.role,
      actions: beat.actions,
      input: chatInput,
    });

    messages.push({
      id: crypto.randomUUID(),
      parts: [{ type: "text", text: chatInput }],
      role: "user",
    });

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

      return () => clearTimeout(timeout);
    }
  });
</script>

<ul
  class="grow divide-y divide-gray-300 overflow-y-auto shadow-inner"
  bind:this={chatElement}
>
  {#each messages as message (message.id)}
    <li class="flex items-start even:bg-gray-100 p-4">
      {#if message.role === "user"}
        <!--img
					width="24"
					height="24"
					src="/blank_avatar.svg"
					alt="avatar"
					class="rounded-full border border-slate-500"
				/-->
        <span class="font-bold">User: </span>
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
            <span class="grow max-w-lg ml-2">
              {part.text.slice(0, animatedMessageLength)}<span
                class="animate-pulse">▊</span
              >
            </span>
          {:else}
            <span class="grow max-w-lg ml-2">{part.text}</span>
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
