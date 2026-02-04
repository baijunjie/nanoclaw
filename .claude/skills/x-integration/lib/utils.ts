/**
 * X Integration - Utility functions
 * Validation, UI interaction, and display helpers
 */

import { Page, Locator } from 'playwright';
import { ScriptResult } from './script.js';
import { config } from './config.js';

// Shorthand for selectors
const sel = config.selectors;
const btn = sel.buttons;

/**
 * Validate that a tweet URL is provided
 */
export function validateTweetUrl(tweetUrl: string | undefined): ScriptResult | null {
  if (!tweetUrl) {
    return { success: false, message: 'Please provide a tweet URL' };
  }
  return null;
}

/**
 * Validate tweet/reply content length
 */
export function validateContent(content: string | undefined, type = 'Tweet'): ScriptResult | null {
  if (!content || content.length === 0) {
    return { success: false, message: `${type} content cannot be empty` };
  }
  if (content.length > config.limits.tweetMaxLength) {
    return {
      success: false,
      message: `${type} exceeds ${config.limits.tweetMaxLength} character limit (current: ${content.length})`
    };
  }
  return null;
}

/**
 * Check if button is disabled via aria-disabled attribute
 */
export async function isButtonDisabled(button: Locator): Promise<boolean> {
  const ariaDisabled = await button.getAttribute('aria-disabled');
  return ariaDisabled === 'true';
}

/**
 * Truncate content for display in messages
 * @example truncateForDisplay("Hello world", 5) => "Hello..."
 */
export function truncateForDisplay(content: string, maxLength = 50): string {
  if (content.length <= maxLength) return content;
  return `${content.slice(0, maxLength)}...`;
}

/**
 * Fill content in a modal dialog and submit
 * Used by reply and quote operations
 */
export interface DialogSubmitOptions {
  page: Page;
  content: string;
  /** Label for error messages, e.g., "Reply", "Quote" */
  contentLabel: string;
}

export interface DialogSubmitResult {
  success: boolean;
  error?: string;
}

export async function fillDialogAndSubmit(options: DialogSubmitOptions): Promise<DialogSubmitResult> {
  const { page, content, contentLabel } = options;

  const dialog = page.locator(sel.modalDialog);
  await dialog.waitFor({ timeout: config.timeouts.elementWait });

  // Fill textarea
  const textInput = dialog.locator(sel.tweetTextarea);
  await textInput.waitFor({ timeout: config.timeouts.elementWait });
  await textInput.click();
  await page.waitForTimeout(config.timeouts.shortPause);
  await textInput.type(content);
  await page.waitForTimeout(config.timeouts.actionDelay);

  // Validate and click submit
  const submitButton = dialog.locator(btn.postDialog);
  await submitButton.waitFor({ timeout: config.timeouts.elementWait });

  if (await isButtonDisabled(submitButton)) {
    return {
      success: false,
      error: `Submit button disabled. ${contentLabel} may be empty or exceed character limit.`
    };
  }

  await submitButton.click({ force: true });
  await page.waitForTimeout(config.timeouts.loadWait);

  return { success: true };
}

/**
 * Check if user is logged in to X
 */
export async function checkLoginStatus(page: Page): Promise<{ loggedIn: boolean; onLoginPage: boolean }> {
  const isLoggedIn = await page.locator(sel.accountSwitcher).isVisible().catch(() => false);
  if (isLoggedIn) {
    return { loggedIn: true, onLoginPage: false };
  }

  const onLoginPage = await page.locator(sel.usernameInput).isVisible().catch(() => false);
  return { loggedIn: false, onLoginPage };
}

/**
 * Get the first tweet article on the page
 */
export function getFirstTweet(page: Page): Locator {
  return page.locator(sel.tweet).first();
}

/**
 * Extract tweet URL from a tweet element
 * Finds the timestamp link which contains the status URL
 */
export async function getTweetUrl(tweet: Locator): Promise<string | null> {
  const timestampLink = tweet.locator(sel.tweetTimestampLink).first();
  const isVisible = await timestampLink.isVisible({ timeout: config.timeouts.elementWait }).catch(() => false);

  if (!isVisible) return null;

  // Get the parent <a> element's href
  const link = timestampLink.locator('xpath=ancestor::a');
  const href = await link.getAttribute('href').catch(() => null);

  if (!href) return null;

  return href.startsWith('http') ? href : `https://x.com${href}`;
}

/**
 * Click a button within a tweet element by selector
 */
export async function clickTweetButton(tweet: Locator, selector: string, page: Page): Promise<void> {
  const button = tweet.locator(selector);
  await button.waitFor({ timeout: config.timeouts.elementWait });
  await button.click({ force: true });
  await page.waitForTimeout(config.timeouts.actionDelay);
}

/**
 * Toggle action (like/retweet) on a tweet
 * Handles the pattern: check if done → perform action → verify result
 */
export interface ToggleActionOptions {
  tweet: Locator;
  page: Page;
  /** Selector for button visible when action is already done */
  doneButtonSelector: string;
  /** Selector for button to click to perform action */
  actionButtonSelector: string;
  /** Human-readable action name for messages (e.g., 'Like', 'Retweet') */
  actionName: string;
  /** Optional callback for additional steps after clicking (e.g., confirm dialog) */
  onAfterClick?: () => Promise<void>;
}

export interface ToggleActionResult {
  success: boolean;
  message: string;
  alreadyDone?: boolean;
}

export async function toggleTweetAction(options: ToggleActionOptions): Promise<ToggleActionResult> {
  const { tweet, page, doneButtonSelector, actionButtonSelector, actionName, onAfterClick } = options;

  const doneButton = tweet.locator(doneButtonSelector);
  const actionButton = tweet.locator(actionButtonSelector);

  // Check if already done
  const alreadyDone = await doneButton.isVisible().catch(() => false);
  if (alreadyDone) {
    return {
      success: true,
      message: `Tweet already ${actionName.toLowerCase()}d`,
      alreadyDone: true
    };
  }

  // Perform action
  await actionButton.waitFor({ timeout: config.timeouts.elementWait });
  await actionButton.click({ force: true });
  await page.waitForTimeout(config.timeouts.actionDelay);

  // Run additional steps if provided
  if (onAfterClick) {
    await onAfterClick();
  }

  // Verify success
  const nowDone = await doneButton.isVisible().catch(() => false);
  if (nowDone) {
    return { success: true, message: `${actionName} successful` };
  }

  return {
    success: false,
    message: `${actionName} action completed but could not verify success`
  };
}
