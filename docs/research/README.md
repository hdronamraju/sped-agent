# Research: California special education background

**As of 2026-10-13.** Background research for SpEd Agent: how the California IEP process works, what non-compliance costs, how money flows, who the buyer is and what hurts them, and what public data exists. California first.

This is research, not legal advice. Rules, deadlines and state ratings change every year, so recheck anything you rely on.

## Files

| File | What it covers |
| --- | --- |
| [01-ca-iep-process.md](01-ca-iep-process.md) | The IEP process as 9 events, with deadlines and what the front office, teacher, student and family each do |
| [02-noncompliance-impacts.md](02-noncompliance-impacts.md) | Legal, financial and learning consequences of non-compliance |
| [03-funding-incentives.md](03-funding-incentives.md) | Why an IEP is a cost, not revenue, for a California district |
| [04-buyer-selpa-director.md](04-buyer-selpa-director.md) | What drives a SELPA or district special education director; painkillers vs vitamins; interview questions |
| [05-public-data-sources.md](05-public-data-sources.md) | What the state publishes about district compliance, and how to get the rest |
| [sources.md](sources.md) | Every source used, with links |

## How claims are labeled

- **Linked claim:** a fact with a link to a page that was opened while researching it.
- **`Unverified`:** a citation or fact from general knowledge that wasn't checked against the official text. Mostly Education Code subsection numbers in the process guide.
- **`Hypothesis`:** a judgment or guess that needs validating, usually through customer interviews.

## Inputs

Two r/specialed threads (a parent of a 5-year-old with a speech-only IEP and a new autism diagnosis; a kinship foster parent of a 16-year-old with a 504 plan) were used as illustrative cases. They are summarized, not copied, in [01-ca-iep-process.md](01-ca-iep-process.md#lessons-from-two-parent-threads).

## How this relates to the code

The deadline rules the app implements live in `src/rules/ca-rules.ts`, and the readings that still need legal review are listed in the main [README](../../README.md#california-rules-and-interpretations-to-review). These research files explain *why* those deadlines matter and who cares about them; they don't change the rules.

## Open questions

- Get the full list of district annual determinations and monitoring tiers through a California Public Records Act request to CDE (see [05](05-public-data-sources.md)).
- Validate the buyer pains in [04](04-buyer-selpa-director.md) with 5 to 10 SELPA and district special education directors.
- Have a California special-ed attorney or SELPA check the `Unverified` Education Code citations in [01](01-ca-iep-process.md).
