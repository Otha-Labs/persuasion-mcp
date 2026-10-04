# Persuasion Taxonomy MCP

Most AI-written marketing copy fails for the same reason. The model answers every question the reader has with the most expected move, and the most expected move is exactly what readers have learned to skim past.

This server gives your AI a better model of the reader. Everyone who reads an ad, a page or an email is silently asking nine questions:

1. Why am I even reading this?
2. Is this written for me?
3. How bad is my problem, really?
4. Am I thinking about this correctly?
5. Can I trust the claim?
6. What does my life look like after?
7. What's stopping me from saying yes?
8. Why should I act right now?
9. Do I like and trust who's speaking?

Copy persuades when it answers the questions its goal needs, answers them truthfully, and the answers fit together. The server helps your AI plan copy around those questions, check a draft against them before anyone sees it, and reach past the obvious move for one of 766 persuasion techniques documented from real advertising. It also does the math behind A/B tests.

It's free and needs no API key. It makes no AI calls of its own, either: your model does the thinking, and the server only serves the catalog and runs plain code.

## Connect it

The hosted server lives at `https://taxonomy.coppica.com/mcp`. Any client that accepts a remote MCP server (Streamable HTTP) can use that URL as it is.

**Claude Code**

```bash
claude mcp add --transport http persuasion-taxonomy https://taxonomy.coppica.com/mcp
```

**Claude Code plugin.** This adds the server along with a short skill that tells Claude when to reach for it.

```
/plugin marketplace add Otha-Labs/persuasion-mcp
/plugin install persuasion-taxonomy@persuasion-taxonomy
```

**Claude, ChatGPT and other apps with custom connectors.** Add a custom connector and paste in the URL above. There's nothing to sign in to.

**Cursor** (`.cursor/mcp.json`)

```json
{ "mcpServers": { "persuasion-taxonomy": { "url": "https://taxonomy.coppica.com/mcp" } } }
```

**VS Code** (`.vscode/mcp.json`)

```json
{ "servers": { "persuasion-taxonomy": { "type": "http", "url": "https://taxonomy.coppica.com/mcp" } } }
```

**Run it on your own machine** (any client that launches local servers)

```json
{ "mcpServers": { "persuasion-taxonomy": { "command": "npx", "args": ["-y", "@coppica/persuasion-mcp"] } } }
```

## What your AI can do with it

You don't need to name the tools. Ask for what you want and a capable model reaches for the right one, and in testing it did so in all 16 realistic requests we tried, without being told the server existed.

| When someone asks... | The tool that answers |
|---|---|
| "Write me a landing page / ad / email / sales letter" | `plan_marketing_copy` plans it around the nine questions before a word is written |
| "Is this good?", "Roast this", "What's wrong with this copy?" | `diagnose_marketing_copy` shows which questions the copy answers, which it skips, and what reads as machine-written |
| "My ad gets clicks but no sales" | `explain_why_not_converting` works back from the symptom to the question going unanswered |
| "Give me other ways to build trust", "Make this less generic" | `find_persuasion_techniques` searches the catalog for a less expected move |
| "What is this technique called?", "How does it work?" | `get_persuasion_technique` returns the full entry, with real examples and when it backfires |
| "Which of these headlines is best?" | `check_headlines` says what each line is betting on and which two to test |
| "Is this claim believable?", "Is this button any good?" | `check_marketing_claims` catches vague superlatives, unproven promises and stock buttons |
| "How long should I run this test?" | `plan_ab_test` sizes the test and frames it so the result teaches you something |
| "Did my test win?" | `read_ab_test_result` reads the result and warns you when it might be lying |

It also offers four ready-made prompts (`/roast`, `/brief`, `/why-not-converting` and `/next-test`) and the nine questions as a resource you can read in full.

## What it keeps

Nothing you send it. Your copy, your brief and your test numbers are used to answer that one request and then dropped. The hosted server logs which tool was called and when, and like any website, its host keeps ordinary request logs for a short time. The full policy is at [taxonomy.coppica.com/privacy](https://taxonomy.coppica.com/privacy).

## Where the techniques come from

Every technique is an entry in [The Persuasion Taxonomy](https://taxonomy.coppica.com), a catalog of persuasion techniques documented from real ads, sales letters, emails and pages, with examples from the 1920s to now. The catalog is free under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). When your AI uses a technique, it names the technique and links to its page, so your reader can see the real examples behind the advice.

## Develop

```bash
npm install
npm run build
npm run smoke            # connects as a client over stdio and calls every tool
npm run smoke -- --http  # the same, over Streamable HTTP
npm run voice            # checks every model-facing string for machine tells
```

The catalog in `data/` is a snapshot. `npm run export-data` refreshes it, and it needs read access to Coppica's database, so outside contributors can work against the snapshot as it is.

The `src/http.ts` module exports `handleMcpRequest(request)`, which takes a web-standard `Request` and returns a `Response`. That makes it easy to host anywhere that speaks fetch: a Next.js route, a Vercel or Cloudflare function, or plain Node 18 and up.

## Voice

Every word the server shows a model reads the way a good direct-response writer would write it: plain words, full sentences that lead into each other, no em dashes, no shouted labels and no "it's not X, it's Y". That goes for the instructions, the tool descriptions, every line of output and every error message. A model picks up the voice of whatever it reads and passes it on to whoever it's writing for, so the tool has to model the writing it asks for. `src/voice.ts` turns the scorers' findings into plain sentences, and `npm run voice` keeps it honest.

## License

The code is [MIT](LICENSE). The catalog data in `data/` is [CC BY 4.0](data/LICENSE.md) and belongs to The Persuasion Taxonomy by Coppica.

## About

Built by [Coppica](https://coppica.com). This server knows how readers think. Coppica connects that same model of the reader to your live conversion data, so over time it learns which answers actually sell to your buyers.
