# Proposal: update the deadline table from the October 2026 research

**Status:** proposal, not implemented. **As of 2026-10-13.**

This compares the deadlines the app tracks (`src/rules/ca-rules.ts`) with the master timeline in [research/01](../research/01-ca-iep-process.md#master-timeline). Nothing here changes the app yet. Labels follow the research: a linked or "verified" item was checked against a source; **`Unverified`** comes from general knowledge and still needs an attorney or SELPA to check it against the official text.

## Summary

1. **Fix citations on the six clocks the app already tracks.** The research cites EC 56043 for most of them, checked against [Disability Rights California](https://www.disabilityrightsca.org/publications/special-education-timelines) and the [F3 Law 2026 chart](https://www.f3law.com/wp-content/uploads/2026/01/F3-015-CA-SPED-Timelines-2026.pdf). The app's current citations weren't checked. The dates the app calculates don't change.
2. **Add seven clocks** the research lists but the app doesn't track. Three are verified, four are `Unverified`. The most useful first are records requests and manifestation determinations.
3. **Add one district-level date:** the CALPADS Fall 1 certification date, when late annual and triennial IEPs become visible to the state.

## 1. Citation fixes (existing clocks)

| Clock | App today | Proposed | Check status |
| --- | --- | --- | --- |
| Assessment plan to parent, 15 days | EC 56321(a) | EC 56043(a); 56321(a) | Verified (DRC, F3) |
| Parent's decision on the plan, at least 15 days | EC 56321(c)(4) | EC 56043(b) | Verified (DRC, F3) |
| Initial or triennial IEP, 60 days from consent | EC 56344(a) | EC 56043(c), (f)(1); 56344(a) | Verified (DRC, F3) |
| End-of-year referral, within 30 days of next year | inside EC 56344(a) | EC 56043(f) | Verified (DRC, F3) |
| Parent-requested meeting, 30 days | EC 56043(l) | EC 56043(l); 56343.5 | Verified (DRC, F3) |
| Annual review, every 12 months | EC 56043(d); 34 CFR 300.324(b)(1) | EC 56343(d); 34 CFR 300.324(b)(1) | `Unverified`: the research and the app disagree on the state section |
| Triennial, every 3 years | EC 56381(a)(2); 34 CFR 300.303(b)(2) | No change (research: EC 56381) | `Unverified` |

**Still open:** the app applies a 10-day end-of-year rule to the assessment plan (a referral 10 or fewer days before year end is due 10 days into the next year). The research doesn't mention it. Keep it, and add it to the legal-review list.

**Effort:** small. Edit the `citation` fields and the README's rules section; no test changes, since dates don't move.

## 2. New clocks

Ranked by how often a coordinator hits them and how clear the rule is.

| # | Clock | Starts when | Deadline | Authority | Status | How days count |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Copies of records to parent | Parent requests records | 5 business days, and before any IEP meeting or resolution session | EC 56043(n); 56504 | Verified | Business days |
| 2 | Manifestation determination | Decision to change placement for discipline | 10 school days | [20 U.S.C. 1415(k)(1)(E)](https://www.law.cornell.edu/uscode/text/20/1415) | Verified | School days |
| 3 | IEP meeting after a behavioral emergency | Emergency report | Within 2 days (parent notified within 1 school day) | EC 56521.1 | `Unverified` | Calendar days |
| 4 | Transition plan in effect | Student's date of birth | IEP in effect by the 16th birthday | EC 56345.1 | `Unverified` | Milestone |
| 5 | Notice that rights transfer at 18 | Student's date of birth | At least 1 year before the 18th birthday | EC 56041.5 | `Unverified` | Milestone |
| 6 | Transfer from another California SELPA | Enrollment | Comparable services up to 30 days, then adopt or rewrite the IEP | EC 56325(a)(1) | `Unverified` | Calendar days |
| 7 | Records to a new district | New district's request | 5 business days | EC 56043(o) | Verified | Business days |

**Why these first:**
- **Records requests (#1)** come up in almost every dispute, and the "before any IEP meeting" part ties straight into scheduling: the app can block a meeting until records have gone out.
- **Manifestation determinations (#2)** are rare but high stakes. The research notes that the protections apply even before eligibility, if a parent asked in writing ([research/02](../research/02-noncompliance-impacts.md#legal)).
- **#4 and #5** only need a date of birth, which SEIS exports usually include, so they can light up many students at once.

**Engine work needed:**
- **Business days:** weekdays, skipping the district's single-day holidays, but *not* skipping summer. Needs a reading from an attorney: does "business day" follow the district office calendar?
- **School days:** already exists for the scheduling buffer (`addSchoolDays`); it needs to be exposed as a counting method.
- **Milestone from date of birth:** due date = birthday + N years (− 1 year for the rights notice); act-by = the last annual IEP held before that date.
- New student date fields:
  - date of birth;
  - records request;
  - discipline placement decision;
  - behavioral emergency;
  - enrollment from another SELPA;
  - new district records request.
- The importer needs synonyms for each new field, so they can be read from uploaded spreadsheets.
- Hand-calculated test cases for each new clock, like the existing 62.

**Effort:** medium. About 1 day for the engine and fields, plus test cases, plus legal review of the four `Unverified` rules before they ship.

## 3. Considered and left out

| Item | Why not now |
| --- | --- |
| State complaint decision, 60 days | It's the state's clock, not the district's |
| Progress reports "as often as report cards" | Needs each district's report-card calendar; revisit with the SEIS feed |
| IEP within 30 days of eligibility (federal) | California's 60-day consent-to-IEP clock already covers it |
| Services start "as soon as possible" | No fixed date to count to; better as a flag ("consent signed, no service start date") |
| Due process 2-year window | A legal exposure window, not a district action |

## 4. District-level date: CALPADS Fall 1 certification

Late annual and triennial IEPs are pulled from CALPADS after Fall 1 certification (Dec 12, 2025 for 2025–26; Census Day Oct 1). A late annual without a delay code blocks certification ([research/04](../research/04-buyer-selpa-director.md#what-keeps-them-up-at-night)).

**Proposal:**
- Add the certification date as a setting.
- On the at-risk list and the director view, flag every annual or triennial that will be overdue on that date and has no meeting scheduled.
- `Hypothesis` from the research: this is the strongest selling point to directors. It changes no legal clock, only what we highlight.

## Before any of this ships

- [ ] Attorney or SELPA review of the `Unverified` rules: annual section, #3–#6, and the assessment plan's 10-day end-of-year rule.
- [ ] Confirm which new date fields SEIS exports (research open question).
- [ ] Decide how "business day" is defined for records requests.
