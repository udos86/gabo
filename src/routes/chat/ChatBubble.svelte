<script lang="ts">
  import { fade, fly } from 'svelte/transition';
  import type { GaboUIMessage } from '$lib/ai/schema';

  interface Props {
    message: GaboUIMessage;
    isAnimating: boolean;
    animatedMessageId: string | null;
    animatedMessageLength: number;
  }

  let { message, isAnimating, animatedMessageId, animatedMessageLength }: Props = $props();

  const isUser = $derived(message.role === 'user');
  const isAssistant = $derived(message.role === 'assistant');
  const hasTextContent = $derived(message.parts.some(part => part.type === 'text' && part.text.length > 0));
  const avatarSrc = $derived(message.metadata?.agent === 'actor' ? '/waiter.png' : '/teacher.png');

  const isCurrentAnimatedMessage = $derived(animatedMessageId === message.id);
  const showBubble = $derived(isUser || (isCurrentAnimatedMessage ? animatedMessageLength > 0 : hasTextContent));

  const liClass = $derived(`flex items-start gap-4 px-12 py-6 ${isUser ? 'flex-row-reverse' : ''}`);

  const bubbleClass = $derived.by(() => {
    const base = `speech-bubble max-w-[40%] animate-pop`;
    const alignment = isUser ? 'user-bubble r' : 'assistant-bubble l';

    let feedback = '';
    if (message.metadata?.agent === 'teacher' && !isAnimating) {
      feedback = message.metadata.passed ? 'teacher-passed' : 'teacher-failed';
    }

    return `${base} ${alignment} ${feedback}`.trim();
  });

  function messageIn(node: Element, params: { role: string }) {
    return params.role === 'user' ? fade(node, { duration: 200 }) : fly(node, { x: -60, duration: 200, opacity: 0 });
  }

  function getPartText(part: Extract<GaboUIMessage['parts'][number], { type: 'text' }>) {
    return isCurrentAnimatedMessage ? part.text.slice(0, animatedMessageLength) : part.text;
  }
</script>

<li class={liClass} in:messageIn={{ role: message.role }} out:fade={{ duration: 200 }}>
  {#if isUser}
    <img width="56" height="56" src="/user.png" alt="avatar" class="rounded-full border-2 border-slate-300 shadow-sm shrink-0" />
  {/if}
  {#if isAssistant}
    <div class="relative shrink-0">
      {#if isAnimating}
        <!-- Outer Glow -->
        <div class="absolute -inset-2 rounded-full bg-indigo-500/15 blur-xl animate-avatar-glow"></div>
        <!-- Thinking Ring -->
        <div class="absolute -inset-1 rounded-full border-2 border-transparent border-t-indigo-500/60 border-l-indigo-300/60 animate-spin-slow"></div>
      {/if}
      <img width="56" height="56" src={avatarSrc} alt="avatar" class="relative rounded-full border-2 border-white shadow-md transition-all duration-500 ring-1 ring-slate-200" />
    </div>
  {/if}

  {#if showBubble}
    <div class={bubbleClass}>
      {#each message.parts as part, index (index)}
        {#if part.type === 'text'}
          <div class={isCurrentAnimatedMessage ? 'transition-all duration-200' : ''}>
            {getPartText(part)}
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
