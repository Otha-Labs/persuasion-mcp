# Directory submissions, November 2026

This is the pack for listing the hosted server, `https://taxonomy.coppica.com/mcp`, in two directories: ChatGPT's plugin directory first, then Claude's Connectors Directory. It gives every form field and the exact answer, where to submit, the reviewer test cases with what the server really returned, and the steps only the owner can take.

Everything here was checked on 2026-11-10 against the official docs linked in each section. Nothing has been submitted yet.

## Do these first

Both directories scan the live server, so submit only after version 1.0.4 is live at `taxonomy.coppica.com/mcp`. Production runs 1.0.3 today. Its tools have `readOnlyHint` and `openWorldHint` but no `destructiveHint`, and OpenAI requires all three as explicit booleans on every tool.

1. Merge the persuasion-mcp pull request that carries this file. It sets explicit annotations on all nine tools, refreshes the data to 767 techniques and bumps the version to 1.0.4.
2. Publish 1.0.4 to npm from `main` with `npm publish`. `prepublishOnly` runs the build, both smoke tests and the voice check first.
3. Publish 1.0.4 to the MCP Registry with `mcp-publisher publish`, using the same login as 1.0.3. The registry shows 1.0.3 as the latest version today.
4. In persuasion-taxonomy, bump `@coppica/persuasion-mcp` to `^1.0.4` (package.json and package-lock.json), merge, and let Vercel deploy production.
5. Check production. `tools/list` should show `destructiveHint: false` on all nine tools, and `initialize` should report version 1.0.4.

Two changes in persuasion-taxonomy are already live: the support page at `/support` and the OpenAI domain-check route (taxonomy #118), and the rate limit that no longer counts all Claude or ChatGPT users behind one shared address as a single caller (taxonomy #116). The privacy wording in taxonomy #117 is a draft that waits on the owner.

## 1. ChatGPT (OpenAI plugin directory)

Docs: [Upload and submit your plugin](https://developers.openai.com/plugins/deploy/submission), [Plugin guidelines](https://developers.openai.com/plugins/plugin-guidelines), [Submission errors](https://developers.openai.com/plugins/deploy/submission-errors).

### Who can submit

- An organization owner, or a member with **Apps Management Write**.
- The organization needs individual or business verification in [organization settings](https://platform.openai.com/settings/organization/general) to publish under the name Coppica LLC. The directory shows the name tied to the verified identity.

### Build the ZIP

The package is in `openai-plugin/`: `plugin.json`, `mcp.json` and `assets/logo.png` (512 by 512 PNG). From the repo root:

```bash
cd openai-plugin && zip -r ../persuasion-taxonomy-openai.zip plugin.json mcp.json assets
```

`plugin.json` must sit at the root of the ZIP, which this command does.

### Upload

1. Open [platform.openai.com/plugins](https://platform.openai.com/plugins) and choose **Upload new or existing plugin**.
2. Choose the verified **Developer identity**.
3. Choose **Upload plugin** and pick the ZIP.
4. Wait for the checks under **Metadata & Skills**. Fix any issue in `openai-plugin/` and upload again.

### What the package fills in

Every listing and review field comes from `plugin.json`, so the dashboard shows these as managed by the ZIP. To change one, edit the file and upload again.

| Field | Value |
|---|---|
| `name` | `persuasion-taxonomy` |
| `version` | `1.0.0` (the plugin package version, separate from the server's 1.0.4) |
| `description` | Plan and check marketing copy against the nine questions every reader asks, using 767 persuasion techniques documented from real advertising. |
| `author` | Coppica LLC, support@coppica.com, https://coppica.com |
| `homepage` | https://taxonomy.coppica.com |
| `repository` | https://github.com/Otha-Labs/persuasion-mcp |
| `license` | MIT AND CC-BY-4.0 |
| `interface.displayName` | Persuasion Taxonomy (19 of 30 characters) |
| `interface.shortDescription` | Plan and check marketing copy (29 of 30) |
| `interface.longDescription` | See below (1,773 of 4,000) |
| `interface.developerName` | Coppica LLC |
| `interface.category` | Business & Operations |
| `interface.capabilities` | Plan marketing copy; Review and roast copy; Check headlines and subject lines; Check claims and calls to action; Diagnose low conversion; Search persuasion techniques; Look up a technique; Plan an A/B test; Read an A/B test result |
| `interface.websiteURL` | https://taxonomy.coppica.com |
| `interface.supportURL` | https://taxonomy.coppica.com/support |
| `interface.privacyPolicyURL` | https://taxonomy.coppica.com/privacy |
| `interface.termsOfServiceURL` | https://taxonomy.coppica.com/use-policy |
| `interface.defaultPrompt` | The three starter prompts in [Reviewer material](#3-reviewer-material) |
| `interface.brandColor` / `brandColorDark` | #B8811D / #E8A225 |
| `interface.logo` / `composerIcon` | ./assets/logo.png |
| `review.test_cases` | The five positive and three negative cases in [Reviewer material](#3-reviewer-material) |
| `review.commerce` | false, "This plugin does not sell products or process payments." |
| `publication.release_notes` | First release: nine read-only tools to plan and check marketing copy, search persuasion techniques documented from real advertising, and size and read A/B tests. No sign-in. |

The category is one of the names OpenAI accepts: Productivity, Creativity, Developer Tools, Business & Operations, Data & Analytics, Communication, Education & Research, Security, Finance, Healthcare, Travel, Entertainment or Other. Business & Operations is the closest fit. There is no marketing category.

The terms URL is `/use-policy` because `taxonomy.coppica.com/terms` returns 404. Whether `/use-policy` counts as the terms of service is the owner's call.

The long description, as uploaded:

```text
Persuasion Taxonomy helps you plan, write and check marketing copy: ads, landing pages, sales pages, emails, subject lines, headlines, social posts and video scripts.

It is built on one idea. Everyone who reads an ad, a page or an email is silently asking nine questions, from "Why am I even reading this?" to "Why should I act right now?" Copy persuades when it answers the questions its goal needs, truthfully, and the answers fit together.

What it can do:
- Plan a piece before you write it: which of the nine questions it has to answer for this reader, and a few ways to answer each, one established and the rest less expected.
- Review a draft line by line: which questions it answers, which it skips, the biggest gap, and the words that read as machine-written.
- Check headlines, hooks and subject lines, and compare options against each other.
- Check claims and buttons for vague superlatives and promises with no proof behind them.
- Work out why an ad, a page or an email isn't converting, starting with the problems copy can't fix.
- Search a catalog of 767 named persuasion techniques documented from real advertising. Each comes with a definition, a real example and a link to its page on taxonomy.coppica.com.
- Size an A/B test and read its result, with warnings about what makes a result unreliable.

Who it's for: founders, marketers, copywriters and anyone who writes to sell.

Limits: it plans and checks, and ChatGPT does the writing. It never posts, sends or changes anything. It can't predict which version will win; only a test can tell you that. Many examples quote advertising from past decades. It needs no account. Nothing you send it is stored. The server logs only which tool was called, and its host keeps ordinary request logs for one day.
```

The last sentence matches the wording proposed in taxonomy #117. If the owner changes that wording, change this sentence to match before uploading. "One day" is the log retention on the current Vercel plan. It would become false if Observability Plus were turned on, which keeps logs for 30 days.

Left out on purpose:

- `publication.countries`. Leaving it out keeps whatever targeting the dashboard has. Pick countries in the dashboard, or add a list of country codes and upload again. The docs don't say what a new plugin defaults to.
- `review.demo_recording_url`. The owner has to record the video (see [Review details](#review-details)).
- `publication.translations`.

### Connect the server

1. Open **MCPs**, select `persuasion-taxonomy` and choose **Connect**.
2. **MCP Server URL**: `https://taxonomy.coppica.com/mcp`.
3. **Authentication**: No authentication.
4. **Domain verification**: the portal shows a token. In the Vercel project for taxonomy.coppica.com, set `OPENAI_APPS_CHALLENGE` for Production to exactly that token, with no trailing newline, then redeploy. The route trims the value, but a stray newline in a Vercel environment value has crashed Node functions on Coppica's projects before. Check that `https://taxonomy.coppica.com/.well-known/openai-apps-challenge` returns only the token as plain text. Today it returns 404 "Not found", which is expected until the variable is set.
5. Wait for the tool scan, then read **Issues**.

About `mcp.json`: it declares `extensions["com.openai"].auth.type: "none"`, as OpenAI's [MCP authentication docs](https://developers.openai.com/plugins/build/plugins#configure-mcp-authentication) describe. The public schema at agent-plugins.org rejects an `extensions` key on a server ("must NOT have additional properties"), and OpenAI's own example `mcp.json` leaves auth out. If the upload rejects `mcp.json`, delete the `extensions` block, upload again and choose No authentication in the connect form.

### Annotation justifications

The submission-errors page asks for a justification for each hint on every tool. The plugin guidelines say justifications are no longer required. If the portal asks, use these.

Every tool has `readOnlyHint: true`, `destructiveHint: false`, `openWorldHint: false` and `idempotentHint: true`. The reasons are the same for all nine:

- **readOnlyHint true**: it reads the catalog bundled with the server or does arithmetic, and returns text. It writes nothing and stores nothing.
- **destructiveHint false**: it can't create, change, send or delete anything.
- **openWorldHint false**: it works only on the bundled catalog of 767 techniques and the numbers it is given. It doesn't reach the web, another service or anyone's account.

What each tool reads:

| Tool | What it does |
|---|---|
| `plan_marketing_copy` | Builds a plan from the bundled catalog |
| `diagnose_marketing_copy` | Scores the copy it is given with plain code and suggests catalog techniques |
| `explain_why_not_converting` | Maps a symptom to likely causes with fixed rules and the catalog |
| `find_persuasion_techniques` | Searches the bundled catalog |
| `get_persuasion_technique` | Returns one entry from the bundled catalog |
| `check_headlines` | Checks lines with plain code and bundled headline-test figures |
| `check_marketing_claims` | Checks claims and buttons with plain code |
| `plan_ab_test` | Sample-size arithmetic on the numbers given |
| `read_ab_test_result` | Significance arithmetic on the numbers given |

### Review details

Under **Metadata & Skills**, open **Review information**, then **Review details**.

- **Test cases**: imported from the ZIP. Five positive, three negative.
- **Reviewer credentials**: none. The server has no sign-in.
- **Demo recording URL** (required for review): the owner records a walkthrough in ChatGPT that runs the five positive cases, uploads it somewhere a reviewer can open without signing in, and adds `"demo_recording_url"` under `review` in `plugin.json`, or enters it in the dashboard.
- **Release notes**: imported from the ZIP.

### Submit and publish

1. Select the draft, choose **Submit for review** and complete the policy attestations.
2. Track it under **Review status**. Feedback comes by email.
3. After approval, open the approved version and choose **Publish plugin**. Publishing is a separate click.
4. Before any press release or public announcement, OpenAI asks you to email press@openai.com ([App review FAQ](https://developers.openai.com/plugins/deploy/app-review)).

After publication, OpenAI rescans the server daily, so later server releases need no new ZIP. Changes to the listing text or the logo do.

## 2. Claude (Connectors Directory)

Docs: [Submit a connector](https://claude.com/docs/connectors/building/submission), [Connector review criteria](https://claude.com/docs/connectors/building/review-criteria), [Test your connector](https://claude.com/docs/connectors/building/testing).

### Who can submit

Anyone on a paid Claude plan. Before submitting, add the server as a custom connector at [Customize > Connectors](https://claude.ai/customize/connectors) and run every tool from a chat. The **Test & launch** step asks you to confirm you did.

Portal: [claude.ai/directory/manage](https://claude.ai/directory/manage), then **Submit new**, then **MCP connector**.

### Step 1. Connection

- URL: `https://taxonomy.coppica.com/mcp`
- Leave **Users connect to different URLs** unselected. Every user uses the same URL.

### Step 2. Tools

The nine tools, the four prompts (`roast`, `brief`, `why-not-converting`, `next-test`) and the two resources (`persuasion://nine-questions`, `persuasion://about`) sync from the server. With 1.0.4 live, all nine tools have a `title` and `readOnlyHint: true`, so they should all sort under read-only with nothing flagged.

### Step 3. Listing

| Field | Answer |
|---|---|
| Server name (up to 100) | Persuasion Taxonomy |
| One-liner (up to 200) | Plan and check marketing copy against the nine questions every reader asks, using 767 persuasion techniques documented from real advertising. (141 characters) |
| Description (up to 2,000) | The block below (1,772 characters) |
| Categories (1 to 5) | Sales & marketing. Add Creative if you want a second one. The names come from the filters on claude.com/connectors on 2026-11-10; the portal's list is the one that counts. |
| Documentation URL | https://github.com/Otha-Labs/persuasion-mcp#readme |
| Privacy policy URL | https://taxonomy.coppica.com/privacy |
| Support contact | support@coppica.com (the page is https://taxonomy.coppica.com/support) |
| Icon | `assets/coppica-logo-512.png` in this repo (512 by 512 PNG). The docs give no icon size or format. |
| URL slug | `persuasion-taxonomy`. The slug can't be changed after publishing. |

Description:

```text
Persuasion Taxonomy helps you plan, write and check marketing copy: ads, landing pages, sales pages, emails, subject lines, headlines, social posts and video scripts.

It is built on one idea. Everyone who reads an ad, a page or an email is silently asking nine questions, from "Why am I even reading this?" to "Why should I act right now?" Copy persuades when it answers the questions its goal needs, truthfully, and the answers fit together.

What it can do:
- Plan a piece before you write it: which of the nine questions it has to answer for this reader, and a few ways to answer each, one established and the rest less expected.
- Review a draft line by line: which questions it answers, which it skips, the biggest gap, and the words that read as machine-written.
- Check headlines, hooks and subject lines, and compare options against each other.
- Check claims and buttons for vague superlatives and promises with no proof behind them.
- Work out why an ad, a page or an email isn't converting, starting with the problems copy can't fix.
- Search a catalog of 767 named persuasion techniques documented from real advertising. Each comes with a definition, a real example and a link to its page on taxonomy.coppica.com.
- Size an A/B test and read its result, with warnings about what makes a result unreliable.

Who it's for: founders, marketers, copywriters and anyone who writes to sell.

Limits: it plans and checks, and Claude does the writing. It never posts, sends or changes anything. It can't predict which version will win; only a test can tell you that. Many examples quote advertising from past decades. It needs no account. Nothing you send it is stored. The server logs only which tool was called, and its host keeps ordinary request logs for one day.
```

The same note applies as for ChatGPT: the last sentence follows taxonomy #117.

### Step 4. Use cases

- **Primary use cases**: plan marketing copy before writing it; review or roast a draft; check and compare headlines, hooks and email subject lines; check claims and buttons; work out why an ad, a page or a funnel isn't converting; look up persuasion techniques with real examples; size an A/B test and read its result.
- **What users need first**: nothing. No account, no sign-in and no plan on our side.
- **Reads or writes**: reads only. All nine tools are read-only.

### Step 5. Company

- Company name: Coppica LLC
- Website: https://coppica.com
- Primary contact for review updates: the owner's choice.

### Step 6. Authentication

- **Authentication requirement**: users don't sign in. Choose the option for no authentication, not **Required when the server asks**.
- **Authentication methods**: none.

### Step 7. Data handling

- **Whose API**: our own. The server and the catalog are Coppica's, served from taxonomy.coppica.com, the same site as the catalog's public pages.
- **Personal health data**: no.
- **Sponsored content**: no. Every result ends with the CC BY 4.0 credit line and a link to taxonomy.coppica.com. There are no ads or paid placements.

### Step 8. Test & launch

Reviewer access, as entered:

```text
No account or credentials are needed. In Claude, open Customize > Connectors, add a custom connector with the URL https://taxonomy.coppica.com/mcp and leave the authentication fields empty. Then try these prompts. Together they run all nine tools.

1. Plan the landing page copy for my dog-walking service in Austin before you write it. It's $25 for a 30-minute GPS-tracked walk with a photo update after every walk, for people who work long office days. (plan_marketing_copy)
2. Roast my landing page hero. Headline: Empowering teams to do their best work. Subheadline: Flowly is the all-in-one platform that streamlines collaboration, boosts productivity, and drives results. Button: Get Started (diagnose_marketing_copy)
3. Which of these subject lines should I send for our Black Friday sale on hiking boots? A) Black Friday Sale: 40% Off Everything B) Your boots are on sale (finally) C) Don't miss our biggest sale of the year! (check_headlines)
4. We get plenty of trial signups but few become paying customers. It's $49 a month project management software for small architecture firms, with a 14-day trial. Why, and what should we change? (explain_why_not_converting)
5. What are some ways to handle a price objection? Pick the best fit and explain it in detail. (find_persuasion_techniques, then get_persuasion_technique)
6. Are these believable? "The #1 project tool for creative agencies", "See results in days", and a button that says "Learn more". (check_marketing_claims)
7. My page converts at 2.1% and gets 600 visitors a day. How long would a test need to run to catch a 20% lift? (plan_ab_test)
8. Version A got 97 sales from 4,210 visitors and version B got 121 from 4,180. Did B win? (read_ab_test_result)
```

Prompts 6 to 8 were run as direct tool calls with the arguments in [Reviewer material](#the-rest-of-the-nine-tools), not through Claude.

Then confirm you ran every tool yourself, as a custom connector in Claude or with the MCP Inspector. From the Inspector docs:

```bash
npx @modelcontextprotocol/inspector --cli https://taxonomy.coppica.com/mcp --transport http --method tools/list
```

Change `--method` to `tools/call` and add `--tool-name` and `--tool-arg` to call one tool. These Inspector commands were not run for this pack.

### Step 9. Compliance

All seven acknowledgments are required, and only the owner can make them. The facts behind each:

1. **Directory guidelines**: with 1.0.4 live, every tool has a title and a read-only hint, the server needs no sign-in because it serves public data, and the privacy policy and documentation are public.
2. **First-party API usage**: the tools call no outside API. The server makes no AI calls of its own.
3. **Financial transactions**: none. Nothing moves money.
4. **AI media generation**: none. The server makes no images, video or audio.
5. **Prompt injection**: tool descriptions say what each tool does. A few lines also tell the model when to call it; see [Wording a reviewer may flag](#5-wording-a-reviewer-may-flag).
6. **Conversation data collection**: each tool gets only the arguments the model sends it, such as the copy, the brief or the test numbers. The server uses them for that one request and keeps none of them.
7. **Public documentation**: the README at https://github.com/Otha-Labs/persuasion-mcp.

### Step 10. Review and submit

Read the quality warnings on the final screen and submit. New listings start as Community connectors. Escalations go to mcp-review@anthropic.com.

## 3. Reviewer material

### Starter prompts

Up to three, 128 characters at most, no @mentions. These are `interface.defaultPrompt` in `plugin.json`.

1. Help me plan a landing page for my product before I write it. (61 characters)
2. Roast my ad copy and tell me what it's missing. (47)
3. My trial signups rarely turn into paying customers. What should I change? (73)

### How the cases were run

Each case was run as a direct `tools/call` over Streamable HTTP, with the arguments a model would send for that prompt, against two live servers:

- version 1.0.4 on a Vercel preview of taxonomy.coppica.com (persuasion-taxonomy commit `26e134e`, branch `proof/tax-10-mcp-1.0.4-preview`, which installs the packed 1.0.4 tarball and is not for merging);
- production at `https://taxonomy.coppica.com/mcp`, which runs 1.0.3.

The outputs below are the 1.0.4 preview's. Production returned the same first line and the same length for every case, except case 1 (13,187 characters on production against 13,230 on 1.0.4, because the data refresh changed some entries). Every call returned HTTP 200. Every positive call returned a result with no `isError`.

The prompts were not run through ChatGPT or Claude, so which tools a model picks is expected behavior, not tested behavior.

### Positive cases

#### Case 1. Plan a landing page before writing it

- **description**: Plan a landing page before writing it
- **prompt**: Plan the landing page copy for my dog-walking service in Austin before you write it. It's $25 for a 30-minute GPS-tracked walk with a photo update after every walk, for people who work long office days.
- **tools_triggered**: plan_marketing_copy
- **expected_behavior**: Returns a plan for a landing page that has to make the sale: the nine reader questions in order, which ones deserve the most words for this reader, and three or four named techniques for each, every one with a PT-ID and a link to taxonomy.coppica.com. ChatGPT may then write a draft and check it with diagnose_marketing_copy.
- **arguments used**: `goal: "purchase"`, `format: "landing_page"`, `audience: "People in Austin who own a dog and work long office days"`, `offer: "A 30-minute GPS-tracked dog walk for $25, with a photo update after every walk"`
- **real output**: 13,230 characters. It opens with `# Copy plan: a landing page that has to make the sale`, then one section for each of the nine questions, each with four techniques: 36 techniques in all, none repeated, each with its PT-ID and a link. It marks three questions as priorities for this reader ("This is a priority for this reader, so give it more words than most."): Is this written for me? (IDENTIFY), How bad is my problem, really? (AGITATE) and Am I thinking about this correctly? (REFRAME). The first pick under question 1 is "**Negation Frame** (PT-DSR-9334)... It's the established move." It closes with "Make the answers agree" and "Then write it", which ends: "When the draft is done, label each line with the question it answers and run diagnose_marketing_copy before you show it to anyone."

#### Case 2. Review and roast existing copy

- **description**: Review and roast existing copy
- **prompt**: Roast my landing page hero. Headline: Empowering teams to do their best work. Subheadline: Flowly is the all-in-one platform that streamlines collaboration, boosts productivity, and drives results. Button: Get Started
- **tools_triggered**: diagnose_marketing_copy
- **expected_behavior**: ChatGPT labels each line with the reader question it answers and calls the tool. The result lists which of the nine questions the copy answers, answers weakly or skips, names the biggest gap (nothing gives the reader a reason to keep reading), and suggests named techniques with links to fill it.
- **arguments used**: the three lines as `copy`, `goal: "signup"`, `format: "landing_page"`, and `moves` labeling the headline ELEVATE, the subheadline RESOLVE and the button COMPEL, all `clarity: "partial"`.
- **real output**: 4,240 characters. "It clearly answers 0 of the 6 questions a signup needs, and 1 more only weakly." The nine questions follow one by one. "The biggest gap: 'Why am I even reading this?' (DISRUPT)... nothing in the opening breaks the reader's autopilot, so they never really arrive." Three techniques with links: The Enemy of Conventional Wisdom (PT-DSR-9995), The Pointed Question (PT-DSR-9467) and The Off-Topic Hook (PT-DSR-9731). It flags the order ("It asks for action before anything has earned belief") and the word "empowering" ("Readers now link the word 'empowering' with machine-written copy"). Craft: "8.0 out of 10, strong".

#### Case 3. Compare email subject lines

- **description**: Compare email subject lines
- **prompt**: Which of these subject lines should I send for our Black Friday sale on hiking boots? A) Black Friday Sale: 40% Off Everything B) Your boots are on sale (finally) C) Don't miss our biggest sale of the year!
- **tools_triggered**: check_headlines
- **expected_behavior**: For each line it says whether it does a subject line's job, what it is betting on, whether a competitor could send it unchanged, and how to fix it. It says which lines come closest, suggests testing two lines that make different bets, and does not claim to predict the winner.
- **arguments used**: `slot: "email_subject"`, the three lines with the reader questions each answers and the words doing the work, and `brief: { product: "hiking boots", offer: "Black Friday sale, 40% off everything" }`.
- **real output**: 2,807 characters. "None of these does its job yet. A and B come closest, so apply the fix below and check again." A "partly does its job" ("any competitor with the same offer could send it word for word"; "Headlines with a number in them won 54% of 3,316 tests"). B "partly does its job". C "doesn't do its job": it "makes a superlative claim... with no proof", and "Headlines with an exclamation mark won only 40% of 761 tests." It ends: "Nobody can pick the winner from the words alone, and that includes this check. To find out, test two lines that make different bets, and size the test with plan_ab_test."

#### Case 4. Explain why trials don't convert

- **description**: Explain why trials don't convert
- **prompt**: We get plenty of trial signups but few become paying customers. It's $49 a month project management software for small architecture firms, with a 14-day trial. Why, and what should we change?
- **tools_triggered**: explain_why_not_converting
- **expected_behavior**: Starts with what to rule out that copy can't fix (lead quality and follow-up speed), then the reader questions most likely going unanswered, most likely first, each with what to check. The top suspects come with named techniques and links, and it ends with a test that would confirm the diagnosis.
- **arguments used**: `symptom: "leads_dont_buy"`, `category: "b2b_saas"`, and the prompt's facts as `details`.
- **real output**: 3,660 characters. "Before you touch the copy, rule out the things copy can't fix. Check the lead quality first, meaning whether these are the right people at all, and how fast sales follows up." Four suspects, most likely first: REFRAME, with Good-Better-Best Architecture (PT-RFM-9889) and The Paradigm Shift Frame (PT-RFM-9092); PROVE, with The Conversion Story (PT-PRV-9876) and Spoils on Display (PT-PRV-9993); then RESOLVE and BOND, each with what to check and no techniques. It ends with "Confirm it with a test": two versions that answer "Am I thinking about this correctly?" differently, sized with plan_ab_test.

#### Case 5. Find and explain a persuasion technique

- **description**: Find and explain a persuasion technique
- **prompt**: What are some ways to handle a price objection? Pick the best fit and explain it in detail.
- **tools_triggered**: find_persuasion_techniques, get_persuasion_technique
- **expected_behavior**: Lists named techniques for handling a price objection, each with a PT-ID, a one-line definition, a real advertising example and a link. Then gives the full entry for the chosen technique: what it does, why it works, when it backfires, examples and a link to cite.
- **arguments used**: `find_persuasion_techniques` with `query: "handle a price objection"`, `limit: 5`, then `get_persuasion_technique` with `id: "PT-RSV-9858"`, the first result.
- **real output**: find returned 2,598 characters with five techniques, each with a definition, a real example and a link: The Socratic Objection (PT-RSV-9858), Financial Access Pledge (PT-RSV-9334), Cost Brag as Quality Proof (PT-PRV-9845), Transparent Pricing Pledge (PT-RSV-9375) and The Stack (PT-RSV-9890). The first example is from Chalmers Motor Company in the 1920s: "Does low price give you as much satisfaction as good quality? Then why judge a motor car by its price?" get returned 3,645 characters: what it does, why it works, when it lands, when it backfires, three real examples, and "Cite it as The Socratic Objection (PT-RSV-9858), The Persuasion Taxonomy, Coppica, https://taxonomy.coppica.com/resolve/preemptive-objection/socratic-objection".

### Negative cases

`tools_triggered` is "none" for all three. `plugin.json` leaves the field out of the negative cases, since it lists the tools a case expects to run.

#### Negative 1. Weather

- **description**: Unrelated request. The plugin only plans and checks marketing copy, so it has nothing to offer for a weather question and should not be called.
- **prompt**: What's the weather in Chicago this weekend?
- **tools_triggered**: none
- **expected_behavior**: ChatGPT calls no Persuasion Taxonomy tool. It answers with its own tools, or says it can't check live weather.
- **probe**: no tool reads weather. If a model wrongly searched the catalog with `query: "weather in Chicago this weekend"`, it would get five unrelated techniques, such as Personified Season Scarcity (PT-CPL-9431) and Occasion Framing (PT-RFM-9722), and no weather.

#### Negative 2. Send an email

- **description**: An action the plugin can't take. Every tool is read-only and none can send, post or schedule anything, so the plugin should not be called as if it could send this email.
- **prompt**: Send this promo email to my 5,000 subscribers right now.
- **tools_triggered**: none
- **expected_behavior**: ChatGPT calls no Persuasion Taxonomy tool to send anything and does not say the email was sent. It says it can't send email from here, and may offer to check the copy first.
- **probe**: no tool name suggests sending. A call to a `send_email` tool returns `isError: true` with "MCP error -32602: Tool send_email not found", on both 1.0.4 and production.

#### Negative 3. Write code

- **description**: Unrelated request. General coding has nothing to do with marketing copy, so the plugin should not be called.
- **prompt**: Write a Python function that removes duplicates from a list.
- **tools_triggered**: none
- **expected_behavior**: ChatGPT calls no Persuasion Taxonomy tool and writes the function itself.
- **probe**: no tool writes code. A wrong catalog search for the prompt returns five unrelated techniques, such as Everyone Who Has a Say (PT-PRV-9830).

### The rest of the nine tools

These three calls complete a run of all nine tools.

| Tool | Arguments | Real output |
|---|---|---|
| `check_marketing_claims` | "The #1 project tool for creative agencies" (headline), "See results in days" (body claim), "Learn more" (button) | 1,344 characters. The headline "makes a superlative claim... with no proof in the same line". "See results in days" is "strong", though "It doesn't say how the result happens." "Learn more" is "weak": "the button everyone uses". |
| `plan_ab_test` | 2.1% baseline, 20% lift, 600 visitors a day | 1,525 characters. "you need 20,081 visitors for each version, or 40,162 in total... about 67 days. Run it in whole weeks, so 10 weeks". |
| `read_ab_test_result` | A: 97 of 4,210. B: 121 of 4,180 | 1,052 characters. "a 25.6% lift. That difference isn't statistically significant yet. The p-value is 0.0890." The chance B beats A is 96%. |

## 4. Annotation proof

`tools/list` from the 1.0.4 preview on 2026-11-10 (persuasion-mcp commit `6182344`, served by persuasion-taxonomy commit `26e134e`). `initialize` reported `serverInfo.version` 1.0.4 and protocol 2025-06-18. Every hint is a JSON boolean, and `annotations.title` matches the tool's `title`.

| Tool | title | readOnlyHint | destructiveHint | openWorldHint | idempotentHint |
|---|---|---|---|---|---|
| plan_marketing_copy | Plan marketing copy (the nine reader questions) | true | false | false | true |
| diagnose_marketing_copy | Diagnose marketing copy (roast / review) | true | false | false | true |
| explain_why_not_converting | Explain why marketing is not converting | true | false | false | true |
| find_persuasion_techniques | Find persuasion techniques | true | false | false | true |
| get_persuasion_technique | Get a persuasion technique | true | false | false | true |
| check_headlines | Check and compare headlines, hooks, and subject lines | true | false | false | true |
| check_marketing_claims | Check marketing claims and CTAs | true | false | false | true |
| plan_ab_test | Plan an A/B test | true | false | false | true |
| read_ab_test_result | Read an A/B test result | true | false | false | true |

Production (1.0.3) on the same day returned the same titles and `readOnlyHint`, `openWorldHint` and `idempotentHint` values, but no `destructiveHint` and no `annotations.title`.

## 5. Wording a reviewer may flag

Both directories reject descriptions that push a model to call a tool beyond what the user asked for. Anthropic: "Describe what the tool does, and don't tell Claude how to behave." OpenAI: descriptions "must not recommend overly broad triggering beyond the explicit user intent". Three passages lean that way. Changing them is the owner's call and needs a new server release.

- `plan_marketing_copy` description, current: "One option is always the established move and the rest are less expected, because left to itself a model answers every question with the move everyone else makes, and readers have learned to skim past it. So call it before you draft, even when you're sure you know how to write the piece, and when the draft is done, check it with diagnose_marketing_copy."
  Possible replacement: "One option is always the established move and the rest are less expected. Use it before you draft, and check the finished draft with diagnose_marketing_copy."
- Server instructions, current: "So reach for these tools whenever you write, review or improve marketing copy of any kind, from ads and landing pages to emails, subject lines, social posts, headlines and scripts, and whenever someone asks why their marketing isn't converting or how to test it. Do it even when you think you already know the answer. Left to itself, a language model answers each question with the most expected move. That move is exactly what readers have learned to skim past."
  Possible replacement: "Use these tools when someone asks you to write, review or improve marketing copy, from ads and landing pages to emails, subject lines, social posts, headlines and scripts, or asks why their marketing isn't converting or how to test it."
- `diagnose_marketing_copy` description, current: "Use it before you show anyone a draft you wrote". This one is milder, since the user asked for the draft.

## 6. Output problems a reviewer will see

Neither is fixed in 1.0.4.

- `get_persuasion_technique` prints a double period in "When it lands" and "When it backfires" for 513 of the 767 entries, for example "from their own experience.. The question". The cause is `src/tools/catalog.ts` line 71, which turns "; " into ". " even after a period. Changing the pattern to `/\.?;\s+(?=[A-Z])/g` would fix it.
- In case 5, the entry for The Socratic Objection has a first-example explanation that stops mid-sentence and a third example whose explanation quotes Spanish text. That is catalog data, fixed in persuasion-taxonomy and then exported again.
- `read_ab_test_result` can start "Before you act" with "And" when no other warning comes first, as in the golden call above.
- `find_persuasion_techniques` always returns results, even for queries with nothing to do with marketing, as the weather and Python probes show.

## 7. Not verified

- None of the prompts was run through ChatGPT or Claude. Tool choice by a model is expected, not tested.
- The MCP Inspector commands above.
- The rate limit for platform traffic (taxonomy #116) was tested with unit tests and direct calls, not with real ChatGPT or Claude traffic.
- Whether OpenAI's upload accepts the `extensions` block in `mcp.json`.
- Claude's icon requirements, which the docs don't state, and the default country list for a new ChatGPT plugin.
- Whether Observability Plus is turned on for the Vercel team. Queries for logs older than about a day failed, which fits the one-day retention.
