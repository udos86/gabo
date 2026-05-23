import { Experimental_StructuredObject } from "@ai-sdk/svelte";

import { convertToDialogue } from "$lib/ai/actor";
import { agentOutputSchema, type GaboUIMessage } from "$lib/ai/schema";
import { Play, type Screenplay } from "$lib/screenplay/screenplay";

export class ChatSession {
  #getScreenplay: () => Screenplay;

  messages = $state<Array<GaboUIMessage>>([]);
  chatInput = $state("");
  play = $derived.by(() => new Play({ screenplay: this.#getScreenplay() }));

  animatedMessageId = $state<string | null>(null);
  animatedMessageLength = $state(0);
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

        if (output.object.agent === "teacher" && !output.object.passed) {
          // End the lesson
          return;
        }

        await this.waitForMessageAnimation(message.id);
        this.nextTurn();
      },
    });

    $effect(() => {
      const lastMessage = this.messages.at(-1);

      if (lastMessage?.id !== this.animatedMessageId) {
        if (this.animatedMessageId && this.#animationResolvers.has(this.animatedMessageId)) {
          this.#animationResolvers.get(this.animatedMessageId)!();
          this.#animationResolvers.delete(this.animatedMessageId);
        }
        this.animatedMessageId = null;
        this.animatedMessageLength = 0;
      }

      if (lastMessage?.role !== "assistant") return;

      this.animatedMessageId = lastMessage.id;
      const lastPart = lastMessage?.parts.at(-1);
      const text = lastPart?.type === "text" ? lastPart.text : "";

      if (this.animatedMessageLength < text.length) {
        const timeout = setTimeout(() => {
          this.animatedMessageLength++;
        }, 30);
        return () => clearTimeout(timeout);
      }

      if (this.#animationResolvers.has(lastMessage.id)) {
        this.#animationResolvers.get(lastMessage.id)!();
        this.#animationResolvers.delete(lastMessage.id);
      }
    });
  }

  isMessageAnimating(message: GaboUIMessage) {
    if (message.metadata?.pending) return true;
    if (this.animatedMessageId !== message.id) return false;
    const lastPart = message.parts.at(-1);
    const text = lastPart?.type === "text" ? lastPart.text : "";
    return this.animatedMessageLength < text.length;
  }

  waitForMessageAnimation(messageId: string): Promise<void> {
    return new Promise((resolve) => {
      const message = this.messages.find((m) => m.id === messageId);
      const lastPart = message?.parts.at(-1);
      const text = lastPart?.type === "text" ? lastPart.text : "";

      if (this.animatedMessageId === messageId && this.animatedMessageLength >= text.length) {
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
