import { Experimental_StructuredObject, type UIMessage } from "@ai-sdk/svelte";

import { convertToDialogue } from "$lib/ai/actor";
import { agentOutputSchema, type GaboUIMessage } from "$lib/ai/schema";
import { Play, type Screenplay } from "$lib/screenplay/screenplay";

class Resolver<Type = void> {
  #promise: Promise<Type>;
  // @ts-expect-error - assigned synchronously in the executor
  resolve: (value: Type | PromiseLike<Type>) => void;

  constructor() {
    this.#promise = new Promise<Type>(resolve => this.resolve = resolve);
  }

  then<FulfilledResultType = Type, RejectedResultType = never>(
    onfulfilled?: ((value: Type) => FulfilledResultType | PromiseLike<FulfilledResultType>) | null,
    onrejected?: ((reason: any) => RejectedResultType | PromiseLike<RejectedResultType>) | null
  ): Promise<FulfilledResultType | RejectedResultType> {
    return this.#promise.then(onfulfilled, onrejected);
  }
}

export class ChatSession {
  #getScreenplay: () => Screenplay;

  messages = $state<Array<GaboUIMessage>>([]);
  chatInput = $state("");
  play = $derived.by(() => new Play({ screenplay: this.#getScreenplay() }));

  agentStructuredObject: Experimental_StructuredObject<typeof agentOutputSchema>;
  
  pendingMessageId = $derived.by(() => {
    const pendingMessage = this.messages.at(-1);
    return pendingMessage?.metadata?.pending === true ? pendingMessage.id : null;
  });

  animatedMessageId = $state<string | null>(null);
  animatedMessageLength = $state(0);
  animatedMessage = $derived(this.messages.find(message => message.id === this.animatedMessageId));
  #animationResolver: Resolver<void> | null = null;

  constructor(getScreenplay: () => Screenplay) {
    this.#getScreenplay = getScreenplay;

    this.agentStructuredObject = new Experimental_StructuredObject({
      api: "/api/agent",
      schema: agentOutputSchema,
      onFinish: async (output) => {
        if (output.object == null) return;

        // Wait for the message to finish animating before we trigger the next turn
        if (this.#animationResolver instanceof Resolver) await this.#animationResolver;

        let message: GaboUIMessage | undefined;

        const parts: UIMessage['parts'] = [{ type: "text", text: output.object.text }];

        const metadata = (() => {
          switch (output.object.agent) {
            case "actor":
              return { agent: "actor", position: this.play.position } as const;
            case "teacher":
              return { agent: "teacher", position: this.play.position, passed: output.object.passed } as const;
          }
        })();

        if (this.pendingMessageId === null) {
          const id = globalThis.crypto.randomUUID();
          message = { id, parts, role: "assistant", metadata };
          this.messages.push(message);
        } else {
          message = this.messages.find(message => message.id === this.pendingMessageId);
          if (message === undefined) return;
          message.parts = parts;
          message.metadata = metadata;
        }

        this.animatedMessageId = message.id;
        this.#animationResolver = new Resolver();

        if (output.object.agent === "teacher" && !output.object.passed) return;

        this.nextTurn();
      },
    });

    $effect(() => {
      if (this.animatedMessage === undefined) return;

      const lastPart = this.animatedMessage.parts.at(-1);
      const text = lastPart?.type === "text" ? lastPart.text : "";

      if (this.animatedMessageLength < text.length) {
        const timeout = globalThis.setTimeout(() => this.animatedMessageLength++, 30);
        return () => globalThis.clearTimeout(timeout);
      }

      if (this.#animationResolver instanceof Resolver) {
        this.#animationResolver.resolve();
        this.#animationResolver = null;
      }

      this.animatedMessageId = null;
      this.animatedMessageLength = 0;
    });
  }

  nextTurn() {
    const done = this.play.next();
    if (done) return;
    const { beat, character, slugline } = this.play;

    if (character.actor === "assistant") {
      this.agentStructuredObject.submit({
        agent: "actor",
        language: "French",
        slugline,
        role: character.role,
        actions: beat.actions,
        interlocutors: this.play.others.map(({ role }) => role),
        dialogue: convertToDialogue(this.messages, this.play),
      });

      this.messages.push({
        id: crypto.randomUUID(),
        parts: [{ type: "text", text: "" }],
        role: "assistant",
        metadata: {
          agent: "actor",
          position: this.play.position,
          pending: true,
        },
      });
    }
  }

  onSubmit(event: Event) {
    event.preventDefault();
    const { slugline, character, beat, position } = this.play;

    // Add user message
    this.messages.push({
      id: globalThis.crypto.randomUUID(),
      parts: [{ type: "text", text: this.chatInput }],
      role: "user",
      metadata: { position },
    });

    // Request teacher (LLM judge) to evaluate user input
    this.agentStructuredObject.submit({
      agent: "teacher",
      language: "French",
      input: this.chatInput,
      slugline,
      role: character.role,
      actions: beat.actions,
      interlocutors: this.play.others.map(({ role }) => role),
      dialogue: convertToDialogue(this.messages, this.play),
    });

    // Add pending teacher agent message
    this.messages.push({
      id: globalThis.crypto.randomUUID(),
      parts: [{ type: "text", text: "" }],
      role: "assistant",
      metadata: { agent: "teacher", position, pending: true },
    });

    this.chatInput = "";
  }
}
