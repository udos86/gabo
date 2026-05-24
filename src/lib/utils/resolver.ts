export class Resolver<Type = void> {
  #promise: Promise<Type>;

  resolve!: (value: Type | PromiseLike<Type>) => void;

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
