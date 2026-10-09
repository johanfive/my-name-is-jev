/**
 * A probability as the phrase a finding uses: `describeConfidence(0.82)` → "82% sure".
 * Shared so every judge words its confidence the same way.
 */
export const describeConfidence = (probability: number) => `${Math.round(probability * 100)}% sure`;
