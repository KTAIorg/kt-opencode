# Test262 Promise Coverage

The Promise tests adapt Test262 at revision `250f204f23a9249ff204be2baec29600faae7b75`. The upstream Promise tree
contains 729 files; 459 are under the eight API directories corresponding to CodeMode's five Promise statics and three
chaining methods. The executable suite currently cites 39 distinct Promise, Array, and async-function sources.

This is coverage of CodeMode's confined Promise surface, not a claim of ECMAScript or Test262 conformance. One upstream
file may contain both adapted and inapplicable assertions, so a cited source means only that the represented assertions
were adapted. `LICENSE.test262` contains the upstream BSD terms.

## Covered Surface

- `Promise.all`, `Promise.allSettled`, and `Promise.race` result types, ordering, sparse positions, mixed values, and
  rejection propagation.
- `Promise.resolve` value adoption and promise identity.
- `Promise.reject` reason preservation.
- Async-function promise creation, returned-value adoption, and throws before and after `await`.

The Promise PR's handwritten tests remain authoritative for tool-call concurrency, execution-scoped lifetime,
cancellation, output boundaries, model-safe tool failures, unhandled-rejection diagnostics, and chaining behavior.

## Exclusions

- `new Promise`, externally captured resolving functions, and executor semantics.
- Promise subclasses, constructors, species, realms, proxies, property descriptors, and function metadata.
- Custom thenables, poisoned `then` accessors, and arbitrary iterable or iterator-closing behavior.
- `Promise.any`, `Promise.try`, `Promise.withResolvers`, `Promise.allKeyed`, and `Promise.allSettledKeyed`.
- Exact native microtask behavior for `.then`, `.catch`, and `.finally`; those are exercised separately by the Promise
  PR's chaining tests and audit.
- Exact native unhandled-rejection timing. CodeMode drains execution-owned work and reports safe diagnostics at its
  execution boundary.

## Observed Differences

- Promise combinators accept arrays plus CodeMode's supported spreadable collections. The model guidance currently
  describes arrays, so this remains a contract decision rather than conformance coverage.
- `Promise.race([])` returns an actionable error instead of a permanently pending promise, which cannot usefully finish
  a bounded CodeMode execution.
- Promise identity is preserved, but CodeMode intentionally rejects general binary operators over Promise references;
  identity is tested through `Map` keys instead of `===`.
