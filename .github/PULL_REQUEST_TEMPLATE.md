## Description

Briefly describe the purpose of this pull request and the changes made.

Fixes #(issue)

## Type of Change

- [ ] Bug fix (non-breaking change fixing an issue)
- [ ] New feature (non-breaking addition to functionality)
- [ ] Breaking change (fix or feature changing existing public API behavior)
- [ ] Documentation update
- [ ] Refactoring / Chore (no functional changes)

## Public API & Compatibility Impact

- Does this PR modify `src/index.ts` or exported types? (Yes/No)
- If yes, describe the changes and ensure `tests/index.test.ts` is updated.

## Checklist

- [ ] My code conforms to repository code style and passes linting (`pnpm lint`)
- [ ] Formatting is verified (`pnpm format:check`)
- [ ] Type check passes cleanly (`pnpm typecheck`)
- [ ] All unit and integration tests pass (`pnpm test`)
- [ ] Full library build succeeds (`pnpm build`)
- [ ] Package smoke verification passes (`pnpm test:package`)
- [ ] Backend tests and linters pass (if backend code changed)
- [ ] Documentation has been updated accordingly
- [ ] New or existing behavior is properly tested
