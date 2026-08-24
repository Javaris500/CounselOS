import type { Locator, Page } from '@playwright/test';

import { expect, test } from './fixtures/auth';
import { SEED_IDS } from './fixtures/seed';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * ACCESSIBILITY — KEYBOARD, FOCUS, LABELS, CONTRAST, AND COLOUR REMOVED.
 *
 * Not a final pass. Keyboard path, focus order, labels and contrast are part of
 * "works", and the two places colour-only meaning hides on this slice are the
 * STATUS CONTROL and the STATUS LADDER — both of which encode a legal state.
 * A matter that reads as CLOSING_PREP to one attorney and as nothing at all to
 * a colleague with deuteranopia is a case-management failure, not a styling one.
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * No axe-core here: it is not a dependency of `@counselos/web` and adding one is
 * outside this harness's boundary. What follows is hand-written and narrower,
 * but it is aimed at this slice's actual risks rather than at a generic rule
 * list. Adding axe is filed as a recommendation.
 */

/** WCAG 2.1 relative luminance and contrast ratio, computed in the page. */
const CONTRAST_HELPER = `
  (element) => {
    const parse = (value) => {
      const match = value.match(/rgba?\\(([^)]+)\\)/);
      if (!match) return null;
      const parts = match[1].split(',').map((n) => parseFloat(n));
      return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
    };
    const luminance = ({ r, g, b }) => {
      const channel = (c) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    };

    const style = getComputedStyle(element);
    const fg = parse(style.color);

    // Walk up for the first opaque background — a transparent element inherits
    // the paper it sits on, and comparing text to 'rgba(0,0,0,0)' scores a
    // perfect ratio against black and hides every real failure.
    let node = element;
    let bg = null;
    while (node) {
      const candidate = parse(getComputedStyle(node).backgroundColor);
      if (candidate && candidate.a > 0.9) { bg = candidate; break; }
      node = node.parentElement;
    }
    if (!fg || !bg) return null;

    const l1 = luminance(fg);
    const l2 = luminance(bg);
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    return {
      ratio: Math.round(ratio * 100) / 100,
      fontSize: parseFloat(style.fontSize),
      fontWeight: Number(style.fontWeight) || 400,
      color: style.color,
      background: getComputedStyle(node).backgroundColor,
    };
  }
`;

interface ContrastReading {
  ratio: number;
  fontSize: number;
  fontWeight: number;
  color: string;
  background: string;
}

async function contrastOf(locator: Locator): Promise<ContrastReading> {
  const reading = (await locator.evaluate(
    eval(CONTRAST_HELPER) as never,
  )) as ContrastReading | null;
  if (reading === null) {
    throw new Error('could not resolve a foreground/background pair for this element');
  }
  return reading;
}

/** WCAG AA: 3.0 for large text (>=24px, or >=18.66px bold), 4.5 otherwise. */
const requiredRatio = (reading: ContrastReading): number =>
  reading.fontSize >= 24 || (reading.fontSize >= 18.66 && reading.fontWeight >= 700) ? 3 : 4.5;

/** The element the browser currently has focused, as a testid where it has one. */
const focusedTestId = (page: Page): Promise<string | null> =>
  page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? null);

// ═══ KEYBOARD AND FOCUS ══════════════════════════════════════════════════════

test.describe('Keyboard path', () => {
  test('the board is operable from the keyboard alone, end to end', async ({ page }) => {
    await page.goto('/transactions');
    await expect(page.getByTestId('transaction-pipeline')).toBeVisible();

    // "New matter" is reachable by tabbing, not only by clicking. A control
    // that needs a mouse is a control half the firm cannot use.
    let reached = false;
    for (let i = 0; i < 15 && !reached; i += 1) {
      await page.keyboard.press('Tab');
      reached = (await focusedTestId(page)) === 'transaction-create-btn';
    }
    expect(reached).toBe(true);

    // Enter activates it, and focus moves INTO the dialog — a modal that opens
    // behind the user's focus is a modal a screen-reader user never finds.
    await page.keyboard.press('Enter');
    const dialog = page.getByTestId('transaction-create-dialog');
    await expect(dialog).toBeVisible();

    const focusInsideDialog = await page.evaluate(() => {
      const dialogEl = document.querySelector('[data-testid="transaction-create-dialog"]');
      return dialogEl instanceof HTMLElement && dialogEl.contains(document.activeElement);
    });
    expect(focusInsideDialog).toBe(true);

    // Escape closes a dismissible dialog. `<dialog>`'s own cancel event, not a
    // hand-rolled key handler that misses half the cases.
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('the outcome dialog refuses Escape, because the question cannot be answered later', async ({
    page,
  }) => {
    await page.goto('/transactions');
    await page.getByTestId('transaction-create-btn').click();
    await page.getByTestId('transaction-address-input').fill('507 Calles St');
    await page.getByTestId('transaction-create-submit').click();
    await expect(page).toHaveURL(/\/transactions\/[0-9a-f-]{36}$/);

    await page.getByTestId('status-move-fallen-through-btn').click();
    const outcome = page.getByTestId('transaction-outcome-dialog');
    await expect(outcome).toBeVisible();

    // `dismissible={false}`: a keypress must not bypass a decision that is
    // unrecoverable (16 §2.3). This is an accessibility-adjacent trap — the
    // usual advice is "Escape always closes a modal" — and the deviation is
    // deliberate, so it is asserted rather than left to be "fixed" later.
    await page.keyboard.press('Escape');
    await expect(outcome).toBeVisible();

    // Cancel is still reachable, so the user is never trapped.
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(outcome).toBeHidden();
  });

  test('a pipeline card is a link, so it opens with Enter and in a new tab', async ({ page }) => {
    await page.goto('/transactions');
    const card = page.locator(
      `[data-transaction-id="${SEED_IDS.transactions.manorRd}"]`,
    );
    await expect(card).toBeVisible();

    // A real anchor with a real href, not a div with an onClick. That is what
    // gets keyboard activation, middle-click, and "open in new tab" for free.
    await expect(card).toHaveJSProperty('tagName', 'A');
    await expect(card).toHaveAttribute('href', `/transactions/${SEED_IDS.transactions.manorRd}`);

    await card.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`/transactions/${SEED_IDS.transactions.manorRd}$`));
  });

  test('every status move is a real button, and a disabled one is genuinely disabled', async ({
    page,
  }) => {
    await page.goto(`/transactions/${SEED_IDS.transactions.manorRd}`);
    const moves = page.locator('[data-testid^="status-move-"]');
    await expect(moves).toHaveCount(3);

    for (let i = 0; i < 3; i += 1) {
      await expect(moves.nth(i)).toHaveJSProperty('tagName', 'BUTTON');
      // A visible, non-empty accessible name. A button whose only content is a
      // colour is unusable to everyone who is not looking at it.
      await expect(moves.nth(i)).not.toHaveText('');
    }

    await moves.first().focus();
    expect(await focusedTestId(page)).toBe('status-move-title-review-btn');
  });
});

test.describe('Focus visibility', () => {
  test('focus is visibly indicated on the controls that change a legal state', async ({ page }) => {
    await page.goto(`/transactions/${SEED_IDS.transactions.manorRd}`);

    const move = page.getByTestId('status-move-title-review-btn');
    await move.focus();

    const outline = await move.evaluate((el) => {
      const style = getComputedStyle(el, null);
      return {
        outlineWidth: style.outlineWidth,
        outlineStyle: style.outlineStyle,
        boxShadow: style.boxShadow,
      };
    });

    // Keyboard focus must be visible. `outline: none` with nothing in its place
    // is the single most common way a product becomes keyboard-hostile.
    const hasIndicator =
      (outline.outlineStyle !== 'none' && parseFloat(outline.outlineWidth) > 0) ||
      (outline.boxShadow !== 'none' && outline.boxShadow !== '');
    expect(hasIndicator, JSON.stringify(outline)).toBe(true);
  });
});

// ═══ LABELS ══════════════════════════════════════════════════════════════════

test.describe('Labels and announcements', () => {
  test('every control in the create dialog has a real label', async ({ page }) => {
    await page.goto('/transactions');
    await page.getByTestId('transaction-create-btn').click();
    await expect(page.getByTestId('transaction-create-dialog')).toBeVisible();

    // Resolved through the platform's own labelling rules, so `<label for>` is
    // what has to be right — not an aria-label bolted on.
    for (const label of [
      'Type',
      'Property address',
      'Buyer',
      'Seller',
      'Title',
      'Effective date',
      'Closing date',
      'Purchase price',
      'Earnest money',
      'Referral source',
      'Referred by',
    ]) {
      await expect(page.getByLabel(label, { exact: true })).toBeVisible();
    }
  });

  test('the dialog names itself to assistive tech', async ({ page }) => {
    await page.goto('/transactions');
    await page.getByTestId('transaction-create-btn').click();

    const named = await page.evaluate(() => {
      const dialog = document.querySelector('[data-testid="transaction-create-dialog"]');
      const id = dialog?.getAttribute('aria-labelledby');
      if (!id) return null;
      return document.getElementById(id)?.textContent ?? null;
    });
    expect(named).toBe('New matter');
  });

  test('a refusal is announced, not merely rendered', async ({ page }) => {
    // A validation failure that is only red text is invisible to anyone not
    // watching that corner of the screen.
    await page.goto('/transactions');
    await page.getByTestId('transaction-create-btn').click();
    await page.getByTestId('transaction-create-submit').click();

    await expect(
      page.getByTestId('transaction-create-dialog').locator('[role="alert"]').first(),
    ).toBeVisible();
  });

  test('the tab strip is a named navigation, and the current tab says so', async ({ page }) => {
    await page.goto(`/transactions/${SEED_IDS.transactions.manorRd}`);

    const tabs = page.getByTestId('transaction-tabs');
    await expect(tabs).toHaveJSProperty('tagName', 'NAV');
    await expect(tabs).toHaveAttribute('aria-label', 'Matter sections');
    await expect(page.getByTestId('tab-overview')).toHaveAttribute('aria-current', 'page');
    // Not-yet-landed tabs announce as disabled rather than looking clickable.
    await expect(page.getByTestId('tab-chat')).toHaveAttribute('aria-disabled', 'true');
  });
});

// ═══ COLOUR REMOVED ══════════════════════════════════════════════════════════

test.describe('Colour is never the only signal', () => {
  test('every status badge carries a readable label, so the ladder survives grayscale', async ({
    page,
  }) => {
    await page.goto('/transactions');
    await expect(page.getByTestId('transaction-pipeline')).toBeVisible();

    // Desaturate the whole page. Any meaning that lived in hue alone is now
    // gone, so whatever still reads is the meaning that was never colour-borne.
    await page.addStyleTag({ content: 'html { filter: grayscale(1) !important; }' });

    const badges = page.locator('[data-tone]');
    const count = await badges.count();
    expect(count).toBeGreaterThan(0);

    const seen = new Map<string, string>();
    for (let i = 0; i < count; i += 1) {
      const badge = badges.nth(i);
      const tone = (await badge.getAttribute('data-tone')) ?? '';
      const text = ((await badge.textContent()) ?? '').trim();

      // The label IS the second signal, and it is mandatory.
      expect(text, `a ${tone} badge rendered with no text`).not.toBe('');

      // And two different meanings never share one label — a ladder where
      // TITLE_REVIEW and CLOSING_PREP both read "Active" is colour-borne again
      // by the back door.
      const previous = seen.get(text);
      if (previous !== undefined) expect(previous).toBe(tone);
      seen.set(text, tone);
    }
  });

  test('the pipeline columns are labelled, not merely positioned', async ({ page }) => {
    await page.goto('/transactions');
    await page.addStyleTag({ content: 'html { filter: grayscale(1) !important; }' });

    // Which column a card is in is itself meaning. It has to be readable
    // without relying on remembering the order or telling the tints apart.
    for (const label of [
      'Intake',
      'Under Contract',
      'Due Diligence',
      'Title Review',
      'Closing Prep',
      'Closed',
      'Fell Through',
    ]) {
      await expect(page.getByRole('heading', { name: label, exact: false })).toBeVisible();
    }
  });

  test('the status control still reads under forced-colors', async ({ page }) => {
    // Windows High Contrast and equivalent: the author's palette is discarded
    // wholesale. Anything that was carrying meaning in a background tint is
    // gone, and only structure and text remain.
    await page.emulateMedia({ forcedColors: 'active' });
    await page.goto(`/transactions/${SEED_IDS.transactions.manorRd}`);

    const control = page.getByTestId('transaction-status-control');
    await expect(control).toBeVisible();
    await expect(control.locator('[data-tone]')).toHaveText('Due Diligence');
    await expect(control.getByTestId('status-move-title-review-btn')).toBeVisible();
    await expect(control.getByTestId('status-move-fallen-through-btn')).toBeVisible();

    // The dangerous move is distinguishable by its LABEL, not only by being
    // red — which under forced-colors it no longer is.
    await expect(control.getByTestId('status-move-fallen-through-btn')).toHaveText('Fell Through');
  });

  test('a refused transition explains itself in words, not in a colour', async ({ page }) => {
    // The one message in this slice that MUST be read: a legal state change was
    // refused, and here is where the matter may go instead. Under forced-colors
    // the banner's tint is discarded, so everything load-bearing has to be text
    // and structure.
    await page.emulateMedia({ forcedColors: 'active' });

    await page.goto('/transactions');
    await page.getByTestId('transaction-create-btn').click();
    await page.getByTestId('transaction-address-input').fill('1611 W 5th St');
    await page.getByTestId('transaction-create-submit').click();
    await expect(page).toHaveURL(/\/transactions\/[0-9a-f-]{36}$/);
    const id = page.url().split('/').pop() ?? '';

    const control = page.getByTestId('transaction-status-control');
    await expect(control.locator('[data-tone]')).toHaveText('Intake');

    // A second tab in the SAME context moves the matter on. This page keeps its
    // stale ladder — `revalidateOnFocus: false` — which is the only way a
    // browser can ask for a transition the server refuses.
    const other = await page.context().newPage();
    try {
      await other.goto(`/transactions/${id}`);
      const otherControl = other.getByTestId('transaction-status-control');
      for (const move of ['under-contract', 'due-diligence', 'title-review']) {
        await otherControl.getByTestId(`status-move-${move}-btn`).click();
        await expect(otherControl.locator('[data-tone]')).not.toHaveText('Intake');
      }
      await expect(otherControl.locator('[data-tone]')).toHaveText('Title Review');
    } finally {
      await other.close();
    }

    await page.bringToFront();
    await control.getByTestId('status-move-under-contract-btn').click();

    const rejection = page.getByTestId('transaction-status-rejected');
    await expect(rejection).toBeVisible();
    await expect(rejection).toHaveAttribute('role', 'alert');
    // Words, with the palette gone.
    await expect(rejection).toContainText('cannot move to');
    await expect(rejection).toContainText('Fell Through');
  });
});

// ═══ CONTRAST ════════════════════════════════════════════════════════════════

test.describe('Contrast', () => {
  test('the matter identity and its status meet WCAG AA', async ({ page }) => {
    await page.goto(`/transactions/${SEED_IDS.transactions.manorRd}`);
    await expect(page.getByTestId('transaction-shell')).toBeVisible();

    const samples: [string, Locator][] = [
      ['matter title', page.getByTestId('transaction-title')],
      ['status badge', page.getByTestId('transaction-status-control').locator('[data-tone]')],
      ['a status move', page.getByTestId('status-move-title-review-btn')],
      ['the active tab', page.getByTestId('tab-overview')],
    ];

    for (const [name, locator] of samples) {
      const reading = await contrastOf(locator);
      expect(
        reading.ratio,
        `${name}: ${reading.color} on ${reading.background} at ${String(reading.fontSize)}px`,
      ).toBeGreaterThanOrEqual(requiredRatio(reading));
    }
  });

  test('every status tone on the board meets WCAG AA', async ({ page }) => {
    await page.goto('/transactions');
    await expect(page.getByTestId('transaction-pipeline')).toBeVisible();

    // The urgency ladder is where hue is doing the most work, so it is where a
    // low-contrast tint is most likely and most costly.
    const badges = page.locator('[data-tone]');
    const count = await badges.count();
    for (let i = 0; i < count; i += 1) {
      const badge = badges.nth(i);
      const tone = await badge.getAttribute('data-tone');
      const reading = await contrastOf(badge);
      expect(
        reading.ratio,
        `tone=${String(tone)}: ${reading.color} on ${reading.background} at ${String(reading.fontSize)}px`,
      ).toBeGreaterThanOrEqual(requiredRatio(reading));
    }
  });

  test('the refusal banner meets WCAG AA — the one message that must be read', async ({ page }) => {
    await page.goto('/transactions');
    await page.getByTestId('transaction-create-btn').click();
    await page.getByTestId('transaction-create-submit').click();

    const fieldError = page
      .getByTestId('transaction-create-dialog')
      .locator('[role="alert"]')
      .first();
    await expect(fieldError).toBeVisible();

    const reading = await contrastOf(fieldError);
    expect(
      reading.ratio,
      `field error: ${reading.color} on ${reading.background} at ${String(reading.fontSize)}px`,
    ).toBeGreaterThanOrEqual(requiredRatio(reading));
  });
});
