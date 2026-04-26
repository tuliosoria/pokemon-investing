/**
 * Encode/decode helpers for `/sealed-forecast/[slug]` URLs.
 *
 * Some product ids (notably `dynamic-local-sealed:<setId>`) contain
 * colons, which Amplify Hosting's CloudFront layer rejects with a
 * generic 404 before the request ever reaches the Next.js Lambda.
 *
 * We swap `:` for `--colon--` (an unambiguous, URL-safe sentinel) in
 * URLs and decode it back inside the route handler.
 */
const COLON_SENTINEL = "--colon--";

export function encodeSealedSlug(id: string): string {
  return id.includes(":") ? id.split(":").join(COLON_SENTINEL) : id;
}

export function decodeSealedSlug(slug: string): string {
  return slug.includes(COLON_SENTINEL)
    ? slug.split(COLON_SENTINEL).join(":")
    : slug;
}
