#!/usr/bin/env npx tsx
/**
 * X Integration - Reply to Tweet
 * Usage: echo '{"tweetUrl":"https://x.com/user/status/123","content":"Great post!"}' | npx tsx reply.ts
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

interface ReplyInput {
  tweetUrl: string;
  content: string;
}

async function replyToTweet(input: ReplyInput): Promise<ScriptResult> {
  const { tweetUrl, content } = input;

  const urlError = validateTweetUrl(tweetUrl);
  if (urlError) return urlError;

  const validationError = validateContent(content, 'Reply');
  if (validationError) return validationError;

  let context = null;
  try {
    context = await getBrowserContext();
    const { page, success, error } = await navigateToTweet(context, tweetUrl);

    if (!success) {
      return { success: false, message: error || 'Navigation failed' };
    }

    // Click reply button
    const tweet = getFirstTweet(page);
    await clickTweetButton(tweet, btn.reply, page);
    await page.waitForTimeout(config.timeouts.shortPause);

    // Fill dialog and submit
    const result = await fillDialogAndSubmit({
      page,
      content,
      contentLabel: 'Reply'
    });

    if (!result.success) {
      return { success: false, message: result.error || 'Failed to submit reply' };
    }

    return {
      success: true,
      message: `Reply posted: ${truncateForDisplay(content)}`
    };

  } finally {
    if (context) await context.close();
  }
}

runScript<ReplyInput>(replyToTweet);
