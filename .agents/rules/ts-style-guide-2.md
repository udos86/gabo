---
trigger: glob
globs: **/*.{ts,tsx,js,jsx,mts,cts,mjs,cjs}
---

# JavaScript / TypeScript Coding Standards Part II


## Narrowing / Control Flow
- always use the narrowing strategy that matches the runtime shape, e.g. `typeof`, `instanceof`, `in`, discriminant checks, `Array.isArray`, explicit `null` or `undefined` checks.
- always use explicit `typeof` checks for primitive union narrowing, e.g. `typeof value === 'string'`.
- always use discriminant-based `switch` for discriminated unions and ensure exhaustive handling, e.g. exhaustive `default` with `never` checks.
- always use early returns to avoid deep nesting:
    ```ts
    // ❌ Bad: deep-nesting
    function handleValue(value: string | undefined): void {
      if (typeof value === 'string') {
        // ...use value
      }
    }

    // ✅ Good: early return
    function handleValue(value: string | undefined): void {
      if (value === undefined) return;
      // ...use value
    }
    ```
- always use positive conditions when possible, e.g. `if (isValid)` instead of `if (!isInvalid)`.
- always use positive (non-negated) equality checks when possible, e.g. `if (value === 0)` instead of `if (value !== 0)`.
- never use implicit boolean coercion on non-boolean values, e.g. prefer `if (items.length > 0)` over `if (items.length)`.
- always use unbraced, single-line `if` statements for simple conditions.
- always prefer a single ternary `return` over an `if` followed by a fallback `return` when both branches return a value directly:
    ```ts
    // ❌ Bad: redundant branching for direct return values
    function getSortDirection(isAscending: boolean): 1 | -1 {
      if (isAscending) return 1;
      return -1;
    }

    // ✅ Good: single-expression direct return
    function getSortDirection(isAscending: boolean): 1 | -1 {
      return isAscending ? 1 : -1;
    }
    ```
- always prefer `for...of` over `forEach` and index-based loops for imperative iteration and side-effects.
- always use `map`, `filter`, `reduce`, and related array methods for pure functional transformation pipelines.
- prefer the `switch(true)` pattern for complex conditional logic over multiple consecutive `if` statements for better readability and maintainability:
    ```ts
    // ❌ Bad: multiple consecutive if statements
    onEvent(event: EventA | EventB | EventC): void {
      if (event instanceof EventA) {
        // ...handle EventA
      } else if (event instanceof EventB) {
        // ...handle EventB
      } else if (event instanceof EventC) {
        // ...handle EventC
      }
    }

    // ✅ Good: switch(true) pattern for complex conditional logic
    onEvent(event: EventA | EventB | EventC): void {
      switch (true) {
        case event instanceof EventA:
          // ...handle EventA
          break;
        case event instanceof EventB:
          // ...handle EventB
          break;
        case event instanceof EventC:
          // ...handle EventC
          break;
        }
    }
    ```

## Functions / Methods
- always prefer function declarations for named, reusable functions.
- always use arrow functions when lexical `this` is required or for inline single-expression callbacks.
- use a single configuration object when a function has more than 2 arguments, e.g. `function createUser({ name, age }: CreateUserOptions)`.
- always use default parameter values instead of manual `param = param ?? default` patterns.
- always use the `override` keyword when overriding inherited methods or properties.

## DOM
- when a DOM query return type requires type narrowing that cannot be inferred from the selector string, always prefer a concrete generic type on `querySelector` or `querySelectorAll` over a type assertion:
    ```ts
    // ❌ Bad: type assertion bypasses safer query typing
    const dialog = document.querySelector('.some-class dialog') as HTMLDialogElement;

    // ✅ Good: generic preserves explicit element typing
    const dialog = document.querySelector<HTMLDialogElement>('.some-class dialog');
    ```
- when handling DOM events, prefer destructuring `currentTarget` or `target` in the parameter list and rename it to a semantic local variable, then immediately guard its concrete element type via `instanceof` before using it:
    ```ts
    onClick({ currentTarget: button }: PointerEvent): void {
        /** v8 ignore next -- @preserve */   
        if (!(button instanceof HTMLButtonElement)) return;
        // ...use button
    }
    
    onSlotChange({ target: slot }: Event): void {
        /* v8 ignore next -- @preserve */
        if (!(slot instanceof HTMLSlotElement)) return;
        // ...use slot
    }
    ```

## Tests
- never throw errors in test.
- always prefer the most specific type-aware matcher (e.g. `toBeInstanceOf`) over generic presence matchers (e.g. `toBeDefined`):
    ```ts
    // ❌ Bad: generic matcher does not preserve explicit element typing
    const dialog = document.querySelector('dialog');
    expect(dialog).toBeDefined();

    // ✅ Good: most specific type-aware matcher preserves explicit element typing
    const dialog = document.querySelector('dialog');
    expect(dialog).toBeInstanceOf(HTMLDialogElement);
    ```
- when a test value can be `null` or `undefined` and is needed for follow-up operations (e.g. `spyOn`, method calls, property access) always use optional chaining first and if that is not sufficient, always narrow it with an `assert`-based runtime check so the type is safe and failures are explicit:
    ```ts
    // optional chaining
    const dialog = document.querySelector('dialog');
    dialog?.close();
    ```
    ```ts
    // assert-based narrowing
    const dialog = document.querySelector('dialog');
    assert(dialog instanceof HTMLDialogElement, 'Dialog element not found');
    const closeSpy = vi.spyOn(dialog, 'close');
    ```

## Imports / Exports
- always ensure this import order, with one blank line between groups:
    1. built-in Node.js modules, e.g. `fs`, `path`
    2. external dependencies, e.g. `lit`
    3. internal sibling imports (same folder), alphabetically sorted by file name
    4. internal parent imports, alphabetically sorted by file name
    5. internal ancestor imports, alphabetically sorted by file name
    6. side-effect imports, e.g. polyfills, global styles
- always use `import type` for type-only imports. This is enforced by `verbatimModuleSyntax`.

## Error Handling
- only use `@ts-expect-error` with a short justification comment.
- always chain errors using the `cause` option, e.g. `throw new Error('...', { cause: error })`.
- never swallow errors silently; always rethrow, log, or handle explicitly.

## Async Patterns
- always prefer `async`/`await` over raw Promise chains.
- always wrap awaited boundary operations in `try`/`catch` and chain errors with `cause` when rethrowing.
- never leave floating Promises; always `await`, `return`, or attach explicit handling.

## Custom Events
- always use the native `Event` class directly for events without custom data.
- always extend the native `Event` class only when the event carries custom data.
- always add a `static readonly type` property for the event name string on extended event classes.
- always use `{ bubbles: true, composed: true }` for events that cross shadow DOM boundaries.
- always use `public readonly` constructor parameters for typed event data.