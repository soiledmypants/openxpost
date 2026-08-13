import { checkDraft, isDraftClean, MAX_CHARS } from "../src/lib/rules.ts";

type Expect = { text: string; ok: boolean; id?: string; message?: string };

const cases: Expect[] = [
  { text: "gm. shipping in public.", ok: true },
  { text: "$POST is the payment token.", ok: true },
  { text: "this is retarded", ok: true },
  { text: "that's ass", ok: true },
  { text: "fuck this", ok: true },
  { text: "bundle of notes", ok: true },

  { text: "nigger", ok: true },
  { text: "niggers", ok: true },
  { text: "nigga", ok: true },
  { text: "niggas", ok: true },
  { text: "tranny", ok: true },
  { text: "trannies", ok: true },
  { text: "faggot", ok: true },
  { text: "kike", ok: true },
  { text: "chink", ok: true },
  { text: "spic", ok: true },
  { text: "wetback", ok: true },
  { text: "that nigger is loud", ok: true },
  { text: "you a nigga", ok: true },
  { text: "nigger and $POST", ok: true },
  { text: "this is retarded nigger energy", ok: true },

  { text: "bundled", ok: true },
  { text: "bundler", ok: true },
  { text: "coin is bundled", ok: true },
  { text: "this coin is ass", ok: true },
  { text: "coin is ass", ok: true },
  { text: "dev is an idiot", ok: true },
  { text: "fuck the dev", ok: true },
  { text: "stupid developer", ok: true },
  { text: "buy $PEPE now", ok: true },
  { text: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", ok: true },
  { text: "send sol to my address", ok: true },
  { text: "see https://example.com", ok: true },
  { text: "https://x.com/OpenXPost and t.co/abc", ok: true },
  { text: "guaranteed 100x buy now", ok: true },
  { text: "CA: CniGxmdBgiPivEYyY3eLJYTLsU3agGXVY6T23wncpump buy $WIF", ok: true },

  { text: "", ok: false, id: "empty", message: "Write the post first." },
  { text: "   ", ok: false, id: "empty", message: "Write the post first." },
  { text: "x".repeat(MAX_CHARS), ok: true },
  { text: "x".repeat(MAX_CHARS + 1), ok: false, id: "length", message: `Keep it to ${MAX_CHARS} characters.` },
];

let failed = 0;
for (const item of cases) {
  const hits = checkDraft(item.text);
  const clean = isDraftClean(item.text);
  const ok = hits.length === 0;
  if (ok !== item.ok || clean !== item.ok) {
    console.error(`expected ok=${item.ok} for ${JSON.stringify(item.text)}, got`, hits);
    failed += 1;
    continue;
  }
  if (!item.ok) {
    const hit = hits.find((h) => (!item.id || h.id === item.id) && (!item.message || h.message === item.message));
    if (!hit) {
      console.error(`expected id=${item.id} message=${item.message} for ${JSON.stringify(item.text)}, got`, hits);
      failed += 1;
    }
  }
}

if (failed > 0) {
  console.error(`draft rules failed (${failed})`);
  process.exit(1);
}

console.log(`draft rules ok (${cases.length} cases)`);
