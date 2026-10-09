<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep shared portal navigation and employee presentation in `PortalShell` so every feature route stays visually consistent.
- Resolve portal-wide store scope through access roles before professional unit assignments so administrative identity is never presented as store-limited.
- Employee portal pages live under the _authenticated layout, which redirects unapproved users to /aguardando; admin rights come only from the user_roles table (never profile fields) to prevent privilege escalation.
- Public entry routes share LoginScreen; store/legal catalogs are read from Cloud so signup and internal identity stay synchronized.
- Management and revenue reads use authenticated server functions with user-scoped RLS; review_employee performs atomic permission assignment and database triggers audit administrative mutations.
- Store, sector and employee revenues are separate integer-cent monthly records; reports never aggregate across dimensions to prevent duplicate revenue.
- Email link validation lives in auth-flow; public confirmation and recovery routes wait for SDK initialization and validate the auth user before proceeding, so ordinary sessions are not treated as password recovery.
- Signup is auto-confirmed and RH approval is the only access gate; privileged admin is granted only when an existing admin approves an allowlisted account, so nobody becomes admin just by registering an email.
