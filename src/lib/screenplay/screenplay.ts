
export interface CharacterRole {
  name: string;
  description: string;
  gender: 'male' | 'female' | 'diverse';
}

export interface Character {
  id: string;
  actor: 'assistant' | 'user';
  role: CharacterRole;
  avatarUrl: string;
}

export interface Beat {
  character: Character['id'];
  actions: string[];
}

export interface Scene {
  setting: 'INT' | 'EXT';
  location: string;
  time: string;
  characters: Character['id'][];
}

export interface Milestone {
  id: string;
  description: string;
}

export interface Screenplay {
  characters: Record<Character['id'], Character>;
  scene: Scene;
  opening: Beat;
  goal: string;
  milestones: Milestone[];
  maxTurns: number;
}

export interface PlayConfig {
  screenplay: Screenplay;
}

export class Play {
  #screenplay: Screenplay;
  #currentBeat: Beat | null = null;
  #milestoneStatus: Map<string, boolean>;
  #turnsElapsed: number = 0;
  #completed: boolean = false;
  #started: boolean = false;

  constructor({ screenplay }: PlayConfig) {
    this.#screenplay = screenplay;
    this.#milestoneStatus = new Map(
      screenplay.milestones.map(({ id }) => [id, false])
    );
  }

  // -- Reads --

  get scene(): Scene {
    return this.#screenplay.scene;
  }

  get slugline(): string {
    const { setting, location, time } = this.scene;
    return `${setting}. ${location} - ${time}`;
  }

  get beat(): Beat {
    if (this.#currentBeat === null) throw new Error('No current beat. Call start() or setNextBeat() first.');
    return this.#currentBeat;
  }

  get character(): Character {
    const character = this.#screenplay.characters[this.beat.character];
    if (character === undefined) throw new Error(`Character with id ${this.beat.character} not found in screenplay.`);
    return character;
  }

  get others(): Character[] {
    const characterId = this.beat.character;
    return this.scene.characters
      .map(id => this.#screenplay.characters[id]!)
      .filter(character => character.id !== characterId);
  }

  get goal(): string {
    return this.#screenplay.goal;
  }

  get milestones(): Array<Milestone & { reached: boolean }> {
    return this.#screenplay.milestones.map(m => ({
      ...m,
      reached: this.#milestoneStatus.get(m.id) ?? false
    }));
  }

  get currentMilestone(): Milestone | null {
    return this.#screenplay.milestones.find(
      m => !this.#milestoneStatus.get(m.id)
    ) ?? null;
  }

  get completedMilestones(): string[] {
    return [...this.#milestoneStatus.entries()]
      .filter(([, reached]) => reached)
      .map(([id]) => id);
  }

  get turnsRemaining(): number {
    return this.#screenplay.maxTurns - this.#turnsElapsed;
  }

  get turnsElapsed(): number {
    return this.#turnsElapsed;
  }

  get isCompleted(): boolean {
    return this.#completed;
  }

  get isStarted(): boolean {
    return this.#started;
  }

  getCharacterById(id: string): Character {
    const character = this.#screenplay.characters[id];
    if (character === undefined) throw new Error(`Character with id ${id} not found in screenplay.`);
    return character;
  }

  /** Returns a map of character IDs to character names for the Actor's context. */
  get characterIdMap(): Record<string, string> {
    return Object.fromEntries(
      Object.values(this.#screenplay.characters).map(c => [c.id, c.role.name])
    );
  }

  // -- Mutations --

  /** Load the authored opening beat and mark the play as started. */
  start(): void {
    this.#currentBeat = this.#screenplay.opening;
    this.#started = true;
  }

  /** Get the AI (assistant) character in the scene. */
  get aiCharacter(): Character {
    const aiChar = this.scene.characters
      .map(id => this.#screenplay.characters[id]!)
      .find(c => c.actor === 'assistant');
    if (!aiChar) throw new Error('No assistant character found in scene.');
    return aiChar;
  }

  /** Set the next beat from the Actor agent's output. */
  setNextBeat(beat: Beat): void {
    this.#currentBeat = beat;
    this.#turnsElapsed++;
  }

  /** Advance the turn counter and set a reactive beat for the AI character. */
  advanceTurn(): void {
    this.#turnsElapsed++;
    this.#currentBeat = {
      character: this.aiCharacter.id,
      actions: [],
    };
  }

  /** Mark a milestone as reached. */
  reachMilestone(id: string): void {
    if (!this.#milestoneStatus.has(id)) {
      throw new Error(`Unknown milestone id: ${id}`);
    }
    this.#milestoneStatus.set(id, true);
  }

  /** Mark the lesson as completed. */
  complete(): void {
    this.#completed = true;
  }
}
