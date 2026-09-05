import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import { HttpApi, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import type { Construct } from 'constructs';
import { attachCdn } from './cdn.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');

export type ExpenseTrackerStackProps = StackProps & {
  readonly apiEnvironment: Record<string, string>;
  readonly sitePath?: string;
};

export class ExpenseTrackerStack extends Stack {
  constructor(scope: Construct, id: string, props: ExpenseTrackerStackProps) {
    super(scope, id, props);

    const apiLogs = new LogGroup(this, 'ApiLogs', {
      retention: RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const lambdaOnly = this.node.tryGetContext('lambdaOnly') === 'true';
    const sitePath = props.sitePath ?? path.join(repoRoot, 'apps/web/dist');

    const api = new NodejsFunction(this, 'ApiFunction', {
      entry: path.join(repoRoot, 'apps/api/src/lambda.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_22_X,
      memorySize: 1024,
      timeout: Duration.seconds(30),
      environment: {
        NODE_OPTIONS: '--enable-source-maps',
        ...(lambdaOnly ? { SERVE_STATIC_DIR: '/var/task/site' } : {}),
        ...props.apiEnvironment,
      },
      logGroup: apiLogs,
      bundling: {
        format: OutputFormat.ESM,
        target: 'node22',
        minify: true,
        sourceMap: true,
        banner: "import{createRequire}from'module';const require=createRequire(import.meta.url);",
        ...(lambdaOnly
          ? {
              commandHooks: {
                beforeBundling: () => [],
                beforeInstall: () => [],
                afterBundling: (_input: string, output: string) => [
                  `node -e "const f=require('node:fs');f.cpSync(process.argv[1],process.argv[2],{recursive:true,filter:(s)=>!s.endsWith('.map')})" "${sitePath}" "${output}/site"`,
                ],
              },
            }
          : {}),
      },
    });

    const httpApi = new HttpApi(this, 'HttpApi', {
      defaultIntegration: new HttpLambdaIntegration('ApiIntegration', api),
    });
    httpApi.addRoutes({
      path: '/{proxy+}',
      methods: [HttpMethod.ANY],
      integration: new HttpLambdaIntegration('ProxyIntegration', api),
    });

    const siteHost = lambdaOnly ? httpApi.apiEndpoint : attachCdn(this, { httpApi, sitePath });

    new CfnOutput(this, 'WebUrl', { value: siteHost });
    new CfnOutput(this, 'ApiUrl', { value: `${siteHost}/api` });
    new CfnOutput(this, 'ApiGatewayUrl', { value: httpApi.apiEndpoint });
  }
}
