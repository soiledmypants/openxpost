/** Native SystemProgram.transfer to treasury from jsonParsed tx. */
export function extractNativeTransfers(tx, treasury) {
  const out = [];
  const top = tx?.transaction?.message?.instructions || [];
  const inner = [];
  for (const group of tx?.meta?.innerInstructions || []) {
    inner.push(...(group.instructions || []));
  }
  for (const ix of [...top, ...inner]) {
    if (ix.program !== "system") continue;
    if (ix.parsed?.type !== "transfer") continue;
    const info = ix.parsed.info || {};
    if (info.destination !== treasury) continue;
    out.push({
      source: info.source,
      destination: info.destination,
      lamports: Number(info.lamports),
    });
  }
  return out;
}
