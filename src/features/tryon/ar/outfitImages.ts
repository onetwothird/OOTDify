// Which outfit cut-outs still need decoding. Pure, so useSkImages can be
// sure each image is decoded once however many times the outfit list grows.

/** The uris in `wanted` that aren't already loaded or loading, each once. */
export function urisToLoad(wanted: string[], started: ReadonlySet<string>): string[] {
  const out: string[] = [];
  for (const uri of wanted) if (!started.has(uri) && !out.includes(uri)) out.push(uri);
  return out;
}
