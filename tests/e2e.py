"""Exercise the built extension against local fixtures, without AI calls or credentials.

Run `npm run build:local`, then `uv run --with playwright python tests/e2e.py`.
The fixtures deliberately omit CORS headers to exercise the extension's actual host permissions.
"""

import base64
import json
import os
from pathlib import Path
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from playwright.sync_api import expect, sync_playwright


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "test-results"
OUT.mkdir(exist_ok=True)
WORKSPACE = "00000000-0000-4000-8000-000000000001"
ITEM = "00000000-0000-4000-8000-000000000002"
REQUESTS = []
COUNTS = {"create": 0, "attach": 0}
SOURCE = "https://evidence.example/checked"
# A real 1 × 1 PNG, so the panel's preview renders like a chosen photo.
PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==")


def encode(value):
    return base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip("=")


TOKEN = f"{encode({'alg': 'test'})}.{encode({'exp': int(time.time()) + 900})}.fixture"
RESULT = {
    "kind": "text",
    "summary": "<img src=x onerror=alert(1)> reste du texte, pas du HTML.",
    "claims": ["Madagascar quitte l’OMS"],
    "signals": [],
    "results": [
        {"n": 1, "kind": "fact-check", "title": "Une source vérifiable", "url": SOURCE, "snippet": "Le pays reste membre."},
        {"n": 2, "kind": "web", "title": "Lien dangereux", "url": "javascript:alert(1)", "snippet": "Jamais ouvert."},
    ],
    "analysis": {
        "verdict": "false", "reason": "Le pays reste membre selon les éléments retrouvés.",
        "evidence": [{"result": 1, "stance": "contradicts", "quote": "Le pays reste membre."}],
        "missing": "Vérifier le communiqué officiel.",
    },
}
PUBLIC_RESULT = {
    "url": None, "kind": "text", "title": "", "excerpt": "Madagascar quitte l’OMS",
    "published_at": None, "days_old": None, "needs_text": False,
    "published": [{
        "id": ITEM, "ref": "FAN-0001", "title": "Madagascar quitte l’OMS",
        "verdict": "false", "reason": "Une vérification publiée à comparer au passage sélectionné.",
        "post": None, "sources": ["Source publique"], "origin": "press", "first_seen_at": None,
        "published_at": "2026-11-02T08:00:00Z", "newsroom": {"name": "Rédaction publique", "slug": "publique"},
    }],
    "results": [
        {"n": 1, "kind": "fact-check", "title": "Une source vérifiable", "url": SOURCE,
         "snippet": "<img src=x onerror=alert(1)> reste du texte, pas du HTML.", "date": None,
         "read_status": "read", "passages": ["Un passage effectivement lu dans la source."], "wording_overlap": True, "similar_to": [], "older_than_claim": False},
        {"n": 2, "kind": "web", "title": "Lien dangereux", "url": "javascript:alert(1)", "snippet": "Jamais ouvert.", "date": None},
    ],
    "preparation": {"method": "ai", "summary": "Madagascar quitte l’OMS", "claims": ["Madagascar quitte l’OMS"], "entities": ["Madagascar", "OMS"], "queries": ["Madagascar OMS"], "warning": None, "cached": False},
    "search_status": "ok",
    "searches": [{"kind": "web", "query": "Madagascar OMS", "status": "ok", "count": 2, "duration_ms": 25}],
}


class Fixture(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def send(self, body, status=200, content_type="application/json", headers=None):
        data = body if isinstance(body, bytes) else json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        for name, value in (headers or {}).items():
            self.send_header(name, value)
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        REQUESTS.append(("GET", self.path, None))
        if self.path == "/connexion":
            self.send(b"<!doctype html><title>Fixture sign-in</title><p>Connected</p>", content_type="text/html", headers={"Set-Cookie": "fanilo-fixture=connected; HttpOnly; SameSite=Lax; Path=/"})
        elif self.path == "/api/auth/token":
            if "fanilo-fixture=connected" not in self.headers.get("Cookie", ""):
                self.send({}, 401)
            else:
                self.send({"token": TOKEN})
        elif self.path == "/api/v1/me":
            assert self.headers.get("Authorization") == f"Bearer {TOKEN}"
            self.send({"id": "fixture", "name": "Rédaction de test", "email": "fixture@example.test", "memberships": [{"workspace_id": WORKSPACE, "name": "Rédaction démo", "slug": "demo", "role": "journalist"}]})
        else:
            self.send({}, 404)

    def do_POST(self):
        raw = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        kind = self.headers.get("Content-Type", "")
        data = {"type": kind, "bytes": raw} if kind.startswith("image/") else json.loads(raw)
        REQUESTS.append(("POST", self.path, data))
        if self.path.startswith("/api/v1/public/"):
            assert not self.headers.get("Authorization"), "Public checks must not send a token"
        else:
            assert self.headers.get("Authorization") == f"Bearer {TOKEN}"
        assert not self.headers.get("Cookie"), "Website cookies must not go to the API"
        if self.path in ("/api/v1/public/check", "/api/v1/public/check/stream"):
            if data.get("text") == "LIMIT":
                return self.send({}, 429)
            if data.get("text") == "NOTREADY":
                return self.send({}, 404)
            result = {**PUBLIC_RESULT}
            if data.get("text") == "NEW":
                result["published"] = []
            if data.get("text") == "BLOCKED":
                result.update(published=[], results=[], preparation={"method": "fallback", "summary": "BLOCKED", "claims": [], "entities": [], "queries": ["BLOCKED"], "warning": "disabled", "cached": False}, search_status="unavailable", searches=[{"kind": "web", "query": "BLOCKED", "status": "blocked", "count": 0, "duration_ms": 10}])
            if self.path.endswith("/stream"):
                events = [
                    ("step", {"key": "read", "status": "running"}),
                    ("step", {"key": "read", "status": "done"}),
                    ("step", {"key": "claims", "status": "running"}),
                    ("preparation", result["preparation"]),
                    ("step", {"key": "claims", "status": "done"}),
                    ("step", {"key": "search", "status": "running"}),
                    ("step", {"key": "search", "status": "failed" if result["search_status"] == "unavailable" else "done", "count": len(result["results"]), "search_status": result["search_status"]}),
                ]
                if result["results"]:
                    events += [("step", {"key": "verdict", "status": "running"}), ("step", {"key": "verdict", "status": "done", "count": 1})]
                events += [("result", result), ("done", {})]
                raw = "".join(f"event: {name}\r\ndata: {json.dumps(value, ensure_ascii=False)}\r\n\r\n" for name, value in events).encode()
                return self.send(raw, content_type="text/event-stream")
            return self.send(result)
        if self.path.endswith("/link-check"):
            if data.get("text") == "AUTH":
                return self.send({}, 401)
            if data.get("text") == "LIMIT":
                return self.send({}, 429)
            events = [
                ("step", {"key": "read", "status": "running", "summary": ""}),
                ("step", {"key": "read", "status": "done", "summary": "Texte lu"}),
                ("step", {"key": "claims", "status": "done", "summary": "Une affirmation"}),
                ("step", {"key": "search", "status": "running", "summary": "OMS Madagascar"}),
                ("step", {"key": "search", "status": "done", "summary": "Une source"}),
                ("step", {"key": "verdict", "status": "done", "summary": "false"}),
                ("result", RESULT),
            ]
            if data.get("text") != "INCOMPLETE":
                events.append(("done", {"steps": 4}))
            raw = "".join(f"event: {name}\r\ndata: {json.dumps(value, ensure_ascii=False)}\r\n\r\n" for name, value in events).encode()
            return self.send(raw, content_type="text/event-stream")
        if self.path.endswith("/image-check/file"):
            return self.send({
                "url": None, "source": "file", "assessment": "none",
                "image": {"width": 1, "height": 1, "format": "PNG", "ai_markers": [], "content_credentials": False, "exif": {}},
                "detector": {"status": "not_configured", "assessment": "inconclusive", "model": None},
                "reverse_search": [{"name": "TinEye", "url": "https://tineye.com/"}],
                "limitations": ["absence_of_markers_does_not_prove_authenticity"],
            })
        if self.path.endswith("/image-check"):
            return self.send({
                "url": data["url"], "assessment": "none",
                "image": {"width": 800, "height": 600, "format": "JPEG", "ai_markers": [], "content_credentials": True, "exif": {}},
                "detector": {"status": "not_configured", "assessment": "inconclusive", "model": None},
                "reverse_search": [{"name": "Google Lens", "url": "https://lens.google.com/uploadbyurl?url=https%3A%2F%2Fimage.example%2Fa.jpg"}],
                "limitations": ["absence_of_markers_does_not_prove_authenticity"],
            })
        if self.path.endswith("/copilot/act"):
            if data["kind"] == "create_claim":
                COUNTS["create"] += 1
                return self.send({"item_id": ITEM, "ref": "FAN-0001"})
            COUNTS["attach"] += 1
            if COUNTS["attach"] == 1:
                return self.send({}, 503)
            return self.send({"item_id": ITEM, "ref": "FAN-0001"})
        self.send({}, 404)


def capture(panel, text, kind="text", url=""):
    panel.evaluate("""async ({text,kind,url}) => {
      const win = await chrome.windows.getCurrent();
      await chrome.storage.session.set({[`capture:${win.id}`]: {
        id: crypto.randomUUID(), kind, text, url,
        pageUrl: 'https://news.example/article?source=fixture',
        createdAt: Date.now(), truncated: false
      }});
    }""", {"text": text, "kind": kind, "url": url})
    expect(panel.locator("#content" if kind == "text" else "#content-url")).to_have_value(text if kind == "text" else url)


def main():
    servers = [ThreadingHTTPServer(("localhost", port), Fixture) for port in (3000, 8000)]
    for server in servers:
        threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        temporary_root = os.environ.get("RUNNER_TEMP") or ("/tmp/opencode" if Path("/tmp/opencode").is_dir() else None)
        with sync_playwright() as p, tempfile.TemporaryDirectory(prefix="fanilo-extension-", dir=temporary_root) as profile:
            installed = sorted((Path.home() / ".cache/ms-playwright").glob("chromium-*/chrome-linux*/chrome"))
            executable = os.environ.get("CHROMIUM_EXECUTABLE") or (str(installed[-1]) if installed else None)
            extension = ROOT / "dist-local"
            assert (extension / "manifest.json").exists(), "Run npm run build:local first"
            context = p.chromium.launch_persistent_context(profile, channel="chromium", executable_path=executable, headless=True, viewport={"width": 400, "height": 900}, args=[f"--disable-extensions-except={extension}", f"--load-extension={extension}"])
            browser_requests = []
            context.on("request", lambda request: browser_requests.append((request.method, request.url)))
            try:
                worker = context.service_workers[0] if context.service_workers else context.wait_for_event("serviceworker")
                extension_id = worker.url.split("/")[2]
                panel = context.new_page()
                errors = []
                panel.on("pageerror", lambda error: errors.append(str(error)))
                panel.goto(f"chrome-extension://{extension_id}/sidepanel.html")
                panel.wait_for_load_state("networkidle")
                expect(panel.get_by_text("Accessible sans compte", exact=True)).to_be_visible()
                expect(panel.get_by_role("button", name="Vérifier ce contenu", exact=True)).to_be_enabled()
                expect(panel.get_by_text("Connectez votre rédaction", exact=True)).to_have_count(0)
                # Observe this browser context, not unrelated clients probing the local ports.
                assert not [r for r in browser_requests if r[1].startswith("http")], browser_requests
                manifest = panel.evaluate("chrome.runtime.getManifest()")
                assert set(manifest["permissions"]) == {"contextMenus", "sidePanel", "storage"}
                assert "content_scripts" not in manifest and "externally_connectable" not in manifest

                panel.screenshot(path=str(OUT / "panel-ready.png"), full_page=True)

                capture(panel, "Madagascar quitte l’OMS")
                expect(panel.get_by_label("L’affirmation à vérifier", exact=True)).to_have_value("Madagascar quitte l’OMS")
                assert not [r for r in browser_requests if r[0] == "POST"], "Capture must not start analysis automatically"
                panel.get_by_role("button", name="Vérifier ce contenu", exact=True).click()
                expect(panel.get_by_role("heading", name="Vérifications publiées sur des sujets proches", exact=True)).to_be_visible()
                payload = next(r[2] for r in REQUESTS if r[1] == "/api/v1/public/check/stream")
                assert payload == {"text": "Madagascar quitte l’OMS"}
                expect(panel.locator("#outcome")).to_contain_text("<img src=x onerror=alert(1)>")
                assert panel.locator("#outcome img").count() == 0
                assert panel.locator('a[href^="javascript:"]').count() == 0
                expect(panel.get_by_role("heading", name="Recherches préparées", exact=True)).to_be_visible()
                expect(panel.locator(".prepared-queries")).to_contain_text("Madagascar OMS")
                expect(panel.locator(".read-passage")).to_contain_text("Un passage effectivement lu")
                expect(panel.get_by_text("Texte très proche de la publication sélectionnée : une reprise est possible. Cela ne suffit pas à établir une confirmation indépendante.", exact=True)).to_be_visible()
                assert "solid" in panel.locator(".published-verdict").evaluate("node => getComputedStyle(node).borderTopStyle")
                assert not [r for r in browser_requests if "/api/auth/" in r[1]], "Public verification must not call authentication"
                assert panel.locator("button.action").count() == 1
                for width in (320, 400, 480):
                    panel.set_viewport_size({"width": width, "height": 900})
                    assert panel.evaluate("document.documentElement.scrollWidth <= innerWidth"), f"Overflow at {width}px"
                panel.set_viewport_size({"width": 400, "height": 900})
                panel.screenshot(path=str(OUT / "panel-text.png"), full_page=True)
                panel.emulate_media(color_scheme="dark")
                panel.screenshot(path=str(OUT / "panel-text-dark.png"), full_page=True)
                panel.emulate_media(color_scheme="light")

                capture(panel, "", "image", "https://image.example/a.jpg")
                panel.get_by_role("button", name="Examiner l’image", exact=True).click()
                expect(panel.get_by_role("heading", name="Aucun indice détecté", exact=True)).to_be_visible()
                expect(panel.get_by_text("Aucun détecteur de pixels configuré. Seules les métadonnées ont été examinées.", exact=True)).to_be_visible()
                expect(panel.get_by_text("Structure Content Credentials repérée, signature non vérifiée. Sa présence ne prouve pas l’authenticité.", exact=True)).to_be_visible()
                assert not panel.locator("#outcome").inner_text().count("%")
                assert not [r for r in browser_requests if "/api/auth/" in r[1]], "Public image examination must not call authentication"
                panel.screenshot(path=str(OUT / "panel-image.png"), full_page=True)

                # An image without a public link: chosen as a file, then pasted as a screenshot.
                panel.get_by_role("button", name="Effacer", exact=True).click()
                panel.locator("#image-file").set_input_files({"name": "photo-whatsapp.png", "mimeType": "image/png", "buffer": PNG})
                expect(panel.get_by_role("group", name="Image choisie")).to_contain_text("photo-whatsapp.png")
                assert not [r for r in REQUESTS if r[1].endswith("/image-check/file")], "Choosing a file must not send it"
                panel.screenshot(path=str(OUT / "panel-image-file-chosen.png"), full_page=True)
                panel.get_by_role("button", name="Examiner l’image", exact=True).click()
                expect(panel.get_by_role("heading", name="Aucun indice détecté", exact=True)).to_be_visible()
                sent = [r for r in REQUESTS if r[1] == "/api/v1/public/image-check/file"]
                assert len(sent) == 1 and sent[0][2] == {"type": "image/png", "bytes": PNG}, sent
                expect(panel.get_by_text("L’image a été envoyée comme fichier : ces services ne reçoivent rien de Checky. Ouvrez-en un et déposez-y l’image vous-même.", exact=True)).to_be_visible()
                expect(panel.get_by_role("link", name="Ouvrir l’image d’origine")).to_have_count(0)
                assert not [r for r in browser_requests if "/api/auth/" in r[1]], "Public file examination must not call authentication"
                panel.screenshot(path=str(OUT / "panel-image-file.png"), full_page=True)
                panel.get_by_role("button", name="Retirer", exact=True).click()
                panel.locator("#image-file").set_input_files({"name": "lourde.png", "mimeType": "image/png", "buffer": b"\0" * (5 * 1024 * 1024 + 1)})
                expect(panel.get_by_role("alert")).to_contain_text("dépasse 5 Mo")
                panel.get_by_role("button", name="Texte", exact=True).click()
                panel.evaluate("""(bytes) => {
                  const data = new DataTransfer();
                  data.items.add(new File([new Uint8Array(bytes)], "capture.png", { type: "image/png" }));
                  document.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true }));
                }""", list(PNG))
                expect(panel.get_by_role("button", name="Image", exact=True)).to_have_attribute("aria-pressed", "true")
                expect(panel.get_by_role("group", name="Image choisie")).to_contain_text("capture.png")
                assert len([r for r in REQUESTS if r[1].endswith("/image-check/file")]) == 1, "Only the confirmed file is sent"
                for width in (320, 400):
                    panel.set_viewport_size({"width": width, "height": 900})
                    assert panel.evaluate("document.documentElement.scrollWidth <= innerWidth"), f"Overflow at {width}px"
                panel.set_viewport_size({"width": 400, "height": 900})
                panel.emulate_media(color_scheme="dark")
                panel.screenshot(path=str(OUT / "panel-image-file-dark.png"), full_page=True)
                panel.emulate_media(color_scheme="light")

                capture(panel, "BLOCKED")
                panel.get_by_role("button", name="Vérifier ce contenu", exact=True).click()
                expect(panel.locator(".search-status")).to_contain_text("Recherche indisponible")
                assert "0 sources retrouvées" not in panel.locator(".work-log").text_content()
                expect(panel.get_by_text("Aucune source retrouvée pour cette analyse.", exact=True)).to_have_count(0)
                panel.screenshot(path=str(OUT / "panel-search-blocked.png"), full_page=True)

                capture(panel, "NEW")
                panel.get_by_role("button", name="Vérifier ce contenu", exact=True).click()
                expect(panel.get_by_role("heading", name="Pas de verdict publié retrouvé", exact=True)).to_be_visible()
                expect(panel.get_by_role("heading", name="Sources retrouvées", exact=True)).to_be_visible()
                panel.get_by_role("button", name="Enregistrer dans une rédaction", exact=True).click()
                expect(panel.get_by_text("Connectez votre rédaction", exact=True)).to_be_visible()
                assert not [r for r in browser_requests if "/api/auth/" in r[1]] and COUNTS["create"] == 0
                website = context.new_page()
                website.goto("http://localhost:3000/connexion")
                panel.bring_to_front()
                panel.get_by_role("button", name="Actualiser la connexion", exact=True).click()
                expect(panel.get_by_label("Rédaction", exact=True)).to_be_visible()
                expect(panel.get_by_role("heading", name="Pas de verdict publié retrouvé", exact=True)).to_be_visible()
                panel.locator(".source input[type=checkbox]").check()
                panel.get_by_role("button", name="Suivre dans ma rédaction", exact=True).click()
                expect(panel.get_by_text("Le dossier est créé, mais certaines sources n’ont pas pu être jointes. Réessayez sans recréer le dossier.", exact=True)).to_be_visible()
                panel.get_by_role("button", name="Réessayer les sources manquantes", exact=True).click()
                expect(panel.get_by_role("button", name="Réessayer les sources manquantes", exact=True)).to_have_count(0)
                assert COUNTS["create"] == 1 and COUNTS["attach"] >= 3

                panel.get_by_role("button", name="Ma rédaction", exact=True).click()
                expect(panel.get_by_label("Rédaction", exact=True)).to_be_visible()
                capture(panel, "Madagascar quitte l’OMS")
                panel.get_by_role("button", name="Vérifier ce contenu", exact=True).click()
                expect(panel.get_by_role("heading", name="Faux", exact=True)).to_be_visible()
                assert "dashed" in panel.locator(".verdict").evaluate("node => getComputedStyle(node).borderTopStyle")
                capture(panel, "INCOMPLETE")
                panel.get_by_role("button", name="Vérifier ce contenu", exact=True).click()
                expect(panel.get_by_role("alert")).to_contain_text("interrompue")
                expect(panel.get_by_role("button", name="Suivre dans ma rédaction", exact=True)).to_have_count(0)
                public_before = len([r for r in browser_requests if "/api/v1/public/" in r[1]])
                capture(panel, "AUTH")
                panel.get_by_role("button", name="Vérifier ce contenu", exact=True).click()
                expect(panel.get_by_role("alert")).to_contain_text("session a expiré")
                assert len([r for r in browser_requests if "/api/v1/public/" in r[1]]) == public_before, "Never silently fall back to public processing on auth failure"
                panel.get_by_role("button", name="Déconnecter l’extension", exact=True).click()
                expect(panel.get_by_text("Accessible sans compte", exact=True)).to_be_visible()
                capture(panel, "LIMIT")
                panel.get_by_role("button", name="Vérifier ce contenu", exact=True).click()
                expect(panel.get_by_role("alert")).to_contain_text("Trop d’analyses")
                capture(panel, "NOTREADY")
                panel.get_by_role("button", name="Vérifier ce contenu", exact=True).click()
                expect(panel.get_by_role("alert")).to_contain_text("service public n’est pas encore disponible")
                stores = panel.evaluate("""async () => ({session: await chrome.storage.session.get(null), local: await chrome.storage.local.get(null), sync: await chrome.storage.sync.get(null)})""")
                assert not stores["local"] and not stores["sync"] and "fanilo-auth" not in stores["session"]
                assert not errors, errors
                print("PASS: anonymous text/images without token requests, published-vs-new claim distinction, optional login preserving public result, private SSE, safe DOM, source retry, image caveats, image files and pasted captures sent only on confirmation, responsive light/dark, no silent public fallback, session-only storage")
            finally:
                context.close()
    finally:
        for server in servers:
            server.shutdown()
            server.server_close()


if __name__ == "__main__":
    main()
