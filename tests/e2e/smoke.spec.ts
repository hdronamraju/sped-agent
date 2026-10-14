import { expect, test, type Page } from "@playwright/test";

// The sample district is set in fall 2026; pin "today" so the story is stable.
async function pinDate(page: Page) {
  await page.clock.setFixedTime(new Date("2026-10-10T09:00:00-07:00"));
}

test("sample district: at-risk list, then a full scheduling round trip in Spanish", async ({ page }) => {
  await pinDate(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Try it with sample data" }).click();

  // P0-4: the at-risk list, including a student the coordinator wasn't tracking.
  await expect(page.getByRole("heading", { name: "At-risk list" })).toBeVisible();
  const notTracked = page.locator("section", { hasText: "Found students you weren't tracking" });
  await expect(notTracked.getByText("Ethan Nguyen")).toBeVisible();
  await page.getByRole("button", { name: /Ava Johnson.*Assessment plan/ }).click();
  await expect(page.getByText("Cal. Educ. Code § 56321(a)").first()).toBeVisible();

  // Process board: Sofia is assessing, Leo is with his family, Ava is referred.
  await page.getByRole("link", { name: "Process" }).click();
  await expect(page.getByRole("region", { name: "Assessing" }).getByTestId("card-1002")).toBeVisible();
  await expect(page.getByRole("region", { name: "Plan with family" }).getByTestId("card-1001")).toBeVisible();
  await expect(page.getByRole("region", { name: "Referred" }).getByTestId("card-1004")).toBeVisible();

  // P0-5: the queue. Start scheduling Sofia's initial IEP.
  await page.getByRole("link", { name: /^Today/ }).click();
  const row = page.locator("li", { hasText: "Hold initial IEP meeting" }).filter({ hasText: "Sofia Hernandez" });
  await row.getByRole("button", { name: "Schedule" }).click();

  // P1-3: required attendees with an interpreter.
  await expect(page.getByRole("paragraph").filter({ hasText: "Ana Gómez" })).toBeVisible();
  await expect(page.getByText(/Parent's language is Spanish/)).toBeVisible();

  // Once a meeting is being booked, she moves on the board.
  await page.getByRole("link", { name: "Process" }).click();
  await expect(page.getByRole("region", { name: "Meeting being scheduled" }).getByTestId("card-1002")).toBeVisible();
  await page.getByTestId("card-1002").click();
  await expect(page.getByRole("navigation", { name: "Process stage" }).getByText("Meeting being scheduled")).toHaveAttribute("aria-current", "step");
  await page.goBack();
  await page.goBack();

  // P1-5: three times; P1-6: Spanish message needs approval.
  await page.getByRole("button", { name: "Find 3 times" }).click();
  await expect(page.getByText("Message to parent: needs your approval")).toBeVisible();
  await expect(page.getByLabel("Subject")).toHaveValue(/Elija una hora/);
  await page.getByRole("button", { name: "Approve & send" }).click();
  await expect(page.getByText("Waiting on the parent")).toBeVisible();

  // Parent replies "2" (demo) → hold placed → notice drafted with checks passing.
  await page.getByLabel("Simulated parent reply").fill("La 2 por favor");
  await page.getByRole("button", { name: "Simulate reply" }).click();
  await expect(page.getByText("Meeting notice: needs your approval")).toBeVisible();
  await expect(page.getByText("✓ Interpreter on the team")).toBeVisible();
  await expect(page.getByText("✗")).toHaveCount(0);
  await page.getByRole("button", { name: "Approve & send" }).click();
  await expect(page.getByRole("heading", { name: "Scheduled" })).toBeVisible();

  // P1-8: a decline triggers a reschedule that still meets the deadline.
  await page.getByRole("button", { name: /Demo: .* declines/ }).click();
  await expect(page.getByText("Needs a new time")).toBeVisible();
  await page.getByRole("button", { name: "Find new times" }).click();
  await expect(page.getByText("Message to parent: needs your approval")).toBeVisible();

  // P0-6: audit log is intact and shows the approvals.
  await page.getByRole("link", { name: "Audit log" }).click();
  await expect(page.getByText(/Approved "Elija una hora/)).toBeVisible();
  await page.getByRole("button", { name: "Verify integrity" }).click();
  await expect(page.getByText(/Verified: all \d+ entries intact/)).toBeVisible();
});

test("session 0 by hand: upload SEIS export and a PDF calendar", async ({ page }) => {
  await pinDate(page);
  await page.goto("/");
  await page.getByLabel("Your name").fill("Maria Lopez");
  await page.getByLabel("Work email").fill("mlopez@sample-unified.org");
  await page.getByLabel("District").fill("Sample Unified");
  await page.getByRole("button", { name: "Next" }).click();

  await page.getByTestId("file-input").setInputFiles("public/samples/seis-export.csv");
  await expect(page.getByText("seis-export.csv")).toBeVisible();
  await page.getByRole("button", { name: /Import seis export/i }).click();
  await expect(page.getByText(/Imported seis-export.csv/)).toBeVisible();
  await expect(page.getByText("Every row was read.")).toBeVisible();
  await page.getByRole("button", { name: "Next: school calendar" }).click();

  // P0-2: read the PDF, propose breaks, confirm.
  await page.getByTestId("file-input").setInputFiles("public/samples/calendar-2026-27.pdf");
  await expect(page.getByText("Confirm the 2026-27 calendar")).toBeVisible();
  await expect(page.getByText("Not counted (10 school days)")).toBeVisible();
  await expect(page.getByText("Not counted (6 school days, joined)")).toHaveCount(2); // Cesar Chavez Day + spring break
  await page.getByRole("button", { name: "Confirm calendar" }).click();
  await page.getByRole("button", { name: "Show my at-risk list" }).click();
  await expect(page.getByRole("heading", { name: "At-risk list" })).toBeVisible();
  await expect(page.getByText("Ethan Nguyen").first()).toBeVisible();
});
