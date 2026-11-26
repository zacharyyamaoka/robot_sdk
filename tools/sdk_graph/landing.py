"""Does a package have a landing page? robot-sdk.toml's `[links] site`, fetched, and linked from the README.

WHY (Zach, 2026-11-25): "All the packages in robot sdk should have a landing page they link to ... the health of the
package is only good IF it does have this". So the check is three questions, each with a plain-words reason:

1. robot-sdk.toml declares `[links] site = "https://…"`, and it is not a GitHub page (a README is not a landing page);
2. the URL answers 200 with real HTML: not a 404, not a placeholder ("Coming soon", GitHub Pages' "Site not found",
   a near-empty page), not JSON;
3. the package's README links to it, so a reader who lands on GitHub or PyPI can find it.

WHY a Cloudflare Access redirect is `warn`, not `fail` or `pass`: a private page behind Access (Zach's
<repo>.zacharyyamaoka.com convention) exists, but this checker can't see its content, so it is present-and-flagged.
WHY unknown never passes (as everywhere in health.py): no answer from the page, or no README read, is `unknown`.
WHY stdlib only, redirects followed by hand: urllib would silently follow a 302 to the Access login page and report 200.
"""

from __future__ import annotations

import dataclasses
import html
import re
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable

TIMEOUT_S = 20
AGENT = "robot-sdk-landing-check/1"
MAX_REDIRECTS = 5
MIN_TEXT = 200  # visible characters: below this a page says nothing a landing page should
NO_README = object()  # the repo has no README.md (distinct from None: not read)
PLACEHOLDERS = (
    "coming soon", "under construction", "site not found", "there isn't a github pages site here", "page not found",
    "404 not found", "hello world", "lorem ipsum", "it works!", "welcome to nginx",
)  # fmt: skip
GITHUB_HOSTS = ("github.com", "www.github.com", "raw.githubusercontent.com")


@dataclasses.dataclass
class Page:
    status: int | None  # the last HTTP status (a 3xx when it stopped at an Access redirect), None = no answer
    url: str  # where it ended
    content_type: str | None
    text: str | None
    reason: str
    access: str | None = None  # the Cloudflare Access host it redirected to, if any


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):  # noqa: ANN002, ANN003
        return None


def _host(url: str) -> str:
    return (urllib.parse.urlsplit(url).hostname or "").lower()


def is_access(url: str) -> bool:
    return _host(url).endswith(".cloudflareaccess.com") or "/cdn-cgi/access/" in url


def fetch_page(url: str) -> Page:
    """GET `url`, following up to five redirects by hand; stops at a Cloudflare Access login. Never raises."""
    opener = urllib.request.build_opener(_NoRedirect)
    here = url
    for _ in range(MAX_REDIRECTS + 1):
        request = urllib.request.Request(here, headers={"User-Agent": AGENT, "Accept": "text/html,*/*"})
        try:
            with opener.open(request, timeout=TIMEOUT_S) as response:
                body = response.read(2_000_000).decode(response.headers.get_content_charset() or "utf-8", "replace")
                return Page(response.status, here, response.headers.get("Content-Type"), body, "ok")
        except urllib.error.HTTPError as error:
            location = error.headers.get("Location") if error.headers else None
            if error.code in (301, 302, 303, 307, 308) and location:
                there = urllib.parse.urljoin(here, location)
                if is_access(there):
                    return Page(error.code, there, None, None, f"HTTP {error.code} to Cloudflare Access", _host(there))
                here = there
                continue
            try:
                body = error.read(200_000).decode("utf-8", "replace")
            except Exception:  # noqa: BLE001
                body = None
            return Page(error.code, here, error.headers.get("Content-Type") if error.headers else None, body,
                        f"HTTP {error.code}")  # fmt: skip
        except (urllib.error.URLError, TimeoutError, OSError, ValueError) as error:
            return Page(None, here, None, None, f"{type(error).__name__}: {getattr(error, 'reason', error)}")
    return Page(None, here, None, None, f"more than {MAX_REDIRECTS} redirects")


def visible(text: str) -> tuple[str, str]:
    """(title, visible text) of an HTML page: scripts, styles and tags dropped, whitespace collapsed."""
    title = re.search(r"<title[^>]*>(.*?)</title>", text, re.I | re.S)
    body = re.sub(r"<(script|style|noscript|template)\b.*?</\1\s*>", " ", text, flags=re.I | re.S)
    body = re.sub(r"<[^>]+>", " ", body)
    clean = lambda s: re.sub(r"\s+", " ", html.unescape(s)).strip()  # noqa: E731
    return clean(title.group(1)) if title else "", clean(body)


def _core(url: str) -> str:
    """A URL without its scheme and trailing slash, host lowercased: what a README link must contain."""
    parts = urllib.parse.urlsplit(url.strip())
    return (parts.netloc.lower() + parts.path).rstrip("/") + (f"?{parts.query}" if parts.query else "")


def readme_links(readme: str, url: str) -> bool:
    """Does the README link `url` (http or https, with or without a trailing slash)?"""
    core = re.escape(_core(url))
    return re.search(rf"https?://{core}/?(?=$|[\s)\]\"'<>#?])", readme, re.I | re.M) is not None


def page_verdict(url: str, page: Page) -> tuple[str, str]:
    """(state, plain-words reason) for what the landing URL answered."""
    if page.access:
        return "warn", f"{url} is private: it redirects to a Cloudflare Access login ({page.access}); content not checked"
    if page.status is None:
        return "unknown", f"{url} did not answer ({page.reason})"
    if _host(page.url) in GITHUB_HOSTS:
        return "fail", f"{url} lands on a GitHub page ({page.url}), not a landing page"
    if page.status != 200:
        return "fail", f"{url} answers HTTP {page.status}, not a page"
    if "html" not in (page.content_type or "").lower():
        return "fail", f"{url} is not an HTML page ({page.content_type or 'no content type'})"
    title, text = visible(page.text or "")
    said = f"{title} {text}".lower()
    hit = next((p for p in PLACEHOLDERS if p in title.lower() or (len(text) < 2000 and p in said)), None)
    if hit:
        return "fail", f"{url} is a placeholder page (says {hit!r})"
    if len(text) < MIN_TEXT and not title:
        return "fail", f"{url} is a placeholder page ({len(text)} characters of text, no title)"
    if len(text) < MIN_TEXT // 4:
        return "fail", f"{url} is a placeholder page (only {len(text)} characters of text)"
    return "pass", f"{url} answers 200 with a real page ({title or 'untitled'!s})"


def landing_check(links: dict[str, str], fetch: Callable[[str], Page] | None, readme: object) -> dict:
    """The `landing` health cell. `fetch` None = offline (the page is not fetched); `readme` is the README text,
    NO_README when the repo has none, or None when it could not be read."""
    url = (links or {}).get("site")
    if not url:
        return {"state": "fail", "detail": "no landing page: robot-sdk.toml has no [links] site = \"https://…\"",
                "url": None, "readme": None}  # fmt: skip
    base = {"url": url}
    if _host(url) in GITHUB_HOSTS:
        return {"state": "fail", "detail": f"[links] site is a GitHub page ({url}); a README is not a landing page",
                **base, "readme": None}  # fmt: skip
    if fetch is None:
        page_state, page_detail, page = "unknown", f"{url} not fetched (offline; check --online fetches it)", None
    else:
        page = fetch(url)
        page_state, page_detail = page_verdict(url, page)
    if readme is None:
        readme_state, readme_detail, linked = "unknown", "README not read", None
    elif readme is NO_README:
        readme_state, readme_detail, linked = "warn", "the repo has no README.md to link it from", False
    else:
        linked = readme_links(str(readme), url)
        readme_state = "pass" if linked else "warn"
        readme_detail = "README links to it" if linked else "README does not link to it"
    states = (page_state, readme_state)
    state = next(s for s in ("fail", "warn", "unknown", "pass") if s in states)
    # WHY the worse reason first: the cell's detail is what the Health page shows in one line.
    order = sorted([(page_state, page_detail), (readme_state, readme_detail)],
                   key=lambda x: ("fail", "warn", "unknown", "pass").index(x[0]))  # fmt: skip
    cell = {"state": state, "detail": "; ".join(d for _, d in order), **base, "readme": linked}
    if page is not None:
        cell["http"] = page.status
        if page.access:
            cell["private"] = True
    return cell
