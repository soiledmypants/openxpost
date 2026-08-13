import {
  createBurnCheckedInstruction,
  createCloseAccountInstruction,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import { sendAndConfirmTransaction, Transaction } from "@solana/web3.js";
import { amountRaw as RAW, DECIMALS } from "./mint.mjs";

/**
 * BurnChecked then CloseAccount on the invoice ATA.
 * Does not transfer tokens to any burner address.
 */
export async function burnAndClose({
  connection,
  ata,
  mint,
  owner,
  feePayer,
  programId = TOKEN_2022_PROGRAM_ID,
  amount = RAW,
  decimals = DECIMALS,
}) {
  const burnIx = createBurnCheckedInstruction(
    ata,
    mint,
    owner.publicKey,
    amount,
    decimals,
    [],
    programId
  );
  const closeIx = createCloseAccountInstruction(
    ata,
    feePayer.publicKey,
    owner.publicKey,
    [],
    programId
  );
  const tx = new Transaction().add(burnIx, closeIx);
  return sendAndConfirmTransaction(connection, tx, [feePayer, owner], {
    commitment: "finalized",
  });
}
