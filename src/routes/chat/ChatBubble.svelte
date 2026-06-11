<script lang="ts">
  import { fade, fly } from 'svelte/transition';
  import type { GaboUIMessage, UserMessageMetadata } from '$lib/ai/schema';

  interface Props {
    message: GaboUIMessage;
    animatedLength?: number;
  }

  let { message, animatedLength }: Props = $props();

  function messageIn(node: Element, params: { role: string }) {
    return params.role === 'user' ? fade(node, { duration: 200 }) : fly(node, { x: -60, duration: 200, opacity: 0 });
  }

  let showTooltip = $state(false);

  const isUser = $derived(message.role === 'user');
  const userMeta = $derived(message.role === 'user' ? message.metadata as UserMessageMetadata : undefined);
  const isAssistant = $derived(message.role === 'assistant');
  const avatarSrc = $derived(message.role === 'assistant' && message.metadata.agent === 'actor' ? '/waiter.png' : '/teacher.png');

  const liClass = $derived(`flex items-start gap-4 px-12 py-6 ${isUser ? 'flex-row-reverse' : ''}`);
  const bubbleClass = $derived.by(() => {
    const base = `speech-bubble max-w-[40%] animate-pop`;
    const alignment = isUser ? 'user-bubble r' : 'assistant-bubble l';

    let feedback = '';
    if (isUser && userMeta && userMeta.status === 'done') {
      feedback = userMeta.passed ? 'teacher-passed' : 'teacher-failed';
    }

    return `${base} ${alignment} ${feedback}`.trim();
  });

  function getPartText(part: Extract<GaboUIMessage['parts'][number], { type: 'text' }>) {
    return animatedLength !== undefined ? part.text.slice(0, animatedLength) : part.text;
  }
</script>

<li class={liClass} in:messageIn={{ role: message.role }} out:fade={{ duration: 200 }}>
  {#if isUser && userMeta}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div 
      class="relative shrink-0 cursor-pointer"
      onmouseenter={() => showTooltip = true}
      onmouseleave={() => showTooltip = false}
      onclick={() => showTooltip = !showTooltip}
      role="button"
      tabindex="0"
    >
      {#if userMeta.status === 'pending' || userMeta.status === 'ready'}
        <!-- Outer Glow -->
        <div class="absolute -inset-2 rounded-full bg-indigo-500/15 blur-xl animate-avatar-glow"></div>
        <!-- Thinking Ring -->
        <div class="absolute -inset-1 rounded-full border-2 border-transparent border-t-indigo-500/60 border-l-indigo-300/60 animate-spin-slow z-10"></div>
      {/if}

      <div class="relative">
        <img width="56" height="56" src="/user.png" alt="avatar" class="relative rounded-full border-2 border-slate-300 shadow-sm transition-all duration-500 ring-1 ring-slate-200" />

        {#if userMeta.status === 'done'}
          <div class="absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center text-sm text-white {userMeta.passed ? 'bg-green-500 ring-2 ring-white' : 'bg-red-500 ring-2 ring-white'} z-20 shadow-sm">
            {userMeta.passed ? '✓' : '✗'}
          </div>
        {/if}
      </div>

      {#if showTooltip && userMeta.status === 'done' && userMeta.feedbackText}
        <div class="absolute right-full top-0 mr-4 w-64 p-3 bg-slate-800 text-white text-sm rounded-lg shadow-lg z-30 break-words pointer-events-none">
          {userMeta.feedbackText}
        </div>
      {/if}
    </div>
  {/if}
  {#if isAssistant}
    <div class="relative shrink-0">
      {#if message.metadata?.status !== 'done'}
        <!-- Outer Glow -->
        <div class="absolute -inset-2 rounded-full bg-indigo-500/15 blur-xl animate-avatar-glow"></div>
        <!-- Thinking Ring -->
        <div class="absolute -inset-1 rounded-full border-2 border-transparent border-t-indigo-500/60 border-l-indigo-300/60 animate-spin-slow"></div>
      {/if}
      <img width="56" height="56" src={avatarSrc} alt="avatar" class="relative rounded-full border-2 border-white shadow-md transition-all duration-500 ring-1 ring-slate-200" />
    </div>
  {/if}

  {#if (isAssistant && (message.metadata?.status === 'animating' || message.metadata?.status === 'done')) || isUser}
    <div class={bubbleClass}>
      {#each message.parts as part, index (index)}
        {#if part.type === 'text'}
          <div class={animatedLength !== undefined && isAssistant ? 'transition-all duration-200' : ''}>
            {isUser ? part.text : getPartText(part)}
          </div>
        {/if}
      {/each}
    </div>
  {/if}
</li>

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
    margin-right: auto;
  }

  .user-bubble {
    --border-color: #94a3b8; /* Slate 400 */
    margin-left: auto;
  }

  /* Common tail parts */
  .speech-bubble:before,
  .speech-bubble:after {
    content: '';
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
    0% {
      transform: scale(0.9);
      opacity: 0;
    }
    100% {
      transform: scale(1);
      opacity: 1;
    }
  }
</style>
