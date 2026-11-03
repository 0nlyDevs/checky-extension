"""« Veille sur la page » and the Checky bubble, driven in the built extension.

Run `npm run build:local`, then `uv run --with playwright python tests/e2e_watch.py`.
Facebook and TikTok are saved local copies (tests/fixtures) served at their real addresses through
Playwright routing: no real account, no request to facebook.com or tiktok.com. The newsroom API is
a local stub on the build's ports (3000/8000; set WATCH_PORTS=3157,8157 with a matching build to
run beside a local Checky). Set MATCH_UPSTREAM=http://localhost:8000 to answer `/public/match` from
a real Checky API instead of the stub. Screenshots go to `test-results/`.

The browser cannot click its own permission prompt in automation, so the test loads a copy of the
build whose optional Facebook/TikTok hosts are already granted; `chrome.permissions.request` then
resolves without a prompt, and every other path is the real one.
"""

import json
import os
import re
import shutil
import tempfile
import threading
import time
import unicodedata
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "test-results"
OUT.mkdir(exist_ok=True)
FIXTURES = ROOT / "tests" / "fixtures"
WEB_PORT, API_PORT = (int(p) for p in os.environ.get("WATCH_PORTS", "3000,8000").split(","))
UPSTREAM = os.environ.get("MATCH_UPSTREAM", "")
WORKSPACE = "00000000-0000-4000-8000-000000000001"
REQUESTS = []
VERDICT = {
    "id": "a2ec588e-dba4-4676-8a52-c4332cb9089f", "ref": "FAN-0145",
    "title": "72 heures de délestage dès demain sur tout Antananarivo, selon la JIRAMA",
    "verdict": "misleading",
    "reason": "Le communiqué de la JIRAMA prévoit 4 heures de délestage par jour, pas 72. La vidéo date de mars 2023. (démo)",
    "post": None, "sources": ["Démo · La vidéo retrouvée en ligne le 14 mars 2023 (exemple fictif)"], "origin": "facebook",
    "first_seen_at": "2026-11-01T23:47:00+03:00", "published_at": "2026-11-03T00:40:51Z",
    "newsroom": {"slug": "journal-du-matin", "name": "Journal du matin"}, "signed_at": "2026-11-03T00:40:51Z",
}
STOP = {"les", "des", "une", "le", "la", "de", "du", "et", "en", "au", "aux", "pour", "par", "sur", "dans", "que", "qui", "est", "sont", "ce", "cette", "ces", "avec", "plus", "pas", "selon", "tout", "dès"}


def words(text):
    folded = "".join(c for c in unicodedata.normalize("NFKD", text.lower()) if not unicodedata.combining(c))
    return {w for w in re.findall(r"[a-z0-9]{3,}", folded) if w not in STOP}


class Stub(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def send(self, body, status=200):
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        REQUESTS.append(("GET", self.path, None))
        if self.path == "/api/auth/token":
            claims = json.dumps({"exp": int(time.time()) + 900}).encode()
            import base64
            part = base64.urlsafe_b64encode(claims).decode().rstrip("=")
            return self.send({"token": f"eyJhbGciOiJ0ZXN0In0.{part}.fixture"})
        if self.path == "/api/v1/me":
            return self.send({"id": "fixture", "name": "Rédaction de test", "email": "fixture@example.test", "memberships": [{"workspace_id": WORKSPACE, "name": "Journal du matin (démo)", "slug": "demo", "role": "journalist"}]})
        if self.path == f"/api/v1/workspaces/{WORKSPACE}/signals":
            assert self.headers.get("Authorization", "").startswith("Bearer "), "Watched words need the newsroom's token"
            return self.send([
                {"id": "1", "word": "cyclone", "active": True, "hits": 0, "created_at": "2026-11-02T08:00:00Z"},
                {"id": "2", "word": "enlèvement", "active": True, "hits": 0, "created_at": "2026-11-02T08:00:00Z"},
                {"id": "3", "word": "riz", "active": False, "hits": 0, "created_at": "2026-11-02T08:00:00Z"},
            ])
        self.send({}, 404)

    def do_POST(self):
        raw = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        data = json.loads(raw or b"{}")
        REQUESTS.append(("POST", self.path, data))
        if self.path == "/api/v1/public/match":
            assert not self.headers.get("Authorization"), "Verdict matching needs no account"
            assert not self.headers.get("Cookie")
            if UPSTREAM:
                request = urllib.request.Request(f"{UPSTREAM}/api/v1/public/match", data=raw, headers={"Content-Type": "application/json"})
                with urllib.request.urlopen(request, timeout=15) as response:
                    return self.send(json.loads(response.read()))
            asked, known = words(data["text"]), words(VERDICT["title"])
            shared = asked & known
            score = len(shared) / min(len(asked), len(known)) if len(shared) >= 2 else 0
            return self.send([{"score": round(score, 2), "verdict": VERDICT}] if score >= 0.4 else [])
        self.send({}, 404)


def ax_names(page):
    """Every accessible name on the page, closed shadow roots included (the page cannot read them)."""
    cdp = page.context.new_cdp_session(page)
    nodes = cdp.send("Accessibility.getFullAXTree")["nodes"]
    cdp.detach()
    return [n.get("name", {}).get("value", "") for n in nodes if n.get("name")]


def ax_click(page, name, role="button", hold=0):
    """Click an element inside our closed shadow root by its accessible name, at its real position."""
    cdp = page.context.new_cdp_session(page)
    try:
        nodes = cdp.send("Accessibility.getFullAXTree")["nodes"]
        node = next(n for n in nodes if n.get("role", {}).get("value") == role and name in n.get("name", {}).get("value", "") and n.get("backendDOMNodeId"))
        quad = cdp.send("DOM.getBoxModel", {"backendNodeId": node["backendDOMNodeId"]})["model"]["content"]
    finally:
        cdp.detach()
    x, y = (quad[0] + quad[4]) / 2, (quad[1] + quad[5]) / 2
    page.mouse.move(x, y)
    page.mouse.down()
    if hold:
        page.wait_for_timeout(hold)
    page.mouse.up()
    return x, y


def wait_names(page, *expected, timeout=8000):
    end = time.time() + timeout / 1000
    while time.time() < end:
        names = " | ".join(ax_names(page))
        if all(e in names for e in expected):
            return names
        page.wait_for_timeout(250)
    raise AssertionError(f"{expected} not in {names}")


def panel_with(context, text, wait):
    """The Checky panel page (side panel, or the tab fallback) whose card shows `text`."""
    for _ in range(40):
        for page in context.pages:
            if page.url.endswith("sidepanel.html") and text in (page.locator(".watch-card").all_inner_texts() or [""])[0]:
                return page
        wait(250)
    raise AssertionError(f"No panel shows a card with {text!r}")


def matches():
    return [r for r in REQUESTS if r[1] == "/api/v1/public/match"]


def main():
    build = ROOT / "dist-local"
    assert (build / "manifest.json").exists(), "Run npm run build:local first"
    manifest = json.loads((build / "manifest.json").read_text())
    assert manifest["optional_host_permissions"] == ["https://*.facebook.com/*", "https://*.tiktok.com/*"]
    assert not any("facebook" in h or "tiktok" in h for h in manifest["host_permissions"]), "Social hosts must stay optional"
    assert "content_scripts" not in manifest and "web_accessible_resources" not in manifest
    assert "scripting" in manifest["permissions"] and "tabs" not in manifest["permissions"]

    servers = [ThreadingHTTPServer(("localhost", port), Stub) for port in (WEB_PORT, API_PORT)]
    for server in servers:
        threading.Thread(target=server.serve_forever, daemon=True).start()
    with tempfile.TemporaryDirectory(prefix="checky-watch-") as tmp, sync_playwright() as p:
        extension = Path(tmp) / "extension"
        shutil.copytree(build, extension)
        granted = {**manifest, "host_permissions": manifest["host_permissions"] + manifest["optional_host_permissions"]}
        (extension / "manifest.json").write_text(json.dumps(granted))
        installed = sorted((Path.home() / ".cache/ms-playwright").glob("chromium-*/chrome-linux*/chrome"))
        context = p.chromium.launch_persistent_context(
            str(Path(tmp) / "profile"), channel="chromium", executable_path=os.environ.get("CHROMIUM_EXECUTABLE") or str(installed[-1]),
            headless=True, viewport={"width": 1280, "height": 800},
            args=[f"--disable-extensions-except={extension}", f"--load-extension={extension}", "--autoplay-policy=no-user-gesture-required"],
        )
        outside = []
        context.route("https://www.facebook.com/**", lambda route: route.fulfill(path=FIXTURES / "facebook-feed.html", content_type="text/html; charset=utf-8"))
        context.route("https://www.tiktok.com/**", lambda route: route.fulfill(path=FIXTURES / "tiktok-foryou.html", content_type="text/html; charset=utf-8") if route.request.resource_type == "document" else (outside.append(route.request.url), route.abort()))
        try:
            worker = context.service_workers[0] if context.service_workers else context.wait_for_event("serviceworker")
            extension_id = worker.url.split("/")[2]
            errors = []
            # Playwright cannot see the browser's side panel, so cards go to the panel opened as a tab
            # (the extension's own fallback). Step 9 checks the real side panel opening on a click.
            worker.evaluate("chrome.sidePanel.setOptions({ enabled: false })")

            # 1. Off: the Facebook tab is never read.
            feed = context.pages[0] if context.pages else context.new_page()
            feed.on("pageerror", lambda e: errors.append(str(e)))
            feed.goto("https://www.facebook.com/")
            feed.wait_for_timeout(1500)
            assert feed.locator("checky-badge").count() == 0
            assert not matches(), "Nothing is read while the watch is off"

            # 2. The panel: connect the newsroom, switch the watch on for the tab beside it.
            panel = context.new_page()
            panel.on("pageerror", lambda e: errors.append(str(e)))
            panel.set_viewport_size({"width": 400, "height": 900})
            panel.goto(f"chrome-extension://{extension_id}/sidepanel.html")
            expect(panel.get_by_role("heading", name="Veille sur la page")).to_be_visible()
            expect(panel.get_by_text("Veille arrêtée : aucune page n’est lue.")).to_be_visible()
            panel.screenshot(path=str(OUT / "watch-panel-off.png"), full_page=True)
            panel.get_by_role("button", name="Ma rédaction").click()
            expect(panel.locator("#workspace")).to_be_visible()
            feed.bring_to_front()
            panel.bring_to_front()
            panel.get_by_label("Cet onglet").check()
            panel.get_by_role("button", name="Activer la veille").click()
            expect(panel.get_by_role("button", name="Arrêter la veille")).to_be_visible()
            expect(panel.get_by_text("Veille active sur cet onglet · facebook.com")).to_be_visible()
            expect(panel.get_by_text("2 mots surveillés de votre rédaction")).to_be_visible()
            panel.screenshot(path=str(OUT / "watch-panel-on.png"), full_page=True)

            # 3. The feed: the JIRAMA rumour is badged with its signed verdict, the birthday is not.
            feed.bring_to_front()
            expect(feed.locator("checky-badge")).to_have_count(1, timeout=8000)
            wait_names(feed, "Déjà vérifié · Trompeur")
            first = matches()
            texts = [r[2]["text"] for r in first]
            assert len(texts) == len(set(texts)) <= 3, f"One call per distinct passage on screen: {texts}"
            sent = " ".join(texts)
            assert "Mon quartier n’a rien reçu" not in sent, "Comments nested in a post are not read as the post"
            feed.screenshot(path=str(OUT / "watch-facebook-badge.png"))

            # 4. Infinite scroll: the new post arrives and is badged for the watched word.
            feed.mouse.wheel(0, 4000)
            feed.wait_for_timeout(600)
            feed.mouse.wheel(0, 4000)
            expect(feed.locator("checky-badge")).to_have_count(2, timeout=8000)
            wait_names(feed, "Mot surveillé : cyclone")
            feed.screenshot(path=str(OUT / "watch-facebook-word.png"))
            before = len(matches())
            feed.mouse.wheel(0, -4000)
            feed.wait_for_timeout(1500)
            assert len(matches()) == before, "A post already matched is not sent again"

            # 5. One click on the badge opens the card in Checky, with the passage ready in the form.
            feed.mouse.wheel(0, -8000)
            feed.wait_for_timeout(400)
            ax_click(feed, "Déjà vérifié · Trompeur")
            target = panel_with(context, "Repéré sur facebook.com", feed.wait_for_timeout)
            expect(target.locator(".watch-card .published-verdict")).to_contain_text("Trompeur")
            expect(target.locator(".watch-card")).to_contain_text("Signé par Journal du matin")
            expect(target.locator("#content")).to_have_value(re.compile("72 heures de délestage"))
            assert not [r for r in REQUESTS if "/public/check" in r[1]], "The full check waits for « Vérifier ce contenu »"
            target.set_viewport_size({"width": 400, "height": 900})
            target.screenshot(path=str(OUT / "watch-panel-card.png"), full_page=True)

            # 6. The per-tab switch does not reach another tab.
            tiktok = context.new_page()
            tiktok.on("pageerror", lambda e: errors.append(str(e)))
            tiktok.goto("https://www.tiktok.com/foryou")
            tiktok.wait_for_timeout(1500)
            assert tiktok.locator("checky-bubble").count() == 0 and tiktok.locator("checky-badge").count() == 0

            # 7. Facebook and TikTok in every tab: the bubble sits on the playing reel.
            panel.bring_to_front()
            panel.get_by_role("button", name="Arrêter la veille").click()
            expect(feed.locator("checky-badge")).to_have_count(0, timeout=5000)
            panel.get_by_label("Facebook et TikTok, tous les onglets").check()
            panel.get_by_role("button", name="Activer la veille").click()
            expect(panel.get_by_text("Veille active sur Facebook et TikTok", exact=False)).to_be_visible()
            tiktok.bring_to_front()
            expect(tiktok.locator("checky-bubble")).to_have_count(1, timeout=8000)
            expect(tiktok.locator("checky-badge")).to_have_count(1, timeout=8000)
            wait_names(tiktok, "Vérifier cette vidéo avec Checky", "Déjà vérifié · Trompeur")
            box = tiktok.locator("#v1").bounding_box()
            x, y = ax_click(tiktok, "Vérifier cette vidéo avec Checky")
            assert box["x"] + box["width"] / 2 < x < box["x"] + box["width"] and box["y"] < y < box["y"] + box["height"], "The bubble sits on the right edge of the playing video"
            names = wait_names(tiktok, "Déjà vérifié", "Trompeur", "Par Journal du matin", "Voir tout", "@radio.tana.demo")
            assert "Image du moment" in names, "A same-origin frame is captured"
            tiktok.screenshot(path=str(OUT / "watch-tiktok-bubble.png"))
            assert not outside, f"No request to TikTok beyond the saved page: {outside}"

            # « Voir tout »: the panel gets the reel, its author, its link and the frame.
            _, see_y = ax_click(tiktok, "Voir tout")
            assert see_y < 800, "The card over the reel stays within the screen"
            reel = panel_with(context, "Repéré sur tiktok.com", tiktok.wait_for_timeout)
            reel.set_viewport_size({"width": 400, "height": 900})
            expect(reel.locator(".watch-card")).to_contain_text("Publié par @radio.tana.demo")
            expect(reel.locator(".watch-frame")).to_be_visible()
            expect(reel.locator(".source-origin a")).to_have_attribute("href", "https://www.tiktok.com/@radio.tana.demo/video/7432100000000000001")
            stored = worker.evaluate("chrome.storage.session.get(null)")
            assert not [k for k in stored if k.startswith("watch-card:")], "The frame does not stay in storage once the panel has it"
            reel.screenshot(path=str(OUT / "watch-panel-reel.png"), full_page=True)
            reel.get_by_role("button", name="Examiner l’image du moment").click()
            expect(reel.locator(".image-file")).to_contain_text("image-du-moment.jpg")
            assert not [r for r in REQUESTS if "image-check" in r[1]], "The frame is not sent before « Examiner l’image »"
            reel.get_by_role("button", name="Fermer la fiche").click()
            expect(reel.locator(".watch-card")).to_have_count(0)

            # 9. With the side panel available, « Voir tout » opens it from the click inside TikTok.
            def side_panels():
                cdp = tiktok.context.new_cdp_session(tiktok)
                found = [t for t in cdp.send("Target.getTargets")["targetInfos"] if t["url"].endswith("sidepanel.html")]
                cdp.detach()
                return len(found)
            worker.evaluate("chrome.sidePanel.setOptions({ enabled: true, path: 'sidepanel.html' })")
            tiktok.bring_to_front()
            before_panels, before_tabs = side_panels(), len(context.pages)
            ax_click(tiktok, "Vérifier cette vidéo avec Checky")
            wait_names(tiktok, "Voir tout")
            ax_click(tiktok, "Voir tout")
            tiktok.wait_for_timeout(1500)
            assert side_panels() == before_panels + 1, "The click's user gesture reaches chrome.sidePanel.open"
            assert len(context.pages) == before_tabs, "No fallback tab when the side panel opens"

            # Drag to the other edge, then a long press puts the bubble away for the session.
            tiktok.bring_to_front()
            x, y = ax_click(tiktok, "Vérifier cette vidéo avec Checky", hold=50)  # a tap reopens the card
            wait_names(tiktok, "Voir tout")
            ax_click(tiktok, "Fermer", role="button")
            tiktok.mouse.move(x, y)
            tiktok.mouse.down()
            tiktok.mouse.move(box["x"] + 40, y + 60, steps=8)
            tiktok.mouse.up()
            tiktok.wait_for_timeout(300)
            x2, _ = ax_click(tiktok, "Vérifier cette vidéo avec Checky")
            assert x2 < box["x"] + box["width"] / 2, "The dragged bubble snaps to the left edge"
            wait_names(tiktok, "Voir tout")
            tiktok.screenshot(path=str(OUT / "watch-tiktok-bubble-left.png"))
            ax_click(tiktok, "Fermer", role="button")
            ax_click(tiktok, "Vérifier cette vidéo avec Checky", hold=900)
            expect(tiktok.locator("checky-bubble")).to_have_count(0)
            tiktok.reload()
            tiktok.wait_for_timeout(2000)
            assert tiktok.locator("checky-bubble").count() == 0, "Hidden until the next session"
            assert tiktok.locator("checky-badge").count() == 1, "Badges keep working without the bubble"

            # 8. Off: everything leaves the pages and nothing more is read.
            panel.bring_to_front()
            panel.get_by_role("button", name="Arrêter la veille").click()
            expect(tiktok.locator("checky-badge")).to_have_count(0, timeout=5000)
            count = len(matches())
            feed.bring_to_front()
            feed.reload()
            feed.wait_for_timeout(2000)
            assert feed.locator("checky-badge").count() == 0 and len(matches()) == count
            assert not errors, errors
            print(f"ok: {len(matches())} match calls, screenshots in {OUT}")
        finally:
            context.close()
            for server in servers:
                server.shutdown()


if __name__ == "__main__":
    main()
