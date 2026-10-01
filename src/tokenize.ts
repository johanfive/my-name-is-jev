/**
 * Split an identifier into lowercase words regardless of case style.
 *   userProfileCache          → user profile cache
 *   acme-prod-202609282037    → acme prod 202609282037
 *   MAX_RETRY_COUNT           → max retry count
 *   fetch-user-profile.test   → fetch user profile test
 *   HTMLParser                → html parser
 *   scratch-e2e               → scratch e2e
 */
export function tokenize(name: string): string[] {
  return name
    .replace(/^[_$]+/, "")
    .replace(/([a-z\d])([A-Z])/g, "$1 $2") // camelCase boundary
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2") // HTMLParser → HTML Parser
    // digits stay attached: e2e, utf8, oauth2, base64, sha1 are single words
    .split(/[\s\-_./]+/)
    .filter(Boolean)
    .map((s) => s.toLowerCase());
}
