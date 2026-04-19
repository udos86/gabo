<script lang="ts">
  import { onMount } from "svelte";
  import { fade, fly } from "svelte/transition";
  import { Experimental_StructuredObject } from "@ai-sdk/svelte";

  import { convertToDialogue } from "$lib/ai/actor";
  import { agentOutputSchema, type GaboUIMessage } from "$lib/ai/schema";
  import { Play } from "$lib/screenplay/screenplay";

  import type { PageProps } from "./$types";

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

  function isMessageAnimating(message: GaboUIMessage) {
    if (message.metadata?.pending) return true;
    if (animatedMessageId !== message.id) return false;
    const lastPart = message.parts.at(-1);
    const text = lastPart?.type === "text" ? lastPart.text : "";
    return animatedMessageLength < text.length;
  }

  function waitForMessageAnimation(messageId: string): Promise<void> {
    return new Promise((resolve) => {
      const message = messages.find((message) => message.id === messageId);
      const lastPart = message?.parts.at(-1);
      const text = lastPart?.type === "text" ? lastPart.text : "";

      if (animatedMessageId === messageId && animatedMessageLength >= text.length) {
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

      const metadata = (() => {
        switch (output.object.agent) {
          case "actor":
            return { agent: "actor", position: play.position } as const;
          case "teacher":
            return { agent: "teacher", position: play.position, passed: output.object.passed } as const;
        }
      })();

      if (pendingMessageId === null) {
        message = {
          id: crypto.randomUUID(),
          parts: [{ type: "text", text: output.object.text }],
          role: "assistant",
          metadata,
        };
        messages.push(message);
      } else {
        message = messages.find((message) => message.id === pendingMessageId);
        if (message === undefined) return;
        message.parts = [{ type: "text", text: output.object.text }];
        // delete message.metadata?.pending;
        message.metadata = metadata;
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
    const done = play.next();
    if (done) return;
    const { beat, character, slugline } = play;

    if (character.actor === "assistant") {
      // request actor response
      agentStructuredObject.submit({
        agent: "actor",
        language: "French",
        slugline,
        role: character.role,
        actions: beat.actions,
        interlocutors: play.others.map(({ role }) => role),
        dialogue: convertToDialogue(messages, play),
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
      input: chatInput,
      slugline,
      role: character.role,
      actions: beat.actions,
      interlocutors: play.others.map(({ role }) => role),
      dialogue: convertToDialogue(messages, play),
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
    return fly(node, { x: -60, duration: 200, opacity: 0 });
  }
</script>

<style>
  .speech-bubble {
    --arrow-w: 6px;
    --arrow-h: 8px;
    --bubble-corners: 18px;
    --border-size: 1px;
    --text-color: #1e293b;
    --bubble-color: white;
    --border-color: #e2e8f0;
    
    position: relative;
    padding: 0.8rem 1.2rem;
    background: var(--bubble-color);
    border-radius: var(--bubble-corners);
    color: var(--text-color);
    box-shadow: 
      0 0 0 var(--border-size) var(--border-color),
      0 4px 6px -1px rgb(0 0 0 / 0.05),
      0 2px 4px -2px rgb(0 0 0 / 0.05);
    font-size: 1.05rem;
    line-height: 1.5;
    word-break: break-word;
    transition: all 0.3s ease;
  }

  /* Role specific themes */
  .assistant-bubble {
    --border-color: #94a3b8; /* Slate 400 */
    /*--bubble-color: #f8fafc; /* Slate 50 */
    margin-right: auto;
  }

  .user-bubble {
    --border-color: #94a3b8; /* Slate 400 */
    /*--bubble-color: #f8fafc; /* Slate 50 */
    margin-left: auto;
  }

  /* Common tail parts */
  .speech-bubble:before,
  .speech-bubble:after {
    content: "";
    position: absolute;
    border-style: solid;
    display: block;
    width: 0;
    height: 0;
  }

  /* Left tail (Assistant) */
  .speech-bubble.l:after {
    border-color: transparent var(--bubble-color) transparent transparent;
    border-width: var(--arrow-w) var(--arrow-h);
    top: 20px;
    left: calc(-1 * var(--arrow-h) * 2 + 1px);
  }

  .speech-bubble.l:before {
    border-width: calc(var(--arrow-w) + var(--border-size)) calc(var(--arrow-h) + var(--border-size));
    border-color: transparent var(--border-color) transparent transparent;
    top: calc(20px - var(--border-size));
    left: calc(-1 * var(--arrow-h) * 2 - 2 * var(--border-size));
  }

  /* Right tail (User) */
  .speech-bubble.r:after {
    border-color: transparent transparent transparent var(--bubble-color);
    border-width: var(--arrow-w) var(--arrow-h);
    top: 20px;
    right: calc(-1 * var(--arrow-h) * 2 + 1px);
  }

  .speech-bubble.r:before {
    border-width: calc(var(--arrow-w) + var(--border-size)) calc(var(--arrow-h) + var(--border-size));
    border-color: transparent transparent transparent var(--border-color);
    top: calc(20px - var(--border-size));
    right: calc(-1 * var(--arrow-h) * 2 - 2 * var(--border-size));
  }

  /* Teacher feedback colors */
  .teacher-passed {
    --border-color: #22c55e; /* Green 500 */
    --border-size: 2px;
    --bubble-color: #f0fdf4; /* Green 50 */
  }

  .teacher-failed {
    --border-color: #ef4444; /* Red 500 */
    --border-size: 2px;
    --bubble-color: #fef2f2; /* Red 50 */
  }

  /* Pop animation for message entry */
  .animate-pop {
    animation: pop-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
  }

  @keyframes pop-in {
    0% { transform: scale(0.9); opacity: 0; }
    100% { transform: scale(1); opacity: 1; }
  }
</style>

<ul
  class="grow overflow-y-auto pt-8 scroll-smooth"
  bind:this={chatElement}
>
  {#each messages as message (message.id)}
    <li
      in:messageIn={{ role: message.role }}
      out:fade={{ duration: 200 }}
      class="flex items-start gap-4 px-12 py-6 {message.role === 'user' ? 'flex-row-reverse' : ''}"
    >
      {#if message.role === "user"}
        <img
          width="56"
          height="56"
          src="/user.png"
          alt="avatar"
          class="rounded-full border-2 border-slate-300 shadow-sm shrink-0"
        />
      {/if}
      {#if message.role === "assistant"}
        <div class="relative shrink-0">
          {#if isMessageAnimating(message)}
            <!-- Outer Glow -->
            <div class="absolute -inset-2 rounded-full bg-indigo-500/15 blur-xl animate-avatar-glow"></div>
            <!-- Thinking Ring -->
            <div class="absolute -inset-1 rounded-full border-2 border-transparent border-t-indigo-500/60 border-l-indigo-300/60 animate-spin-slow"></div>
          {/if}
          <img
            width="56"
            height="56"
            src={message.metadata?.agent === "actor"? "/waiter.png": "/teacher.png"}
            alt="avatar"
            class="relative rounded-full border-2 border-white shadow-md transition-all duration-500 ring-1 ring-slate-200 {message
              .metadata?.agent === 'teacher' && !isMessageAnimating(message)}"
          />
        </div>
      {/if}

      {#if message.role === "user" || (animatedMessageId === message.id ? animatedMessageLength > 0 : message.parts.some((p) => p.type === "text" && p.text.length > 0))}
        <div
          class="speech-bubble max-w-[40%] animate-pop {message.role === 'user'
            ? 'user-bubble r'
            : 'assistant-bubble l'} 
               {message.metadata?.agent === 'teacher' && !isMessageAnimating(message)
            ? message.metadata.passed
              ? 'teacher-passed'
              : 'teacher-failed'
            : ''}"
        >
          {#each message.parts as part, index (index)}
            {#if part.type === "text"}
              {#if animatedMessageId === message.id}
                <div class="transition-all duration-200">
                  {part.text.slice(0, animatedMessageLength)}
                  {#if message.metadata?.pending || animatedMessageLength < part.text.length}
                    <!--span class="inline-block w-1 h-4 ml-1 bg-indigo-400 animate-pulse align-middle"></span-->
                  {/if}
                </div>
              {:else}
                <div>{part.text}</div>
              {/if}
            {/if}
          {/each}
        </div>
      {/if}
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
