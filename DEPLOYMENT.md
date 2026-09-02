# Deployment

Status, what is already done, and the one thing currently blocking a live URL.

---

## Status: deployed, in the Lambda-served variant

**Live: https://k7dptwm6x7.execute-api.us-east-1.amazonaws.com**

CloudFront is still held (see below), so the deploy runs with `-c lambdaOnly=true`: the same
Lambda that serves the API also serves the built site, and API Gateway supplies HTTPS on its own
domain. Verified in production - signup, category seeding, expense create, summary, budget,
delete and the auth rejection all pass against the real Atlas cluster, with warm requests
between 0.4 s and 0.8 s.

```bash
pnpm build && cd infra && npx cdk deploy -c lambdaOnly=true
```

**What it costs, stated plainly.** Every asset request wakes a Lambda instead of hitting an edge
cache, so first paint is slower and each file is an invocation. For a demo that is invisible;
for real traffic it would be the wrong answer. The site bundle is 1.2 MB with source maps
excluded - they would be five of seven megabytes, paid on every cold start, and the static
handler refuses to serve `.map` anyway.

**Switching back is one flag.** Drop `-c lambdaOnly=true` once CloudFront clears and the stack
builds the S3 + CloudFront shape instead. Both live in one stack rather than a branch, so the
fallback cannot rot unused.

## The CloudFront hold, still open

`pnpm deploy` reaches CloudFormation, creates fourteen resources, and fails on the fifteenth —
the CloudFront distribution:

```
Your account must be verified before you can add new CloudFront resources.
To verify your account, please contact AWS Support.
(Service: CloudFront, Status Code: 403, Request ID: 4f7d6a00-947c-4d96-b11c-a0ce370de9ef)
```

This is AWS's anti-abuse hold on newly created accounts. The stack rolled back cleanly — no
orphaned resources, nothing billable left behind.

### Why we are confident it is not a misconfiguration

`HandlerErrorCode: AccessDenied` is CloudFormation's bucket for *any* 403, so the message alone
does not distinguish "your credentials are wrong" from "your account is held". Four checks
separate them, and all four point the same way:

| Check | Result |
| --- | --- |
| Policy on the deploy user | `AdministratorAccess` |
| `iam simulate-principal-policy` for `cloudfront:CreateDistribution` | **allowed** |
| CloudFront API reachable | yes — `list-distributions` returns a count, not an error |
| **Created a CloudFront OAC directly with the same credentials** | **succeeded**, then deleted |

That last one is the decisive one: the credentials can create CloudFront resources. Only
*distributions* are refused.

The ordering says the same thing. A credentials or configuration mistake fails on the **first**
resource. This deploy created an S3 bucket, three IAM roles, a Lambda, a log group, an HTTP API
and a CloudFront Function before stopping — so everything up to that point was accepted.

An IAM denial also reads differently. It names the principal:

```
User: arn:aws:iam::…:user/cdk-deploy is not authorized to perform: cloudfront:CreateDistribution
```

Ours names no principal and states a precondition instead.

### Clearing it

AWS Support → **Create case** → **Account and billing** (free on Basic support; technical cases
are not) → Service **Account** → Category **Other Account Issues**. Include the account ID, the
region, and the Request ID from the error above.

There is no published SLA on Basic support. In practice this class of case is usually answered
within hours, occasionally up to a day or two.

**Once it clears, `pnpm deploy` (without the flag) moves to the CloudFront shape.** Nothing in
the application changes - only which resources the stack creates.

Attempted twice so far; the second attempt returned the identical error with Request ID
`bdf41366-8486-4bfd-89c0-0cd2d313aea6`.

---

## What is already done

| | |
| --- | --- |
| Code committed and pushed | `github.com/MatheusReimer/extropy-ledger` |
| AWS account | created |
| IAM user `cdk-deploy` | created, `AdministratorAccess`, access keys in `aws configure` |
| Region | `us-east-1`, aligned across the CLI profile and `CDK_DEFAULT_REGION` |
| `cdk bootstrap` | **done** — `aws://479100079919/us-east-1`, survives the rollback |
| `.env` | complete and verified against the live database |

Bootstrap does not need repeating.

---

## Two traps already hit, recorded so they are not hit twice

### The region has to agree in two places

`infra/bin/app.ts` loads `.env`, so `CDK_DEFAULT_REGION` decides what the **stack** targets,
while the AWS CLI profile decides what `cdk bootstrap` **prepares**. Set one and not the other
and the deploy fails with "the toolkit stack must be deployed in <region>" — a confusing message
for what is really a two-places-disagree problem.

```bash
aws configure get region          # what bootstrap prepares
grep CDK_DEFAULT_REGION .env      # what the stack targets
```

They must match.

### `mongodb+srv://` fails on a machine that cannot resolve SRV

Atlas hands you a `mongodb+srv://` URI by default. It needs a DNS SRV lookup before it can
connect at all, and a resolver that refuses SRV records produces:

```
querySrv ECONNREFUSED _mongodb._tcp.<cluster>.mongodb.net
```

Use the seed-list form instead — Atlas → **Connect → Drivers → Node.js 2.2.12 or later** — which
names the hosts directly and needs no SRV lookup:

```
mongodb://<user>:<pass>@host-00:27017,host-01:27017,host-02:27017/?ssl=true&replicaSet=<rs>&authSource=admin
```

If Atlas will not show you that form, the hosts and replica-set name can be resolved through a
public resolver:

```bash
node -e "const d=require('node:dns');const r=new d.promises.Resolver();r.setServers(['8.8.8.8']);
r.resolveSrv('_mongodb._tcp.<cluster>.mongodb.net').then(console.log);
r.resolveTxt('<cluster>.mongodb.net').then(t=>console.log(t.flat().join('')));"
```

---

## Before the retry

- [ ] **Rotate the Atlas password.** Atlas → Database Access → edit the user → Edit Password →
      Autogenerate, then update `MONGODB_URI` in `.env`. Do it *before* deploying: `pnpm deploy`
      copies `MONGODB_URI` into the Lambda's environment, so rotating afterwards means deploying
      twice.
- [ ] **Atlas → Network Access → IP Access List → `0.0.0.0/0`.** A Lambda has no fixed egress IP.
      If the list is still restricted to a home address the deployed API cannot reach the
      database, and the failure looks exactly like an application bug. The password is the real
      gate, which is the other reason to rotate it.
- [ ] Confirm the region check above still agrees.

## After the deploy

The stack prints three outputs:

```
ExpenseTrackerStack.WebUrl         https://<distribution>.cloudfront.net
ExpenseTrackerStack.ApiUrl         https://<distribution>.cloudfront.net/api
ExpenseTrackerStack.ApiGatewayUrl  https://<id>.execute-api.us-east-1.amazonaws.com
```

- [ ] Put `WebUrl` into the **Live app** row at the top of `README.md`.
- [ ] Sign up on the deployed app and add one expense, to prove the Lambda reaches Atlas.
- [ ] Upload the sample receipt, to prove the AI path works with the deployed keys.

`pnpm destroy` removes everything except the bootstrap stack.

---

## If verification does not clear in time

There is a fallback — serve the site straight from S3 and call API Gateway directly — but it is
a real downgrade and should be a last resort:

- **S3 website endpoints are HTTP only.** HTTPS in front of S3 *is* CloudFront. Serving a login
  form over plain HTTP is the wrong trade on an application that holds a bearer token.
- It splits the app across two origins, which means real CORS instead of the single-host design
  the README explains — and `CORS_ORIGINS` exists for exactly that case, but it is more moving
  parts, not fewer.

Waiting for verification is almost always the better call.
