const NEGATION_OR_CANCELLATION = /\b(?:don['’]?t|do not|not|never|cancel|stop|no)\b/i;

export function shouldConsultLocalClassifier(
  deterministicIntent: string,
  text: string,
  isSupportedSpanish: boolean,
): boolean {
  return deterministicIntent === "general" &&
    !NEGATION_OR_CANCELLATION.test(text) &&
    !isSupportedSpanish;
}
