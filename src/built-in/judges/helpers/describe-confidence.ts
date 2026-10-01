/** A probability as the phrase a finding uses: `describeConfidence(0.82)` → "82% sure". */
export const describeConfidence = (p: number) => `${Math.round(p * 100)}% sure`;
