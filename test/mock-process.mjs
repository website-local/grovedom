// These children execute fake CLI tools or a synthetic CI project, never the
// native addon. Preloading ASan into Node and their shebang interpreters can
// report host-runtime leaks and overflow captured output on intentional errors.
// Native DOM/lifecycle/worker tests must keep inheriting the sanitizer runtime.
export function mockProcessEnv(overrides) {
  const env = { ...process.env, ...overrides };
  delete env.LD_PRELOAD;
  // A synthetic test runner is independent of the surrounding node:test suite.
  delete env.NODE_TEST_CONTEXT;
  return env;
}
