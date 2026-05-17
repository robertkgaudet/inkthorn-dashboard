Add this to CLAUDE.md in BOTH repos:
C:\code\textos-web\CLAUDE.md
C:\code\textos-agent\CLAUDE.md

## ROLES — CLAUDE vs CLAUDE CODE

Claude (claude.ai) is the ARCHITECT.
Claude Code is the IMPLEMENTER.

Claude's job:
- Write briefs that specify WHAT to build and WHY
- Define constraints, patterns to follow, files to touch
- Reference existing working code as the pattern
- Define how to verify success
- Never write specific code implementations

Claude Code's job:
- Figure out HOW to implement the brief
- Write the actual code
- Run, test, and verify the implementation
- Deploy and report results

Claude should NEVER write specific function bodies,
line-by-line fixes, or copy-paste code blocks.
Claude Code should NEVER implement without understanding
the existing architecture first.

---

## DAILY ARCHITECTURE REVIEW (once per 24 hours)

At the start of each day or new session, Claude Code must:

1. Read CLAUDE.md in both repos (this file)
2. Review these areas of the codebase for changes:
   - Reusable components (src/components/)
   - Shared scripts (src/scripts/)
   - Layout patterns (src/layouts/)
   - API patterns (src/routes/ in agent)
   - Data access patterns (Supabase queries)
   - Auth patterns (how session is read)
   - Navigation patterns (BaseLayout, Nav.astro)
   - _redirects routing rules (public/_redirects)
   - Environment variables (.env, wrangler.toml)

3. Before writing ANY new code, ask:
   - Does a component already exist for this?
   - Does a function already exist for this?
   - What is the established pattern for this type of page?
   - What is the routing pattern for this page type?
   - Are there shared styles I should use?
   - Is there an existing data access pattern?
   - Is there an existing auth pattern?

4. If uncertain about any pattern, READ the existing
   working implementation BEFORE writing new code.
   Never assume. Always verify.

---

## RESEARCH BEFORE CODE — NON-NEGOTIABLE

Before writing code for ANY new feature:

STEP 1 — Search for existing patterns
  Does a similar feature already exist in the codebase?
  Read it fully before writing anything new.

STEP 2 — Understand the architecture constraints
  Read public/_redirects before creating new pages
  Read wrangler.toml before touching worker config
  Read CLAUDE.md before starting any task

STEP 3 — Identify reusable elements
  Components, functions, styles, API calls, auth patterns
  If it exists, use it. Never reinvent.

STEP 4 — Only then write code
  Implementing without researching = wasted time.
  Rob's time is the most valuable resource.

---

## KEY ARCHITECTURE RULES (memorize these)

ROUTING — NON-NEGOTIABLE:
All /business/{slug}/* pages use this pattern:
1. Static prerendered page at /business/pagename.astro
2. Rewrite in public/_redirects:
   /business/*/pagename    /business/pagename/    200
3. Page reads slug from localStorage:
   textos_last_biz_{userId}

NEVER use dynamic [slug] routes under /business/
NEVER use prerender = false under /business/
NEVER use _routes.json includes for /business/* patterns

SCRIPT PATTERN for standalone pages:
- Supabase CDN via is:inline script in <head>
- Env vars via define:vars block → expose as window globals
- Main script as plain <script> (not type="module")
- No ES module imports inside define:vars blocks

DEPLOY PATTERN:
- Test first: npm run deploy:test
- Verify at: https://textos-web-test.pages.dev
- Never report hash preview URLs
- Never deploy to prod without Rob's explicit approval

TOKEN SECURITY:
- Read token from .env file silently
- Never display token values in output
- Show first 4 chars max to confirm loading

---

## DAILY CHECKLIST (run at start of every session)

[ ] Read CLAUDE.md in both repos
[ ] Check for new components in src/components/
[ ] Check for new scripts in src/scripts/
[ ] Check public/_redirects for current routing rules
[ ] Check wrangler.toml for current env/binding config
[ ] Confirm CLOUDFLARE_API_TOKEN is loadable from .env
[ ] Run npx wrangler whoami before any deploy

Commit both CLAUDE.md files:

cd C:\code\textos-web
git add CLAUDE.md
git commit -m "Add daily architecture review and role definitions to CLAUDE.md"
git push

cd C:\code\textos-agent
git add CLAUDE.md  
git commit -m "Add daily architecture review and role definitions to CLAUDE.md"
git push

Report both commit hashes. Then stop.