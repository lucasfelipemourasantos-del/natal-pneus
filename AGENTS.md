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
- Employee portal pages live under the _authenticated layout, which redirects unapproved users to /aguardando; admin rights come only from the user_roles table (never profile fields) to prevent privilege escalation.
