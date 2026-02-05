#!/usr/bin/env npx tsx
/**
 * X Integration - Quote Tweet
 * Usage: echo '{"tweetUrl":"https://x.com/user/status/123","comment":"My thoughts"}' | npx tsx quote.ts
 */

import { getBrowserContext, navigateToTweet } from '../lib/browser.js';
import { runScript, ScriptResult } from '../lib/script.js';
import {
  validateTweetUrl,
  validateContent,
  getFirstTweet,
  clickTweetButton,
  fillDialogAndSubmit,
  truncateForDisplay
} from '../lib/utils.js';
import { config } from '../lib/config.js';

const btn = config.selectors.buttons;

interface QuoteInput {
  tweetUrl: string;
  comment: string;
}

async function quoteTweet(input: QuoteInput): Promise<ScriptResult> {
  const { tweetUrl, comment } = input;

  const urlError = validateTweetUrl(tweetUrl);
  if (urlError) return urlError;

  const validationError = validateContent(comment, 'Comment');
  if (validationError) return validationError;

  let context = null;
  try {
    context = await getBrowserContext();
    const { page, success, error } = await navigateToTweet(context, tweetUrl);

    if (!success) {
      return { success: false, message: error || 'Navigation failed' };
    }

    // Click retweet button to open menu (could be retweet or unretweet if already retweeted)
    const tweet = getFirstTweet(page);
    await clickTweetButton(tweet, `${btn.retweet}, ${btn.unretweet}`, page);

    // Click quote option
    const quoteOption = page.getByRole('menuitem').filter({ hasText: /Quote/i });
    await quoteOption.waitFor({ timeout: config.timeouts.elementWait });
    await quoteOption.click();
    await page.waitForTimeout(config.timeouts.actionDelay);

    // Fill dialog and submit
    const result = await fillDialogAndSubmit({
      page,
      content: comment,
      contentLabel: 'Comment'
    });

    if (!result.success) {
      return { success: false, message: result.error || 'Failed to submit quote' };
    }

    return {
      success: true,
      message: `Quote tweet posted: ${truncateForDisplay(comment)}`
    };

  } finally {
    if (context) await context.close();
  }
}

runScript<QuoteInput>(quoteTweet);
