import assert from "node:assert/strict";
import { extractNativeTransfers } from "./extract.mjs";

const treasury = "Treasury111111111111111111111111111111111";
const payer = "Payer1111111111111111111111111111111111111";

const tx = {
  transaction: {
    message: {
      instructions: [
        {
          program: "system",
          parsed: {
            type: "transfer",
            info: {
              source: payer,
              destination: treasury,
              lamports: 12345,
            },
          },
        },
      ],
    },
  },
  meta: { err: null, innerInstructions: [] },
};

const got = extractNativeTransfers(tx, treasury);
assert.equal(got.length, 1);
assert.equal(got[0].lamports, 12345);
assert.equal(got[0].source, payer);
assert.equal(got[0].destination, treasury);

const inner = {
  transaction: { message: { instructions: [] } },
  meta: {
    innerInstructions: [
      {
        instructions: [
          {
            program: "system",
            parsed: {
              type: "transfer",
              info: {
                source: payer,
                destination: treasury,
                lamports: 99,
              },
            },
          },
        ],
      },
    ],
  },
};
assert.equal(extractNativeTransfers(inner, treasury)[0].lamports, 99);

const other = {
  transaction: {
    message: {
      instructions: [
        {
          program: "spl-token",
          parsed: {
            type: "transfer",
            info: { destination: treasury, lamports: 1 },
          },
        },
        {
          program: "system",
          parsed: {
            type: "createAccount",
            info: { destination: treasury, lamports: 1 },
          },
        },
        {
          program: "system",
          parsed: {
            type: "transfer",
            info: { source: payer, destination: "Other111", lamports: 99 },
          },
        },
      ],
    },
  },
  meta: { innerInstructions: [] },
};
assert.equal(extractNativeTransfers(other, treasury).length, 0);

console.log("extract.test.mjs ok");
