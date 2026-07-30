# DiaYar Admin API

This Cloudflare Worker provides the only write path for the public GitHub Pages
application. It authenticates the administrator with GitHub OAuth, accepts only
the configured GitHub login, validates the catalogue payload, and updates only
`apps/web/public/data/admin-catalog.json`.

Required Worker secrets:

- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `SESSION_SECRET` (a long random value)

Deployment outline:

1. Create a GitHub OAuth App. Set its callback URL to
   `https://shiny-block-9d4a.abbaselotfi.workers.dev/auth/callback`.
2. Review the non-secret values in `wrangler.jsonc`.
3. Run `pnpm --filter @diabeto/admin-worker exec wrangler login`.
4. Add each secret with
   `pnpm --filter @diabeto/admin-worker exec wrangler secret put <NAME>`.
5. Deploy with `pnpm --filter @diabeto/admin-worker deploy`.
6. Set the GitHub repository variable `NEXT_PUBLIC_ADMIN_API_URL` to the final
   Worker origin `https://shiny-block-9d4a.abbaselotfi.workers.dev` and re-run
   the Pages workflow.

After the feature branch is merged, change `GITHUB_BRANCH` from
`agent/secure-admin-publishing` to `main` and deploy the Worker once more.
