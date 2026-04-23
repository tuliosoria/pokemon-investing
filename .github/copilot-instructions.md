# Pokemon Investing repository instructions

- Run `npm run verify` before considering work complete. This repo does not yet have a dedicated app test suite, so `verify` is the required safety check.
- Keep deployment-related files in sync. If you change `amplify.yml`, `.env.example`, `.githooks/*`, `infra/**`, or `Specs-Driven/DEPLOY_AWS.md`, update the matching docs or automation in the same change.
- Prefer shared repo automation over one-off commands. If a check should be repeated by humans and Copilot, add it to `package.json` or a committed hook instead of burying it in prose.
- Treat `main` as release-bound. Prefer verified pushes, and keep the repo hook installed with `npm run hooks:install` when working locally.
- When changing sealed ML scripts or model publication behavior, preserve the current runtime contract and update the operational docs when the release workflow changes.
