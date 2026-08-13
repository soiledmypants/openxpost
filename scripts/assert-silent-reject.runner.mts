import { silentReject } from "../server/reject.ts";
import { isDraftClean } from "../src/lib/rules.ts";

type Expect = { text: string; reject: boolean };

const cases: Expect[] = [
  { text: "gm. shipping in public.", reject: false },
  { text: "see https://example.com buy $PEPE", reject: false },
  { text: "this coin is ass fuck the dev", reject: false },
  { text: "nigger", reject: false },
  { text: "kids love this coin", reject: false },
  { text: "child of the trenches", reject: false },

  { text: "csam", reject: true },
  { text: "child porn", reject: true },
  { text: "underage porn", reject: true },
  { text: "sexual exploitation of a child", reject: true },
  { text: "loli", reject: true },
  { text: "pedo", reject: true },
  { text: "this kid porn dump", reject: true },
  { text: "12 year old nudes", reject: true },
];

let failed = 0;
for (const item of cases) {
  const got = silentReject(item.text);
  if (got !== item.reject) {
    console.error(`expected reject=${item.reject} for ${JSON.stringify(item.text)}, got ${got}`);
    failed += 1;
  }
  if (item.reject && !isDraftClean(item.text)) {
    console.error(`draft check must stay silent for ${JSON.stringify(item.text)}`);
    failed += 1;
  }
}

if (failed > 0) {
  console.error(`silent reject failed (${failed})`);
  process.exit(1);
}

console.log(`silent reject ok (${cases.length} cases)`);
