import assert from "node:assert/strict";
import { tokenInflows } from "./extract.mjs";

const ata = "Ata1111111111111111111111111111111111111111";
const amountRaw = 100000000000;

const transferChecked = {
  transaction: {
    message: {
      instructions: [
        {
          program: "spl-token",
          programId: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
          parsed: {
            type: "transferChecked",
            info: {
              authority: "Payer1111111111111111111111111111111111111",
              source: "SrcAta11111111111111111111111111111111111",
              destination: ata,
              mint: "CniGxmdBgiPivEYyY3eLJYTLsU3agGXVY6T23wncpump",
              tokenAmount: {
                amount: "100000000000",
                decimals: 6,
                uiAmount: 100000,
                uiAmountString: "100000",
              },
            },
          },
        },
      ],
    },
  },
  meta: { err: null, innerInstructions: [] },
};

const got = tokenInflows(transferChecked, ata, amountRaw);
assert.equal(got.length, 1);
assert.equal(got[0].amount, "100000000000");
assert.equal(got[0].destination, ata);
assert.equal(got[0].authority, "Payer1111111111111111111111111111111111111");
assert.equal(got[0].type, "transferChecked");

const transfer = {
  transaction: { message: { instructions: [] } },
  meta: {
    innerInstructions: [
      {
        instructions: [
          {
            program: "spl-token",
            parsed: {
              type: "transfer",
              info: {
                authority: "Payer1111111111111111111111111111111111111",
                source: "SrcAta11111111111111111111111111111111111",
                destination: ata,
                amount: "100000000000",
              },
            },
          },
        ],
      },
    ],
  },
};
assert.equal(tokenInflows(transfer, ata, amountRaw).length, 1);

const wrongAmt = {
  transaction: {
    message: {
      instructions: [
        {
          program: "spl-token",
          parsed: {
            type: "transferChecked",
            info: {
              destination: ata,
              tokenAmount: { amount: "1", decimals: 6 },
            },
          },
        },
      ],
    },
  },
  meta: { innerInstructions: [] },
};
assert.equal(tokenInflows(wrongAmt, ata, amountRaw).length, 0);

const otherDest = {
  transaction: {
    message: {
      instructions: [
        {
          program: "spl-token",
          parsed: {
            type: "transfer",
            info: { destination: "OtherAta", amount: "100000000000" },
          },
        },
      ],
    },
  },
  meta: { innerInstructions: [] },
};
assert.equal(tokenInflows(otherDest, ata, amountRaw).length, 0);

const native = {
  transaction: {
    message: {
      instructions: [
        {
          program: "system",
          parsed: {
            type: "transfer",
            info: { destination: ata, lamports: 100000000000 },
          },
        },
      ],
    },
  },
  meta: { innerInstructions: [] },
};
assert.equal(tokenInflows(native, ata, amountRaw).length, 0);

console.log("extract.test.mjs ok");
