<script lang="ts">
  interface Props {
    value: string;
    onSubmit: (event: Event) => void;
  }

  let { value = $bindable(), onSubmit }: Props = $props();
</script>

<footer class="pb-7 pt-5 flex-initial border-t border-gray-300 shadow-lg">
  <form onsubmit={onSubmit} class="flex justify-center">
    <label for="chatMessage" class="hidden">Message</label>
    <input
      bind:value
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
