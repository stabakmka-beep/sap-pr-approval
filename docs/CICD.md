# Continuous integration and delivery

This project has two ways to build, test, and deploy the MTA. Pick one deployer. If both deploy into the same Cloud Foundry space on every push to `main`, the second deploy can abort or fight the first. The last section says how to leave one of them not deploying.

Both pipelines assume the same target you would use for a manual deploy: a space with a HANA Cloud instance available for the `hdi-shared` plan, and entitlements for XSUAA `application`, Destination `lite`, Connectivity `lite`, and HTML5 Application Repository `app-host` and `app-runtime`. See the deploy section of the [README](../README.md).

| | SAP Continuous Integration and Delivery | GitHub Actions |
| --- | --- | --- |
| Config | [`.sap_cid/config.yaml`](../.sap_cid/config.yaml) | [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) |
| When it runs | Push to the branch named on the job (use `main`), after the webhook is connected. Also when you choose Run. | Every pull request and every push. |
| Build | MTA build with `MBTJ21N22` (Cloud MTA Build Tool, Java 21, Node 22). | `mbt` 1.2.50, Node 22. |
| Tests | Additional unit tests stage runs `npm test` (Jest, in-memory SQLite). | `npm test` on the verify job. |
| Deploy | Acceptance stage, `cfDeploy`, credential `cf-deploy-credentials`. | `cf deploy mta_archives/*.mtar -f` on push to `main`, or when you run the workflow by hand. |
| Until you finish setup | The job does not exist, so nothing deploys. | Tests and the MTA build still run. Deploy prints a skip notice and the workflow stays green. |

`package.json` has `test` and no `lint` script. ESLint is not installed as a project dependency. The flat config in `eslint.config.mjs` is for the editor. Neither pipeline runs a separate lint. To add the service's lint check later, put this under `stages.build` in `.sap_cid/config.yaml`:

```yaml
npmLint:
  failOnError: true
```

The service runs that check only when the repository contains a lint config and JavaScript or TypeScript files.

## Deployer user

Use a dedicated platform user for deploy, not a person's daily login. SAP Continuous Integration and Delivery and `cf login -u -p` both need a user that can authenticate without an interactive second factor.

Create the user in the subaccount (Security, Users) with the identity provider you will log in as. Then add that user to the target space as **Space Developer** (Cloud Foundry, the org, the space, Members). Space Developer is the role `cf deploy` needs: it creates service instances, pushes the apps, and binds them. The user must also be a member of the org. Do not grant Org Manager, Subaccount Administrator, or the CI/CD administrator role to this user. Space Developer on this one space is enough.

Password login and two-factor authentication:

- GitHub Actions runs `cf login -a "$CF_API" -u "$CF_USERNAME" -p "$CF_PASSWORD"`. That call cannot answer a one-time passcode or an authenticator prompt. If Cloud Foundry answers with a passcode or SSO challenge, the deploy job fails. Use a platform user whose identity provider accepts a password and does not require a second factor for that login.
- A password with no second factor is a long-lived secret. Keep it only in the CI/CD credential and in GitHub Actions secrets. Rotate it. Do not reuse a personal account, and do not grant the user more than Space Developer.
- SAP's recommendation for the Continuous Integration and Delivery service, when the subaccount uses a custom identity provider, is a **Certificate-Based Authentication for Custom IdP** credential. That type does not share a password, and the service rotates it. It does not apply to the GitHub Actions workflow in this repo, which only has username and password secrets. With a custom IdP and a password, create **Basic Authentication for Custom IdP** instead of plain Basic Authentication, and set the origin key from the Cloud Foundry org members list (Origin column).

The API endpoint is on the subaccount overview, for example `https://api.cf.eu10.hana.ondemand.com`. The org name is on that same overview. The space name is the Cloud Foundry space you targeted.

## SAP Continuous Integration and Delivery

The file the service reads is [`.sap_cid/config.yaml`](../.sap_cid/config.yaml). The steps below follow the current service guide: [SAP Continuous Integration and Delivery](https://help.sap.com/docs/continuous-integration-and-delivery), section "Configure a Cloud Foundry Environment Job in Your Repository".

Pipeline version 3 (current since the version 2 migration on 15 January 2026) dropped `.pipeline/config.yml`. In the job editor the pipeline is **Cloud Foundry Environment**. That is the pipeline a CAP project on Cloud Foundry uses. There is no separate "SAP Cloud Application Programming Model" pipeline in the current service. `buildTool: mta` is what makes the job build this MTA.

Supported build tool versions are listed under Supported Tools in the service documentation. This repo requires Node.js 22, so the config pins `MBTJ21N22`.

### 1. Subscribe

You need the Subaccount Administrator role collection to subscribe.

1. In the subaccount, open Services, Service Marketplace.
2. Open **Continuous Integration & Delivery**. If the tile is missing, add the entitlement from the global account (Configure Entitlements).
3. Create a subscription. Plans:
   - `default` for a normal enterprise subscription.
   - `build-runtime` when you use the service as part of SAP Build. SAP recommends this plan in that case.
   - `free` for the free tier. Limits that matter here: two jobs, one build at a time, and 10 compute hours per rolling 30 days. A job that is not changed for a week is turned off. You can turn it back on.

Creating a service instance and a service key is only required if you want to call the CI/CD API. The UI setup below does not need one.

### 2. Assign roles

The subscription adds two role collections:

| Role collection | Use it for |
| --- | --- |
| `CICD Service Administrator` | The person who creates credentials, connects the repository, and creates the job. |
| `CICD Service Developer` | People who should view the job and trigger builds, and should not create credentials. |

In the subaccount: Security, Users, the user, Assign Role Collection. Log off and on again so the assignment applies immediately. Administrators can read credentials back out of a build, so treat every administrator as someone who can use the deploy credential. Prefer one subscription per team rather than one subscription for a whole company.

### 3. Create credentials

Credentials are created in the service UI: Credentials, Create. A name starts and ends with a letter or digit and contains only lowercase letters, digits, hyphens, and dots.

Create these:

| Name | Type | Values |
| --- | --- | --- |
| `github-clone` | Basic Authentication | Only for a private repository. Username is the GitHub user. Password is a fine-grained personal access token with access to this repository only, and repository permissions Contents (read), Metadata (read), Pull requests (read), and Commit statuses (read). A classic token with the `repo` scope also works. The token is shown once. |
| `github-webhook` | Webhook Secret | Choose Generate, then copy the secret before you close the dialog. It is not shown again. |
| `cf-deploy-credentials` | Basic Authentication, Basic Authentication for Custom IdP, or Certificate-Based Authentication for Custom IdP | The deployer user from the previous section. The name must match `credential` in `.sap_cid/config.yaml`. Username and password for the first two types. For a custom IdP password login, also set the origin key. For the certificate type, set the technical user's email, the identity provider hostname, and the origin key, then register the distinguished-name pattern the service shows on the credential. |

Leave the clone credential empty when the repository is public.

### 4. Connect the GitHub repository

Repositories, Add:

| Field | Value |
| --- | --- |
| Name | `purchase-request` (any unique name) |
| Clone URL | `https://github.com/<org>/sap-pr-approval.git`. HTTPS, with no password in the URL. |
| Credentials | `github-clone` for a private repository. Empty for a public repository. |
| Webhook event receiver type | GitHub |
| Webhook credential | `github-webhook` |
| Webhook state | ON |

The repository detail then shows Webhook Data: a payload URL and a content type (use the content type the service shows, which is JSON).

In GitHub: the repository, Settings, Webhooks, Add webhook.

| Field | Value |
| --- | --- |
| Payload URL | From Webhook Data |
| Content type | From Webhook Data |
| Secret | The secret you copied from `github-webhook` |
| Events | Just the push event |
| Active | Selected |

Push events on the branch you configure trigger the job. Pull requests do not. GitHub Actions is what runs on pull requests.

### 5. Put the real target in the config

On `main`, edit `.sap_cid/config.yaml` and replace the three placeholders:

```yaml
apiEndpoint: "https://api.cf.<region>.hana.ondemand.com"
org: "<org>"
space: "<space>"
```

`apiEndpoint` is the Cloud Foundry API endpoint, including `https://`. `org` and `space` are the names, not the GUIDs. Leave `credential: "cf-deploy-credentials"` unless you created the credential under another name. The deploy is in the acceptance stage on purpose, so the archive is not deployed a second time from a release stage.

Commit that change to `main` before the first successful deploy. The service reads the file from the branch the job builds.

### 6. Create the job

Jobs, Create:

| Field | Value |
| --- | --- |
| Job name | `purchase-request-main` |
| Repository | `purchase-request` |
| Branch | `main` |
| Pipeline | Cloud Foundry Environment |
| Configuration mode | Source Repository |
| State | ON |

Source Repository mode ignores the stage editor. Stages come from `.sap_cid/config.yaml`. After you save, the job does not run until a push arrives or you start it.

Build retention can stay at the defaults (up to 28 days and 99 builds).

### 7. Run the first deploy

1. Confirm the space has a HANA Cloud instance the `hdi-shared` plan can use, and the entitlements listed above.
2. Open the job and choose Run. The first run is manual even when the webhook is in place, so you can watch it.
3. The build stage runs the MTA build (`npm ci --include=dev`, `cds build --production`, `scripts/pack-html5.mjs`). Additional unit tests run `npm test`. Malware scan scans the build result. Acceptance deploys with `cf-deploy-credentials`.
4. When it is green, assign the role collections from `xs-security.json` (`PR_Requester`, `PR_Approver`, `PR_FinanceApprover`, `PR_Admin`) and create the `S4HANA` destination, as in the README. The pipeline does not do either of those.

Later pushes to `main` trigger the same job through the webhook. A job on the free plan or in a trial account that is left unchanged for a week is switched off. Turn it back on from the job.

## GitHub Actions

The workflow file is [`.github/workflows/ci.yml`](../.github/workflows/ci.yml).

On every pull request and every push:

1. `npm ci`
2. `npm test` (whatever script `test` points at; today that is Jest in `test/purchase-request.test.js`)
3. `mbt build` (version 1.2.50)

The MTA archive is uploaded as the artifact `mta-archive` and kept for five days.

Deploy runs only when the event is a push to `main`, or you start the workflow with **Run workflow** (`workflow_dispatch`). Run workflow builds and deploys the branch you select. Use `main` unless you intend to deploy another branch. The deploy job uses a concurrency group named `purchase-request-cf-deploy` and does not cancel an in-progress deploy, so two deploys wait instead of overlapping. That group does not coordinate with the SAP service. The deploy command is `cf deploy mta_archives/*.mtar -f`. `-f` tells the multiapps plugin to continue without asking when another deploy operation is still active, which would otherwise wait for a person to answer. The workflow installs Cloud Foundry CLI 8.19.0 and the `multiapps` plugin from the CF-Community repository (3.12.0 when this workflow was checked).

### Secrets

In the GitHub repository: Settings, Secrets and variables, Actions, New repository secret. Create all five. Names are case-sensitive.

| Secret | Value |
| --- | --- |
| `CF_API` | Cloud Foundry API endpoint, for example `https://api.cf.eu10.hana.ondemand.com` |
| `CF_ORG` | Org name |
| `CF_SPACE` | Space name |
| `CF_USERNAME` | Deployer user name (usually the email) |
| `CF_PASSWORD` | That user's password |

If any one of them is empty, the deploy job logs `Cloud Foundry deploy skipped`, lists the missing names, and exits successfully. Forks do not receive these secrets, so a pull request from a fork only runs the test and build job. The same skip keeps `main` green before you have created the secrets.

The deployer user is the one in the previous section: Space Developer, and a password login that does not stop for a second factor. If `cf login` fails asking for a passcode, that user has two-factor authentication and this workflow cannot deploy with it.

### First deploy

1. Add the five secrets.
2. Either push a commit to `main`, or open Actions, CI, Run workflow, and select `main`.
3. The verify job must be green. The deploy job logs in and runs `cf deploy`. The first HANA deploy is the long part.
4. Assign the application role collections and create the `S4HANA` destination, as in the README.

## Use one deployer

Both pipelines, once fully configured, deploy on every push to `main`. They do not share a lock. Point them at different spaces, or turn deploy off on one of them.

Leave the SAP service as the deployer:

- Do not create the five GitHub secrets. The Actions deploy job skips and stays green. Pull-request checks still run.
- Or, in GitHub, open Actions, CI, and the `...` menu, Disable workflow. That also stops the pull-request tests.

Leave GitHub Actions as the deployer:

- In the SAP service, open the job, Edit, and switch the job OFF. The webhook can stay. An off job does not build or deploy. Switch it ON later if you want the service to take over.
- Or delete the `acceptance` block from `.sap_cid/config.yaml` if you still want the service to build and test on push, and you want GitHub Actions to be the only deployer. Push that change to `main`.

Editing the placeholders back to `<org>` and `<space>` also stops a successful SAP deploy, but the job then fails in the acceptance stage. Switching the job off is the clean switch.

## What has to wait for a real subaccount

The workflow and the MTA build can be checked without BTP credentials. Login, `cf deploy`, the service subscription, the webhook, and a green job in the SAP UI cannot. Those need the credential `cf-deploy-credentials`, the five GitHub secrets, the Space Developer user, and the entitlements above.
