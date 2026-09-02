import { describe, expect, it } from 'vitest';
import { ApiError } from '../src/api/client';
import { en } from '../src/i18n/en';
import { describeFailure } from '../src/components/ReceiptDropzone';

/** The real dictionary, so a renamed key fails here rather than in front of a user. */
const t = (key: keyof typeof en) => en[key];

describe('describeFailure', () => {
  /**
   * The regression this guards: both failures used to produce "try a clearer
   * photo", which is advice a user cannot act on when the document was never
   * read in the first place.
   */
  it('says the reader is busy - and never blames the photo - on a 503', () => {
    const { message, canRetry } = describeFailure(
      new ApiError(503, 'reader_unavailable', 'The reader is busy right now.'),
      t,
    );

    expect(message).toContain('busy');
    // It may mention the photo - to rule it OUT. What it must never do is ask
    // for a better one, which is work the user cannot usefully do here.
    expect(message).toContain('not your photo');
    expect(message).not.toContain('clearer photo');
    expect(canRetry).toBe(true);
  });

  it('passes the server wording through on a 422, and offers no retry', () => {
    const { message, canRetry } = describeFailure(
      new ApiError(422, 'extraction_failed', 'Could not find an expense in that file.'),
      t,
    );

    expect(message).toBe('Could not find an expense in that file.');
    expect(canRetry).toBe(false);
  });

  /** A 500 is still not the document's fault, but retrying it is not promising. */
  it('declines to promise a retry for a failure that is not congestion', () => {
    expect(describeFailure(new ApiError(500, 'internal', 'boom'), t)).toEqual({
      message: en['receipt.unavailable'],
      canRetry: false,
    });
  });

  it('stays quiet when there is no error at all', () => {
    expect(describeFailure(undefined, t)).toEqual({ message: undefined, canRetry: false });
    expect(describeFailure(new Error('offline'), t).message).toBeUndefined();
  });
});
