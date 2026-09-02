import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import { HttpApi, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';
import type { Construct } from 'constructs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');

/** Rewrites /api/foo -> /foo before the request reaches API Gateway. */
const STRIP_API_PREFIX = [
  'function handler(event) {',
  '  var request = event.request;',
  "  request.uri = request.uri.replace(/^\\/api/, '');",
  "  if (request.uri === '') { request.uri = '/'; }",
  '  return request;',
  '}',
].join('\n');

export type ExpenseTrackerStackProps = StackProps & {
  /** Secrets come from the deployer's environment - see the note in the README. */
  readonly apiEnvironment: Record<string, string>;
};

/**
 * One stack: API plus site, because they share a lifecycle.
 *
 * Splitting them would only pay off if they were promoted at different cadences
 * - which is not the case for an MVP with a single deploy.
 */
export class ExpenseTrackerStack extends Stack {
  constructor(scope: Construct, id: string, props: ExpenseTrackerStackProps) {
    super(scope, id, props);

    /**
     * ONE Lambda with internal routing, rather than one per route.
     *
     * Ten functions mean ten independent cold starts and ten things to keep
     * warm; a single function concentrates traffic and keeps the container - and
     * the Mongo connection - hot. The cost is granularity: scaling and IAM are
     * per API rather than per route. For ten routes in one domain that is the
     * right trade, and it is what makes the local dev server possible running
     * exactly the same code.
     */
    // An explicit log group rather than the `logRetention` prop: that prop is
    // deprecated and provisions an extra custom-resource Lambda purely to set a
    // retention value. One week keeps CloudWatch inside the free tier.
    const apiLogs = new LogGroup(this, 'ApiLogs', {
      retention: RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    /**
     * Whether to skip CloudFront and let the Lambda serve the site itself.
     *
     * Set with `-c lambdaOnly=true`. It exists because a new AWS account cannot
     * create CloudFront distributions until AWS verifies it - a hold that can
     * take a day - and a deployed app with no URL is worth less than a slightly
     * inefficient one. API Gateway still provides real HTTPS on its own domain,
     * so nothing is served over plain HTTP.
     *
     * The cost is honest: every asset request wakes a Lambda rather than hitting
     * an edge cache. Fine for a demo, wrong for traffic - which is why it is a
     * flag and not the default.
     */
    const lambdaOnly = this.node.tryGetContext('lambdaOnly') === 'true';
    const sitePath = path.join(repoRoot, 'apps/web/dist');

    const api = new NodejsFunction(this, 'ApiFunction', {
      entry: path.join(repoRoot, 'apps/api/src/lambda.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_22_X,
      // scrypt is CPU-expensive on purpose, and Lambda scales CPU with memory,
      // so 512 MB is what keeps a login under roughly 200 ms.
      memorySize: 512,
      // 30 s is API Gateway's own integration ceiling, so there is no point
      // going higher: receipt extraction runs 1-5 s healthy, but a congested
      // free tier has been measured at 17 s, and the request budget is 25 s.
      timeout: Duration.seconds(30),
      environment: {
        NODE_OPTIONS: '--enable-source-maps',
        // Unset unless this is the CloudFront-less variant; the static handler
        // in the API keys off exactly this.
        ...(lambdaOnly ? { SERVE_STATIC_DIR: '/var/task/site' } : {}),
        ...props.apiEnvironment,
      },
      logGroup: apiLogs,
      bundling: {
        format: OutputFormat.ESM,
        target: 'node22',
        minify: true,
        sourceMap: true,
        // Some packages still call require() internally; without this banner the
        // ESM bundle fails at runtime with "require is not defined".
        banner: "import{createRequire}from'module';const require=createRequire(import.meta.url);",
        // Copies the built site in beside the handler. esbuild has no idea these
        // files exist - they are read at runtime, never imported.
        ...(lambdaOnly
          ? {
              commandHooks: {
                beforeBundling: () => [],
                beforeInstall: () => [],
                afterBundling: (_input: string, output: string) => [
                  // Source maps are excluded: the static handler will not serve
                  // them anyway (`.map` is not a recognised type), and they are
                  // five of the seven megabytes - paid on every cold start.
                  `node -e "const f=require('node:fs');f.cpSync(process.argv[1],process.argv[2],{recursive:true,filter:(s)=>!s.endsWith('.map')})" "${sitePath}" "${output}/site"`,
                ],
              },
            }
          : {}),
      },
    });

    const httpApi = new HttpApi(this, 'HttpApi', {
      // CORS lives in the application, not here, so local dev and production
      // use exactly the same allowlist from the same environment variable.
      defaultIntegration: new HttpLambdaIntegration('ApiIntegration', api),
    });
    httpApi.addRoutes({
      path: '/{proxy+}',
      methods: [HttpMethod.ANY],
      integration: new HttpLambdaIntegration('ProxyIntegration', api),
    });

    /**
     * Everything below is the CloudFront path, and it is skipped entirely when
     * the Lambda is serving the site itself. Two shapes, one stack: the fallback
     * is a flag rather than a fork of the infrastructure, so it cannot rot in a
     * branch nobody deploys.
     */
    let siteHost: string;

    if (lambdaOnly) {
      siteHost = httpApi.apiEndpoint;
    } else {
      const siteBucket = new s3.Bucket(this, 'SiteBucket', {
        // Never public: access is only through CloudFront's Origin Access Control.
        blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
        encryption: s3.BucketEncryption.S3_MANAGED,
        enforceSSL: true,
        removalPolicy: RemovalPolicy.DESTROY,
        autoDeleteObjects: true,
      });

      /**
       * Rewriting /api/* to /* at the edge.
       *
       * Without this the frontend would need the API Gateway URL at BUILD time,
       * and that URL only exists after the deploy - the classic chicken-and-egg
       * usually solved with two deploys or a custom domain. Serving the API under
       * the site's own host makes VITE_API_URL just "/api" and the problem
       * disappears: one origin, no CORS in production, one deploy.
       */
      const stripApiPrefix = new cloudfront.Function(this, 'StripApiPrefix', {
        code: cloudfront.FunctionCode.fromInline(STRIP_API_PREFIX),
        runtime: cloudfront.FunctionRuntime.JS_2_0,
      });

      const apiDomain = `${httpApi.apiId}.execute-api.${this.region}.${this.urlSuffix}`;

      const distribution = new cloudfront.Distribution(this, 'SiteDistribution', {
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
            // API responses are per-user - caching them would serve one person's
            // expenses to another. The Host header has to be stripped, or API
            // Gateway rejects the request for not recognising the CloudFront domain.
            cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
            originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
            functionAssociations: [
              { function: stripApiPrefix, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST },
            ],
          },
        },
        // SPA: a client-side path is not an object in S3, so 403/404 return the
        // index and the app resolves the route itself.
        errorResponses: [
          { httpStatus: 403, responseHttpStatus: 200, responsePagePath: '/index.html' },
          { httpStatus: 404, responseHttpStatus: 200, responsePagePath: '/index.html' },
        ],
        priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      });

      new BucketDeployment(this, 'SiteDeployment', {
        sources: [Source.asset(path.join(repoRoot, 'apps/web/dist'))],
        destinationBucket: siteBucket,
        distribution,
        // Without invalidation the deploy succeeds and users keep the old bundle.
        distributionPaths: ['/*'],
      });

      siteHost = `https://${distribution.distributionDomainName}`;
    }

    new CfnOutput(this, 'WebUrl', { value: siteHost });
    new CfnOutput(this, 'ApiUrl', { value: `${siteHost}/api` });
    new CfnOutput(this, 'ApiGatewayUrl', { value: httpApi.apiEndpoint });
  }
}
