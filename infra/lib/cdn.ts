import { RemovalPolicy, Stack } from 'aws-cdk-lib';
import type { HttpApi } from 'aws-cdk-lib/aws-apigatewayv2';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';
import type { Construct } from 'constructs';

const STRIP_API_PREFIX = [
  'function handler(event) {',
  '  var request = event.request;',
  "  request.uri = request.uri.replace(/^\\/api/, '');",
  "  if (request.uri === '') { request.uri = '/'; }",
  '  return request;',
  '}',
].join('\n');

export type CdnOptions = {
  readonly httpApi: HttpApi;
  readonly sitePath: string;
};

export function attachCdn(scope: Construct, { httpApi, sitePath }: CdnOptions): string {
  const stack = Stack.of(scope);

  const siteBucket = new s3.Bucket(scope, 'SiteBucket', {
    blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    encryption: s3.BucketEncryption.S3_MANAGED,
    enforceSSL: true,
    removalPolicy: RemovalPolicy.DESTROY,
    autoDeleteObjects: true,
  });

  const stripApiPrefix = new cloudfront.Function(scope, 'StripApiPrefix', {
    code: cloudfront.FunctionCode.fromInline(STRIP_API_PREFIX),
    runtime: cloudfront.FunctionRuntime.JS_2_0,
  });

  const apiDomain = `${httpApi.apiId}.execute-api.${stack.region}.${stack.urlSuffix}`;

  const distribution = new cloudfront.Distribution(scope, 'SiteDistribution', {
    defaultRootObject: 'index.html',
    defaultBehavior: {
      origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
    },
    additionalBehaviors: {
      '/api/*': {
        origin: new origins.HttpOrigin(apiDomain),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        functionAssociations: [
          { function: stripApiPrefix, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST },
        ],
      },
    },
    errorResponses: [
      { httpStatus: 403, responseHttpStatus: 200, responsePagePath: '/index.html' },
      { httpStatus: 404, responseHttpStatus: 200, responsePagePath: '/index.html' },
    ],
    priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
  });

  new BucketDeployment(scope, 'SiteDeployment', {
    sources: [Source.asset(sitePath)],
    destinationBucket: siteBucket,
    distribution,
    distributionPaths: ['/*'],
  });

  return `https://${distribution.distributionDomainName}`;
}
