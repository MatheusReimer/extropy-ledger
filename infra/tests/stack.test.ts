import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import { beforeAll, describe, expect, it } from 'vitest';
import { ExpenseTrackerStack } from '../lib/expense-tracker-stack.js';

/**
 * The CloudFront variant, which production has never run.
 *
 * The deployed stack uses `-c lambdaOnly=true`, because a brand new AWS account
 * cannot create a distribution until AWS verifies it. That leaves the S3 +
 * CloudFront branch as code no environment has ever exercised - the worst kind
 * of code to have in a repository, because nothing contradicts it.
 *
 * These assertions are not a substitute for a deploy: CloudFormation can still
 * reject a template that synthesises. They do pin the parts that would fail
 * silently and confusingly - a cached API path, a missing prefix strip, an SPA
 * that 404s on a deep link - so the branch is at least verified in shape.
 */

const API_ENVIRONMENT = {
  MONGODB_URI: 'mongodb://localhost:27017/test',
  JWT_SECRET: 'test-secret-that-is-long-enough-for-hs256-abcdef',
};

let sitePath: string;

beforeAll(() => {
  // Stands in for `apps/web/dist`, so synthesising does not need a web build.
  sitePath = fs.mkdtempSync(path.join(os.tmpdir(), 'expense-site-'));
  fs.writeFileSync(path.join(sitePath, 'index.html'), '<!doctype html>');
});

const synth = (lambdaOnly: boolean): Template => {
  const app = new App({ context: lambdaOnly ? { lambdaOnly: 'true' } : {} });
  const stack = new ExpenseTrackerStack(app, 'ExpenseTrackerStack', {
    apiEnvironment: API_ENVIRONMENT,
    sitePath,
    env: { account: '123456789012', region: 'us-east-1' },
  });
  return Template.fromStack(stack);
};

describe('both variants', () => {
  it.each([true, false])('puts the API behind an HTTP API proxy route (lambdaOnly=%s)', (only) => {
    const template = synth(only);

    template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      RouteKey: 'ANY /{proxy+}',
    });
    template.hasResourceProperties('AWS::Lambda::Function', {
      Runtime: 'nodejs22.x',
      Handler: 'index.handler',
    });
  });

  /**
   * Memory is a CPU setting here, not a memory one.
   *
   * Lambda scales vCPU with memory, and the slowest thing on the critical path
   * is the scrypt password hash - deliberately expensive, and entirely CPU
   * bound. At 512 MB it had roughly a third of a core and dominated a login.
   */
  it.each([true, false])(
    'gives the function enough CPU to hash a password (lambdaOnly=%s)',
    (only) => {
      synth(only).hasResourceProperties('AWS::Lambda::Function', {
        MemorySize: 1024,
        Timeout: 30,
      });
    },
  );
});

describe('the deployed variant (lambdaOnly)', () => {
  it('serves the site from the Lambda and creates no CDN at all', () => {
    const template = synth(true);

    template.resourceCountIs('AWS::CloudFront::Distribution', 0);
    template.resourceCountIs('AWS::CloudFront::Function', 0);
    template.resourceCountIs('AWS::S3::Bucket', 0);
    template.hasResourceProperties('AWS::Lambda::Function', {
      Environment: { Variables: Match.objectLike({ SERVE_STATIC_DIR: '/var/task/site' }) },
    });
  });
});

describe('the CloudFront variant', () => {
  it('serves the site from a bucket that is closed to the public', () => {
    const template = synth(false);

    template.resourceCountIs('AWS::CloudFront::Distribution', 1);
    template.hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
    template.resourceCountIs('AWS::CloudFront::OriginAccessControl', 1);
  });

  it('does not tell the Lambda to serve static files', () => {
    const template = synth(false);

    const functions = template.findResources('AWS::Lambda::Function');
    const variables = Object.values(functions).flatMap((fn) => [
      (fn.Properties as { Environment?: { Variables?: Record<string, unknown> } }).Environment
        ?.Variables ?? {},
    ]);
    for (const vars of variables) expect(vars).not.toHaveProperty('SERVE_STATIC_DIR');
  });

  /**
   * Caching the API would be the expensive kind of wrong: a cached POST or a
   * cached authorised GET serves one user's data to another. The behaviour is
   * pinned to the managed caching-disabled policy by id, and to all-viewer
   * forwarding, because that is what carries the bearer token to the origin.
   */
  it('routes /api/* to the gateway with caching switched off', () => {
    synth(false).hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        CacheBehaviors: Match.arrayWith([
          Match.objectLike({
            PathPattern: '/api/*',
            CachePolicyId: cloudfront.CachePolicy.CACHING_DISABLED.cachePolicyId,
            OriginRequestPolicyId:
              cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER.originRequestPolicyId,
            ViewerProtocolPolicy: 'https-only',
            AllowedMethods: Match.arrayWith(['PATCH', 'POST', 'DELETE']),
          }),
        ]),
      }),
    });
  });

  /**
   * The prefix strip is why there is no CORS in production: the browser only
   * ever talks to one origin. If this function stopped being attached, every
   * request would reach the API as `/api/expenses` and 404.
   */
  it('strips the /api prefix at the edge, on the viewer request', () => {
    const template = synth(false);

    template.hasResourceProperties('AWS::CloudFront::Function', {
      FunctionCode: Match.stringLikeRegexp('request\\.uri\\.replace'),
    });
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        CacheBehaviors: Match.arrayWith([
          Match.objectLike({
            FunctionAssociations: [Match.objectLike({ EventType: 'viewer-request' })],
          }),
        ]),
      }),
    });
  });

  /** A client-side router means every deep link is a 404 the CDN must rewrite. */
  it('sends 403 and 404 back to the SPA entry point', () => {
    synth(false).hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        DefaultRootObject: 'index.html',
        CustomErrorResponses: Match.arrayWith([
          { ErrorCode: 403, ResponseCode: 200, ResponsePagePath: '/index.html' },
          { ErrorCode: 404, ResponseCode: 200, ResponsePagePath: '/index.html' },
        ]),
      }),
    });
  });
});
