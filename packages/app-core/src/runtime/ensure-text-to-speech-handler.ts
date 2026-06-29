/**
 * plugin-edge-tts and its app-core handler were removed upstream
 * (commit "chore(plugins): remove plugin-edge-tts and its app-core handler").
 *
 * No-op shim retained so server.ts's lazy `import(...)` resolves. Text-to-speech
 * support is disabled until a replacement handler is wired.
 */
export async function ensureTextToSpeechHandler(
  _runtime: unknown,
): Promise<void> {
  // intentionally no-op — text-to-speech support was removed.
}
