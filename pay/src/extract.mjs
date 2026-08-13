function instructionsOf(tx) {
  const top = tx?.transaction?.message?.instructions || [];
  const inner = [];
  for (const group of tx?.meta?.innerInstructions || []) {
    inner.push(...(group.instructions || []));
  }
  return [...top, ...inner];
}

function inflowAmount(info, type) {
  if (type === "transferChecked") {
    return String(info.tokenAmount?.amount ?? info.amount ?? "");
  }
  return String(info.amount ?? "");
}

/** Token-2022 / SPL transfer or transferChecked into ata for exact amountRaw. */
export function tokenInflows(tx, ata, amountRaw) {
  const want = String(amountRaw);
  const out = [];
  for (const ix of instructionsOf(tx)) {
    const program = ix.program;
    const programId = ix.programId;
    const isToken =
      program === "spl-token" ||
      program === "spl-token-2022" ||
      programId === "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb" ||
      programId === "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
    if (!isToken) continue;
    const type = ix.parsed?.type;
    if (type !== "transfer" && type !== "transferChecked") continue;
    const info = ix.parsed.info || {};
    if (info.destination !== ata) continue;
    const amount = inflowAmount(info, type);
    if (amount !== want) continue;
    out.push({
      source: info.source,
      destination: info.destination,
      authority: info.authority,
      mint: info.mint,
      amount,
      type,
    });
  }
  return out;
}
