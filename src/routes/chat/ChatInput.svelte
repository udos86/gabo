<script lang="ts">
  interface Props {
    disabled?: boolean;
    value: string;
    onSubmit: (event: Event) => void;
  }

  let { value = $bindable(), disabled, onSubmit }: Props = $props();
</script>

<footer class="pb-7 pt-5 flex-initial border-t border-gray-300 shadow-lg bg-white/80 backdrop-blur-sm">
  <form onsubmit={onSubmit} class="flex justify-center items-center gap-2 max-w-xl mx-auto px-4">
    <label for="chatMessage" class="hidden">Message</label>
    <input
      bind:value
      type="text"
      name="message"
      id="chatMessage"
      data-testid="chat-input"
      placeholder="Send a message in French..."
      class="h-12 grow border-2 border-slate-300 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none focus:border-indigo-600 rounded-xl px-4 text-slate-800 transition-all placeholder:text-slate-400"
      disabled={disabled}
      required
    />
    <button
      type="submit"
      data-testid="chat-submit"
      disabled={disabled || value.trim() === ''}
      class="h-12 px-5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-all shadow-sm flex items-center justify-center gap-1 cursor-pointer"
      aria-label="Send"
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5">
        <path d="M3.105 2.288a.75.75 0 0 0-.826.95l1.414 4.926A1.5 1.5 0 0 0 5.135 9.25h6.115a.75.75 0 0 1 0 1.5H5.135a1.5 1.5 0 0 0-1.442 1.086l-1.414 4.926a.75.75 0 0 0 .826.95 28.897 28.897 0 0 0 15.293-7.155.75.75 0 0 0 0-1.114A28.897 28.897 0 0 0 3.105 2.288Z" />
      </svg>
    </button>
  </form>
</footer>
