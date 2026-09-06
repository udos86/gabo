<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  interface SpeechRecognitionInstance {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    maxAlternatives: number;
    onstart: (() => void) | null;
    onresult: ((event: SpeechRecognitionEvent) => void) | null;
    onerror: ((event: { error: string }) => void) | null;
    onend: (() => void) | null;
    start(): void;
    stop(): void;
    abort(): void;
  }

  interface SpeechRecognitionConstructor {
    new (): SpeechRecognitionInstance;
  }

  interface Props {
    disabled?: boolean;
    value: string;
    language?: string;
    onSubmit: (event: Event) => void;
  }

  let { value = $bindable(), disabled, language = 'fr-FR', onSubmit }: Props = $props();

  let isListening = $state(false);
  let isSupported = $state(false);
  let speechError = $state<string | null>(null);

  let recognition: SpeechRecognitionInstance | null = null;
  let baseText = '';

  function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
    if (typeof window === 'undefined') return null;
    const win = window as unknown as {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    return win.SpeechRecognition || win.webkitSpeechRecognition || null;
  }

  onMount(() => {
    isSupported = getSpeechRecognitionConstructor() !== null;
  });

  onDestroy(() => {
    if (recognition) {
      try {
        recognition.abort();
      } catch {
        // Ignore unmount abort errors
      }
    }
  });

  function toggleListening() {
    if (disabled) return;

    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }

  function startListening() {
    speechError = null;
    const SpeechRecognitionClass = getSpeechRecognitionConstructor();

    if (!SpeechRecognitionClass) {
      speechError = 'Voice input is not supported in this browser (try Chrome, Safari, or Edge).';
      return;
    }

    try {
      recognition = new SpeechRecognitionClass();
      recognition.lang = language;
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      // Preserve existing text so user can speak additional phrases
      baseText = value.trim() ? `${value.trim()} ` : '';

      recognition.onstart = () => {
        isListening = true;
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let finalTranscript = '';
        let interimTranscript = '';

        for (let i = 0; i < event.results.length; i++) {
          const result = event.results[i];
          if (!result) continue;
          if (result.isFinal) {
            finalTranscript += result[0]?.transcript ?? '';
          } else {
            interimTranscript += result[0]?.transcript ?? '';
          }
        }

        value = `${baseText}${finalTranscript}${interimTranscript}`;
      };

      recognition.onerror = (event: { error: string }) => {
        if (event.error === 'not-allowed') {
          speechError = 'Microphone permission denied. Allow mic access to speak.';
        } else if (event.error === 'network') {
          speechError = 'Network error during speech recognition.';
        } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
          speechError = `Voice error: ${event.error}`;
        }
        stopListening();
      };

      recognition.onend = () => {
        isListening = false;
      };

      recognition.start();
    } catch (err) {
      console.error('[Voice Input Error]:', err);
      speechError = 'Could not start microphone.';
      isListening = false;
    }
  }

  function stopListening() {
    if (recognition) {
      try {
        recognition.stop();
      } catch {
        // Ignore stop error if already stopped
      }
    }
    isListening = false;
  }

  function handleFormSubmit(event: Event) {
    if (isListening) {
      stopListening();
    }
    onSubmit(event);
  }
</script>

<footer class="pb-7 pt-5 flex-initial border-t border-gray-300 shadow-lg bg-white/80 backdrop-blur-sm">
  <form onsubmit={handleFormSubmit} class="flex flex-col items-center gap-1.5 max-w-xl mx-auto px-4">
    <div class="flex items-center gap-2 w-full">
      <label for="chatMessage" class="hidden">Message</label>
      <input
        bind:value
        type="text"
        name="message"
        id="chatMessage"
        data-testid="chat-input"
        placeholder={isListening ? 'Listening in French... speak now' : 'Send a message in French...'}
        class="h-12 grow border-2 {isListening ? 'border-rose-400 ring-2 ring-rose-300/40' : 'border-slate-300 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600'} focus:outline-none rounded-xl px-4 text-slate-800 transition-all placeholder:text-slate-400"
        {disabled}
        required />

      <!-- Voice input button -->
      <button
        type="button"
        data-testid="chat-mic"
        onclick={toggleListening}
        disabled={disabled || (!isSupported && !speechError)}
        title={!isSupported ? 'Voice input is not supported in this browser (supported in Chrome, Safari, and Edge)' : isListening ? 'Stop listening' : 'Speak in French (click to talk)'}
        class="h-12 w-12 flex-none rounded-xl transition-all shadow-sm flex items-center justify-center cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed {isListening ? 'bg-rose-500 hover:bg-rose-600 text-white animate-pulse ring-4 ring-rose-300/60' : 'border-2 border-slate-300 hover:border-indigo-400 bg-white hover:bg-indigo-50 text-slate-600 hover:text-indigo-600'}"
        aria-label={isListening ? 'Stop listening' : 'Voice input'}>
        {#if isListening}
          <!-- Square Stop Icon -->
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5">
            <path d="M5.25 3A2.25 2.25 0 0 0 3 5.25v9.5A2.25 2.25 0 0 0 5.25 17h9.5A2.25 2.25 0 0 0 17 14.75v-9.5A2.25 2.25 0 0 0 14.75 3h-9.5Z" />
          </svg>
        {:else}
          <!-- Microphone Icon -->
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5">
            <path d="M10 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
            <path d="M15.25 9.75a.75.75 0 0 0-1.5 0 3.75 3.75 0 0 1-7.5 0 .75.75 0 0 0-1.5 0 5.25 5.25 0 0 0 4.5 5.197V17H7.25a.75.75 0 0 0 0 1.5h5.5a.75.75 0 0 0 0-1.5H10.75v-2.053a5.25 5.25 0 0 0 4.5-5.197Z" />
          </svg>
        {/if}
      </button>

      <!-- Submit button -->
      <button type="submit" data-testid="chat-submit" disabled={disabled || value.trim() === ''} class="h-12 px-5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-all shadow-sm flex items-center justify-center gap-1 cursor-pointer" aria-label="Send">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5">
          <path d="M3.105 2.288a.75.75 0 0 0-.826.95l1.414 4.926A1.5 1.5 0 0 0 5.135 9.25h6.115a.75.75 0 0 1 0 1.5H5.135a1.5 1.5 0 0 0-1.442 1.086l-1.414 4.926a.75.75 0 0 0 .826.95 28.897 28.897 0 0 0 15.293-7.155.75.75 0 0 0 0-1.114A28.897 28.897 0 0 0 3.105 2.288Z" />
        </svg>
      </button>
    </div>

    {#if speechError}
      <p class="text-xs text-rose-600 font-medium px-1 flex items-center gap-1 animate-fade-in">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3.5 h-3.5 flex-none">
          <path fill-rule="evenodd" d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14ZM8 4a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 4Zm0 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clip-rule="evenodd" />
        </svg>
        <span>{speechError}</span>
      </p>
    {/if}
  </form>
</footer>
