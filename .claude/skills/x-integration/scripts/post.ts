#!/usr/bin/env npx tsx
/**
 * X Integration - Post Tweet
 * Usage: echo '{"content":"Hello world"}' | npx tsx post.ts
 */

import { getBrowserContext } from '../lib/browser.js';
import { runScript, ScriptResult } from '../lib/script.js';
import {
  checkLoginStatus,
  getFirstTweet,
  getTweetUrl,
  isButtonDisabled,
  validateContent
} from '../lib/utils.js';
import { config } from '../lib/config.js';

const sel = config.selectors;
const btn = sel.buttons;

interface PostInput {
  content: string;
}

async function postTweet(input: PostInput): Promise<ScriptResult> {
  const { content } = input;

  const validationError = validateContent(content, 'Tweet');
  if (validationError) return validationError;

  let context = null;
  try {
    context = await getBrowserContext();
    const page = context.pages()[0] || await context.newPage();

    await page.goto('https://x.com/home', { timeout: config.timeouts.navigation, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(config.timeouts.loadWait);

    // Check if logged in
    const { loggedIn, onLoginPage } = await checkLoginStatus(page);
    if (!loggedIn && onLoginPage) {
      return { success: false, message: 'X login expired. Run /x-integration to re-authenticate.' };
    }

    // Find and fill tweet input
    const tweetInput = page.locator(sel.tweetTextarea);
    await tweetInput.waitFor({ timeout: config.timeouts.elementWait * 2 });
    await tweetInput.click();
    await page.waitForTimeout(config.timeouts.shortPause);
    await tweetInput.type(content + ' ');  // Trailing space closes hashtag/mention popups
    await page.waitForTimeout(config.timeouts.actionDelay);

    // Get first tweet URL before posting (for comparison)
    const firstTweetBefore = getFirstTweet(page);
    const urlBefore = await getTweetUrl(firstTweetBefore);

    // Click post button
    const postButton = page.locator(btn.postInline);
    await postButton.waitFor({ timeout: config.timeouts.elementWait });

    if (await isButtonDisabled(postButton)) {
      return { success: false, message: 'Post button disabled. Content may be empty or exceed character limit.' };
    }

    await postButton.click({ force: true });
    await page.waitForTimeout(config.timeouts.loadWait);

    // Click "Show N posts" link if it appears (new tweets notification)
    const showPostsLink = page.getByText(/Show \d+ posts?/i).first();
    if (await showPostsLink.isVisible({ timeout: 2000 }).catch(() => false)) {
      await showPostsLink.click();
      await page.waitForTimeout(config.timeouts.actionDelay);
    }

    // Verify tweet was posted by comparing first tweet before/after
    const urlAfter = await getTweetUrl(getFirstTweet(page));

    if (!urlAfter) {
      return { success: false, message: 'Could not verify: unable to get tweet URL' };
    }

    if (urlAfter === urlBefore) {
      return { success: false, message: 'Tweet not posted: timeline unchanged after clicking post' };
    }

    return { success: true, message: `Tweet posted: ${urlAfter}` };

  } finally {
    if (context) await context.close();
  }
}

runScript<PostInput>(postTweet);
