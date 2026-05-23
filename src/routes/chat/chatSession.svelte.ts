import { Experimental_StructuredObject } from "@ai-sdk/svelte";

import { convertToDialogue } from "$lib/ai/actor";
import { agentOutputSchema, type GaboUIMessage } from "$lib/ai/schema";
import { Play, type Screenplay } from "$lib/screenplay/screenplay";

export class ChatSession {
  #getScreenplay: () => Screenplay;

  messages = $state<Array<GaboUIMessage>>([]);
  chatInput = $state("");
  play = $derived.by(() => new Play({ screenplay: this.#getScreenplay() }));

  animatedMessages = $state<Record<string, number>>({});
  animationTick = $state(0);
  #timeouts = new Map<string, ReturnType<typeof setTimeout>>();
  #animationResolvers = new Map<string, () => void>();

  pendingMessageId = $derived.by(() => {
    const pendingMessage = this.messages.at(-1);
    return pendingMessage?.metadata?.pending === true ? pendingMessage.id : null;
  });

  agentStructuredObject: Experimental_StructuredObject<typeof agentOutputSchema>;

  constructor(getScreenplay: () => Screenplay) {
    this.#getScreenplay = getScreenplay;

    this.agentStructuredObject = new Experimental_StructuredObject({
      api: "/api/agent",
      schema: agentOutputSchema,
      onFinish: async (output) => {
        if (output.object == null) return;
        let message: GaboUIMessage | undefined;

        const metadata = (() => {
          switch (output.object.agent) {
            case "actor":
              return { agent: "actor", position: this.play.position } as const;
            case "teacher":
              return { agent: "teacher", position: this.play.position, passed: output.object.passed } as const;
          }
        })();

        if (this.pendingMessageId === null) {
          message = {
            id: crypto.randomUUID(),
            parts: [{ type: "text", text: output.object.text }],
            role: "assistant",
            metadata,
          };
          this.messages.push(message);
        } else {
          message = this.messages.find((m) => m.id === this.pendingMessageId);
          if (message === undefined) return;
          message.parts = [{ type: "text", text: output.object.text }];
          message.metadata = metadata;
        }

        this.startAnimation(message);

        if (output.object.agent === "teacher" && !output.object.passed) {
          // End the lesson
          return;
        }

        await this.waitForMessageAnimation(message.id);
        this.nextTurn();
      },
    });
  }

  startAnimation(message: GaboUIMessage) {
    if (message.role !== "assistant") return;
    const lastPart = message.parts.at(-1);
    const text = lastPart?.type === "text" ? lastPart.text : "";
    if (!text) return;

    this.clearAnimation(message.id);
    this.animatedMessages[message.id] = 0;

    const tick = () => {
      const current = this.animatedMessages[message.id] ?? 0;
      if (current < text.length) {
        this.animatedMessages[message.id] = current + 1;
        this.animationTick++;
        const timeout = setTimeout(tick, 30);
        this.#timeouts.set(message.id, timeout);
      } else {
        this.clearAnimation(message.id);
        if (this.#animationResolvers.has(message.id)) {
          this.#animationResolvers.get(message.id)!();
          this.#animationResolvers.delete(message.id);
        }
      }
    };
    const timeout = setTimeout(tick, 30);
    this.#timeouts.set(message.id, timeout);
  }

  clearAnimation(messageId: string) {
    if (this.#timeouts.has(messageId)) {
      clearTimeout(this.#timeouts.get(messageId));
      this.#timeouts.delete(messageId);
    }
  }

  isMessageAnimating(message: GaboUIMessage): boolean {
    if (message.metadata?.pending) return true;
    if (message.role !== "assistant") return false;

    const lastPart = message.parts.at(-1);
    const text = lastPart?.type === "text" ? lastPart.text : "";
    const currentLength = this.animatedMessages[message.id];

    if (currentLength === undefined) return false;
    return currentLength < text.length;
  }

  getAnimatedLength(message: GaboUIMessage): number | undefined {
    return this.animatedMessages[message.id];
  }

  waitForMessageAnimation(messageId: string): Promise<void> {
    return new Promise((resolve) => {
      const message = this.messages.find((m) => m.id === messageId);
      const lastPart = message?.parts.at(-1);
      const text = lastPart?.type === "text" ? lastPart.text : "";

      const currentLength = this.animatedMessages[messageId];
      if (currentLength !== undefined && currentLength >= text.length) {
        resolve();
      } else {
        this.#animationResolvers.set(messageId, resolve);
      }
    });
  }

  nextTurn() {
    const done = this.play.next();
    if (done) return;
    const { beat, character, slugline } = this.play;

    if (character.actor === "assistant") {
      // request actor response
      this.agentStructuredObject.submit({
        agent: "actor",
        language: "French",
        slugline,
        role: character.role,
        actions: beat.actions,
        interlocutors: this.play.others.map(({ role }) => role),
        dialogue: convertToDialogue(this.messages, this.play),
      });
      // add pending actor message
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
    // add user message
    this.messages.push({
      id: crypto.randomUUID(),
      parts: [{ type: "text", text: this.chatInput }],
      role: "user",
      metadata: {
        position,
      },
    });
    // request teacher response
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
    // add pending teacher message
    this.messages.push({
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
    this.chatInput = "";
  }
}
