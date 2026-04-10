
export interface Character {
  id: string;
  actor: 'assistant' | 'user';
  name: string | null;
  role: string;
  avatarUrl: string;
}

export interface Beat {
  character: Character['id'];
  actions: string[];
}

export interface Scene {
  title: string;
  setting: 'INT' | 'EXT';
  location: string;
  time: string;
  dialog: Array<Beat>;
}

export interface Screenplay {
  characters: Record<Character['id'], Character>;
  scenes: Array<Scene>;
}

export interface PlayConfig {
  screenplay: Screenplay;
  sceneStartIndex?: number;
  beatStartIndex?: number;
}

export class Play {
  #screenplay: Screenplay;
  #currentSceneIndex: number = -1;
  #currentBeatIndex: number = -1;
  #sceneStartIndex: number;
  #beatStartIndex: number;
  #generator: ReturnType<typeof this.beats> | null = null;

  constructor({ screenplay, sceneStartIndex = 0, beatStartIndex = 0 }: PlayConfig) {
    this.#screenplay = screenplay;
    this.#sceneStartIndex = sceneStartIndex;
    this.#beatStartIndex = beatStartIndex;
  }

  get scene(): Scene {
    return this.#screenplay.scenes[this.#currentSceneIndex]!;
  }

  get slugline(): string {
    const { setting, location, time } = this.scene;
    return `${setting}. ${location} - ${time}`;
  }

  get beat(): Beat {
    return this.scene.dialog[this.#currentBeatIndex]!;
  }

  get character(): Character {
    const character = this.#screenplay.characters[this.beat.character];
    if (character === undefined) throw new Error(`Character with id ${this.beat.character} not found in screenplay.`);
    return character;
  }

  get position(): [sceneIndex: number, beatIndex: number] {
    return [this.#currentSceneIndex, this.#currentBeatIndex];
  }

  next(): boolean {
    if (this.#generator === null) this.#generator = this.beats();
    const result = this.#generator.next();
    return !result.done;
  }

  theEnd(): boolean {
    return this.#currentSceneIndex >= this.#screenplay.scenes.length;
  }

  *beats() {
    this.#currentSceneIndex = this.#sceneStartIndex;

    while (this.#currentSceneIndex < this.#screenplay.scenes.length) {
      this.#currentBeatIndex = this.#beatStartIndex;
      const dialog = this.scene.dialog;

      while (this.#currentBeatIndex < dialog.length) {
        const { actions } = this.beat;
        yield { actions, character: this.character, beatIndex: this.#currentBeatIndex, sceneIndex: this.#currentSceneIndex };
        this.#currentBeatIndex++;
      }
      this.#currentSceneIndex++;
    }
  }
}
