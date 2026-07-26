---
trigger: glob
globs: **/*.{ts,tsx,js,jsx,mts,cts,mjs,cjs}
---

# JavaScript / TypeScript Coding Standards Part I

## General Principles
- always aim for the most simple and elegant code that satisfies all requirements, preserves readability and aligns with existing project patterns.
- avoid premature abstraction and over-engineering and introduce complexity only when justified by clear reuse or constraints.
- always use ES Modules
- always use modern ES language features and syntax where they improve readability and safety, e.g. destructuring, optional chaining, nullish coalescing.
- never generate duplicated logic unless extraction would create much more complexity than clarity.
- always respect and ensure strict typing.
- always respect and ensure strict null safety.
- never abbreviate variable, function or parameter names.
- never use `@ts-ignore`.
- never change public-facing component APIs, exported types, or method signatures unless explicitly requested.

## Type Design
- prefer type aliases over interfaces.
- never use TypeScript enums. Always use `as const` arrays with derived union types, e.g. `typeof values[number]`.
- never redefine existing types without reason.
- always derive types from canonical sources when possible, e.g. via `Pick`, `Omit`, mapped types, indexed access types.
- always create a new named type when it expresses a distinct domain concept better than utility composition alone.
- never abbreviate generic type parameter names, e.g. prefer `Type` over `T`.
- never maintain parallel or duplicate type hierarchies.

## Type Safety
- never use `any`.
- never use `as any`, `as unknown`, or `as never`.
- never use the non-null assertion operator (`!`) unless unavoidable after exhaustive runtime checks.
- never use type assertions (`as Type`) unless the value crosses a trust boundary (deserialization, DOM APIs, third-party interop) and no type guard, concrete generic type, or `satisfies` expression can replace it.
- always prefer custom type guards or assertion functions over broad assertions, e.g. `isClient(value)` instead of `value as Client`.
- always add explicit return types to exported functions and class methods.
- always add explicit return types to local functions with more than one statement. Single-expression callbacks may use inferred return types.
- always mark class and object members as `readonly` when they are not reassigned after initialization.
- always prefer `satisfies` over assertions for value-to-type conformance, e.g. `const config = {...} satisfies Config`.
- always use `as const` on array and object literals to preserve exact literal types, enable safe union derivation, and keep values readonly.
- use `as const satisfies Type` when `as const` alone is not sufficient and additional structural type validation is required.

## Runtime Safety
- always prefer ES private elements for real runtime privacy over TypeScript visibility modifiers, e.g. `#computeState()` instead of `private computeState()`, unless experimental decorators are required for framework integration or when targeting legacy environments without support for private elements.
- never inject untrusted HTML strings into the DOM (e.g. `innerHTML`, `outerHTML`, `insertAdjacentHTML`); only use trusted static templates or explicitly sanitized content.
- when a parameter union includes a concrete type plus `null` or `undefined`, prefer positive runtime type guards (e.g. `typeof value === 'string'`, `value instanceof URL`) over negated nullish equality checks (`value !== undefined`, `value !== null`) so unexpected runtime types are rejected safely:
    ```ts
    // ❌ Bad: nullish inequality allows unexpected runtime types to pass the guard
    set url(value: string | undefined | null) {
      let url = value;
      if (value !== undefined && value !== null) {
        try {
            new URL(value);
        } catch {
            console.warn('...');
            url = undefined;
        }
      }
      this.#url = url;
    }

    // ✅ Good: positive type guard only accepts the intended runtime type
    set url(value: string | undefined | null) {
      let url = value;
      if (typeof value === 'string') {
        try {
            new URL(value);
        } catch {
            console.warn('...');
            url = undefined;
        }
      }
      this.#url = url;
    }
    ```

## Nullability
- always use nullish coalescing (`??`) when providing default values for potentially `null` or `undefined` values.
- always use optional chaining (`?.`) when accessing properties or methods on potentially `null` or `undefined` values.
- always model nullability explicitly and handle `null` and `undefined` intentionally.
- always use `prop?: T` when absence is the semantic meaning, e.g. optional query filters.
- always use `prop: T | undefined` when the property must exist but may be unset, e.g. normalized DTO fields.
- always use `null` only when it has an explicit semantic meaning distinct from `undefined` or to align with external APIs, e.g. DOM APIs.
